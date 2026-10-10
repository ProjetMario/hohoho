/** Tests only UI behavior. All writes/provider calls are intercepted, and all
 * microphone/camera inputs are synthetic. Does not validate a real Santa call.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { patchClient, SOURCE_PATH, PATCHED_PATH, VERSION } from './patch.mjs';

export async function verifyForm(origin = 'https://hohohosanta.app', inject = false) {
  assert.match(origin, /^https:\/\/(?:hohohosanta\.app|[a-f0-9]{24}--hohohosanta-live\.netlify\.app)$/);
  let patched;
  if (inject) {
    const response = await fetch(origin + SOURCE_PATH, {signal:AbortSignal.timeout(20000)});
    assert.equal(response.status, 200);
    patched = patchClient(await response.text());
  }
  const browser = await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const results = [];
  const cases = [
    {name:'desktop-enter',width:1280,action:'enter'},
    {name:'mobile-click',width:390,action:'click'},
    {name:'mobile-enter',width:390,action:'enter'},
    {name:'invalid-name-blocked',action:'invalid'},
    {name:'camera-optional-no-submit',action:'camera'},
    {name:'purchase-button-no-submit',action:'purchase'},
    {name:'microphone-cancel-late-track',action:'cancel',media:'pending'},
    {name:'microphone-timeout-late-track',action:'timeout',media:'pending'},
    {name:'microphone-denied-retry',action:'denied',media:'denied'},
    {name:'server-refusal-preserved',action:'refused',free:false,reason:'vpn'},
    {name:'used-trial-preserved',action:'refused',free:false,reason:'used'}
  ];
  try {
    for (const item of cases) {
      const writes = [], errors = [];
      const context = await browser.newContext({viewport:{width:item.width||1280,height:900},locale:'fr-FR',timezoneId:'Europe/Paris',serviceWorkers:'block'});
      try {
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (!['GET','HEAD'].includes(request.method())) {
            writes.push({path:url.pathname,method:request.method()});
            return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'FORM_TEST_STOP',error:'FORM_TEST_STOP: aucun appel réel.'})});
          }
          if (url.origin !== origin) return route.abort();
          if (inject && [SOURCE_PATH,PATCHED_PATH].includes(url.pathname)) return route.fulfill({status:200,contentType:'application/javascript',body:patched});
          const fixtures = {
            '/api/cloud-trial/config':{ready:true,preview:false,durationSeconds:30},
            '/api/cloud-trial/eligibility':{freeAvailable:item.free!==false,reason:item.reason||'available',durationSeconds:30},
            '/api/cloud-trial/purchase/config':{paidVideoAvailable:false,unavailableReason:'capacity_exhausted',priceCents:499,durationSeconds:300},
            '/api/site/locale':{language:'fr'},
            '/api/cloud-trial/locale':{language:'fr'}
          };
          if (fixtures[url.pathname]) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixtures[url.pathname])});
          return route.continue();
        });
        await context.addInitScript(mode => {
          window.__formTest = {media:[],tracks:[],mode};
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = constraints => {
            const state = window.__formTest;
            state.media.push({audio:!!constraints.audio,video:!!constraints.video});
            const obtain = async () => {
              const stream = await original(constraints);
              state.tracks.push(...stream.getTracks());
              return stream;
            };
            if (constraints.audio && state.mode === 'denied') return Promise.reject(new DOMException('Test permission denied','NotAllowedError'));
            if (constraints.audio && state.mode === 'pending') return new Promise(resolve => {state.resolveLate = async () => resolve(await obtain());});
            return obtain();
          };
        }, item.media||'normal');
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(origin+'/essai',{waitUntil:'networkidle',timeout:45000});
        assert.equal(response.status(),200);
        const prepare = page.getByRole('button',{name:/Je suis un adulte · Préparer l’appel|I am an adult · Prepare the call/});
        if (await prepare.count()) await prepare.click();
        const form = page.locator('form.trial-call-actions');
        await form.waitFor({state:'attached'});
        assert.equal(await form.getAttribute('data-form-fix'),VERSION);
        assert.equal(await page.locator('form form').count(),0,'No nested forms');
        const input = page.locator('#trial-child-name');
        const start = form.locator('button[type=submit]');
        const phase = () => page.locator('main.trial-video-call').getAttribute('data-phase');
        const waitPhase = value => page.waitForFunction(value => document.querySelector('main.trial-video-call')?.dataset.phase===value,value);
        const media = () => page.evaluate(()=>window.__formTest.media);
        assert.equal(await start.count(),1,'One native submit button');
        assert.equal(await input.evaluate(node=>node.form?.tagName),'FORM');
        if (item.action === 'refused') {
          const close = page.locator('dialog.trial-upgrade-dialog[open] .upgrade-close');
          if (await close.count()) await close.click();
          await input.fill('Camille');
          assert.equal(await start.isDisabled(),true,'Server refusal remains authoritative');
          assert.equal((await media()).length,0);
          assert.equal(writes.length,0);
        } else {
          assert.equal(await start.isDisabled(),true);
          await input.fill('Camille');
          await page.waitForFunction(()=>!document.querySelector('form.trial-call-actions button[type=submit]').disabled);
          const recording = form.locator('.trial-recording-option input');
          if (await recording.isEnabled()) await recording.uncheck();
          assert.equal(await start.isDisabled(),false,'Recording is optional');
          if (item.action === 'invalid') {
            for (const name of ['', ' ', '123']) {
              await input.fill(name);
              assert.equal(await start.isDisabled(),true);
              await input.press('Enter');
            }
            assert.equal((await media()).length,0);
            assert.equal(writes.length,0);
          } else if (item.action === 'camera') {
            await page.getByRole('button',{name:'Tester ma caméra',exact:true}).click();
            await page.waitForFunction(()=>window.__formTest.media.length===1);
            assert.deepEqual(await media(),[{audio:false,video:true}]);
            assert.equal(await phase(),'welcome');
            assert.equal(writes.length,0);
            await page.getByRole('button',{name:'Couper ma caméra',exact:true}).click();
          } else if (item.action === 'purchase') {
            await form.locator('.trial-upgrade-cta-button').click();
            await page.locator('dialog.trial-upgrade-dialog[open]').waitFor();
            assert.equal((await media()).length,0);
            assert.equal(writes.length,0);
          } else {
            if (item.action === 'timeout') await page.clock.install();
            if (item.action === 'enter') await input.press('Enter');
            else await start.click();
            await page.waitForFunction(()=>window.__formTest.media.length>0);
            assert.deepEqual((await media())[0],{audio:true,video:false},'Only the required microphone is requested');
            if (item.action === 'cancel' || item.action === 'timeout') {
              await waitPhase('connecting');
              assert.match(await page.locator('.trial-video-status').textContent(),/microphone/);
              if (item.action === 'cancel') {
                await page.getByRole('button',{name:'Annuler la connexion',exact:true}).click();
                await waitPhase('welcome');
                assert.equal(await page.locator('dialog.trial-upgrade-dialog[open]').count(),0,'No checkout on cancellation');
              } else {
                await page.clock.fastForward(25000);
                await waitPhase('error');
                assert.match(await page.locator('.trial-video-fallback [role=alert]').textContent(),/microphone.*attente/);
              }
              assert.equal(writes.length,0,'No server connection before permission');
              await page.evaluate(async()=>{await window.__formTest.resolveLate();});
              await page.waitForFunction(()=>window.__formTest.tracks.length>0&&window.__formTest.tracks.every(t=>t.readyState==='ended'));
              assert.equal(writes.length,0,'Late permission cannot connect');
              if (item.action === 'cancel') {
                await page.evaluate(()=>{window.__formTest.mode='normal';});
                await page.locator('form.trial-call-actions button[type=submit]').click();
                await waitPhase('error');
                assert.equal(writes.filter(w=>w.path==='/api/cloud-trial/connect').length,1,'New attempt works after cancellation');
              }
            } else if (item.action === 'denied') {
              await waitPhase('error');
              assert.match(await page.locator('.trial-video-fallback [role=alert]').textContent(),/microphone.*désactivé/);
              assert.equal(writes.length,0);
              await page.evaluate(()=>{window.__formTest.mode='normal';});
              const retry = page.getByRole('button',{name:'Réessayer la connexion',exact:true});
              await page.waitForFunction(()=>!document.querySelector('.trial-video-fallback button.call-button').disabled);
              await retry.click();
              await page.waitForFunction(()=>document.querySelector('.trial-video-fallback [role=alert]')?.textContent.includes('FORM_TEST_STOP'));
              assert.equal(writes.filter(w=>w.path==='/api/cloud-trial/connect').length,1);
            } else {
              await waitPhase('error');
              assert.equal(writes.filter(w=>w.path==='/api/cloud-trial/connect').length,1,'Single attempt on submit');
              assert.equal((await media()).length,1,'No unsolicited camera request');
              assert.equal(await page.locator('dialog.trial-upgrade-dialog[open]').count(),0,'No checkout from submit');
            }
          }
        }
        assert.deepEqual(errors,[],'No JavaScript errors');
        assert.ok(writes.every(w=>w.path==='/api/cloud-trial/connect'),'Only intercepted connection attempts');
        const result = {name:item.name,passed:true,interceptedConnections:writes.length};
        results.push(result);
        console.log('FORM_REPAIR_TEST '+JSON.stringify(result));
      } catch (error) {
        throw new Error(item.name + ': ' + error.message,{cause:error});
      } finally {await context.close();}
    }
  } finally {await browser.close();}
  console.log('FORM_REPAIR_VERIFIED '+JSON.stringify({origin,mode:inject?'isolated injected candidate':'deployed scripts with isolated APIs',passed:results.length,realCalls:0,realPayments:0,realMedia:false}));
  return results;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await verifyForm(process.argv[2]||'https://hohohosanta.app',process.argv.includes('--inject'));
}
