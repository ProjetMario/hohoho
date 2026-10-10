/** Isolated browser audit. Public page/assets only; ALL writes are intercepted.
 * Eligibility fixtures affect only this disposable browser, never the server.
 * Fake media devices ensure no person's microphone/camera is accessed.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin = 'https://hohohosanta.app';
const report = [];
const browser = await chromium.launch({headless:true,args:[
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'
]});
const scenarios = [
  {name:'live-read-only',live:true},
  {name:'free-desktop',free:true,reason:'available',width:1280,interact:true},
  {name:'free-mobile',free:true,reason:'available',width:390,interact:true},
  {name:'stale-browser-flag',free:true,reason:'available',stale:true},
  {name:'vpn-is-not-consumed',free:false,reason:'vpn'},
  {name:'reservation-is-not-consumed',free:false,reason:'reserved'},
  {name:'unavailable-is-not-consumed',free:false,reason:'unavailable'},
  {name:'consumed-trial',free:false,reason:'used'},
  {name:'microphone-permission-pending',free:true,reason:'available',pending:true,interact:true}
];
for (const scenario of scenarios) {
 const result = {name:scenario.name,apiMode:scenario.live?'live GET only':'isolated response fixtures',width:scenario.width||1280,blockedWrites:[],errors:[]};
 const context = await browser.newContext({viewport:{width:scenario.width||1280,height:900},locale:'fr-FR',timezoneId:'Europe/Paris',serviceWorkers:'block'});
 try {
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(!['GET','HEAD'].includes(req.method())) {
    result.blockedWrites.push({path:url.pathname,method:req.method()});
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'FORM_AUDIT_STOP',error:'FORM_AUDIT_STOP: aucun appel réel créé.'})});
   }
   if(url.origin!==origin)return route.abort();
   if(!scenario.live) {
    const payload=url.pathname==='/api/cloud-trial/config'?{ready:true,preview:false,durationSeconds:30}:
      url.pathname==='/api/cloud-trial/eligibility'?{freeAvailable:scenario.free,reason:scenario.reason,durationSeconds:30}:
      url.pathname==='/api/cloud-trial/purchase/config'?{paidVideoAvailable:false,unavailableReason:'capacity_exhausted',priceCents:499,durationSeconds:300}:
      url.pathname==='/api/site/locale'||url.pathname==='/api/cloud-trial/locale'?{language:'fr'}:null;
    if(payload)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
   }
   return route.continue();
  });
  await context.addInitScript(({stale,pending})=>{
   if(stale)localStorage.setItem('santa:free-trial-used','true');
   window.__formAuditMedia=[];
   window.__formAuditEvents=[];
   document.addEventListener('submit',e=>window.__formAuditEvents.push({kind:'submit',form:e.target.className}),true);
   document.addEventListener('invalid',e=>window.__formAuditEvents.push({kind:'invalid',field:e.target.id}),true);
   if(navigator.mediaDevices?.getUserMedia){
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=constraints=>{
     window.__formAuditMedia.push({audio:!!constraints.audio,video:!!constraints.video});
     if(pending&&constraints.audio)return new Promise(()=>{});
     return original(constraints);
    };
   }
  },{stale:!!scenario.stale,pending:!!scenario.pending});
  const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message.slice(0,180)));
  page.on('response',async r=>{
   if(scenario.live&&r.url().endsWith('/api/cloud-trial/eligibility')){
    const data=await r.json().catch(()=>({}));
    result.liveEligibility={freeAvailable:data.freeAvailable,reason:data.reason};
   }
  });
  const response=await page.goto(origin+'/essai',{waitUntil:'networkidle',timeout:45000});
  assert.equal(response.status(),200);
  await page.waitForTimeout(500);
  result.entry=await snapshot(page);
  if(!scenario.live) {
   const prepare=page.getByRole('button',{name:/Je suis un adulte · Préparer l’appel|I am an adult · Prepare the call/});
   if(await prepare.count())await prepare.click({timeout:10000});
   await page.waitForTimeout(500);
   result.setup=await snapshot(page);
   if(scenario.interact) {
    const field=page.locator('#trial-child-name');
    const start=page.locator('.trial-call-actions > button.call-button');
    await field.waitFor({timeout:10000});
    result.names=[];
    for(const name of ['', ' ', '123', 'Camille', 'Éléonore', 'Jean-Luc', 'O’Connor']){
     await field.fill(name);
     result.names.push({name,disabled:await start.isDisabled(),ariaInvalid:await field.getAttribute('aria-invalid')});
    }
    await field.fill('Camille');
    const recording=page.locator('.trial-recording-option input');
    if(await recording.isEnabled())await recording.uncheck();
    result.recordingOptional=!await start.isDisabled();
    const before=await page.evaluate(()=>window.__formAuditMedia.length);
    await field.press('Enter');
    await page.waitForTimeout(300);
    result.enter={before,after:await page.evaluate(()=>window.__formAuditMedia.length),phase:await page.locator('main.trial-video-call').getAttribute('data-phase'),events:await page.evaluate(()=>window.__formAuditEvents)};
    if(scenario.pending)await page.clock.install();
    await start.click({timeout:10000});
    if(scenario.pending){await page.waitForTimeout(200);await page.clock.fastForward(60000);}
    else await page.waitForTimeout(1500);
    result.afterClick=await snapshot(page);
    result.mediaRequests=await page.evaluate(()=>window.__formAuditMedia);
   }
  }
 } catch(error) {result.auditError=String(error.message||error).slice(0,300);}
 finally {await context.close();}
 report.push(result);
 console.log('FORM_CASE '+JSON.stringify(result));
}
await browser.close();
console.log('SAFETY '+JSON.stringify({realCalls:0,realPayments:0,productionWrites:0,providerCalls:0,realMediaCaptured:false,fixturesExplicit:true}));
if(report.some(r=>r.auditError))process.exitCode=1;

async function snapshot(page){
 return page.evaluate(()=>{
  const main=document.querySelector('main.trial-video-call')||document.querySelector('main');
  const dialog=document.querySelector('dialog.trial-upgrade-dialog[open]');
  const start=document.querySelector('.trial-call-actions > button.call-button');
  return {phase:main?.getAttribute('data-phase'),upgradeOpen:!!dialog,upgradeStep:dialog?.className,upgradeHeading:dialog?.querySelector('h2')?.textContent,
   start:start?{text:start.textContent,disabled:start.disabled,type:start.type,formTag:start.form?.tagName||null}:null,
   nameField:main?.querySelector('#trial-child-name')?{required:main.querySelector('#trial-child-name').required,formTag:main.querySelector('#trial-child-name').form?.tagName||null}:null,
   notices:[...main?.querySelectorAll('[role="alert"],[role="status"],#trial-child-name-help')||[]].map(e=>e.textContent).filter(Boolean).slice(-12),
   visibleFields:dialog?[...dialog.querySelectorAll('input,select')].map(e=>({tag:e.tagName,type:e.type,required:e.required})):[]};
 });
}
