import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.argv[2]||'https://hohohosanta.app';
assert.match(origin,/^https:\/\/(?:[a-f0-9]{24}--hohohosanta-live\.netlify\.app|hohohosanta\.app)$/);
const inject=process.argv.includes('--inject');
const css=await readFile(new URL('../branding/internal-pages.css',import.meta.url),'utf8');
const paths=['/essai','/demo','/parent','/mes-souvenirs','/support','/legal','/privacy','/child-safety','/terms','/terms-of-sale','/cookies','/magie','/magie/appel-video-pere-noel-francais-france-3-ans-prenom-00001'];
await mkdir('theme-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true});
const report=[];
try {
 for(const width of [390,1280]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
   const req=route.request();
   if(!['GET','HEAD'].includes(req.method()))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();let errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const path of paths) {
   errors=[];
   const response=await page.goto(origin+path,{waitUntil:'networkidle',timeout:45000});
   assert.equal(response.status(),200,path);
   // Compare DOM text, not CSS-rendered text: capitalization and decorative marks intentionally change.
   const baseline=await page.locator('main').textContent();
   if(inject)await page.addStyleTag({content:css});
   await page.waitForTimeout(250);
   const metrics=await page.evaluate(()=>{
    const stamp=document.querySelector('.brand-stamp'),main=document.querySelector('main'),h=document.querySelector('h1');
    const version=getComputedStyle(document.documentElement).getPropertyValue('--hohoho-internal-version').trim();
    return {version,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,logo:stamp?getComputedStyle(stamp).backgroundImage:'',heading:h?getComputedStyle(h).color:'',mainClass:main?.className,inputs:[...document.querySelectorAll('input')].map(i=>({type:i.type,height:i.getBoundingClientRect().height,font:getComputedStyle(i).fontSize}))};
   });
   assert.ok(metrics.version.includes('20261006-v1'),'Theme not loaded '+path);
   assert.ok(metrics.logo.includes('logo-small.webp'),'Logo not loaded '+path);
   assert.ok(metrics.documentWidth<=width+1,'Horizontal overflow '+width+' '+path+' '+JSON.stringify(metrics));
   assert.deepEqual(errors,[],'JavaScript error '+path);
   if(inject)assert.equal(await page.locator('main').textContent(),baseline,'Theme modified DOM content');
   const file=path.slice(1).replaceAll('/','-');
   if(['/essai','/demo','/parent','/mes-souvenirs','/support','/magie'].includes(path))await page.screenshot({path:`theme-screenshots/${width}-${file}.png`,fullPage:path==='/parent'||path==='/mes-souvenirs'});
   report.push({path,width,...metrics});
  }
  await page.goto(origin+'/mes-souvenirs',{waitUntil:'networkidle'});
  if(inject)await page.addStyleTag({content:css});
  const email=page.locator('input[type=email]');
  if(await email.count()){await email.fill('test@example.invalid');assert.equal(await email.inputValue(),'test@example.invalid');}
  await context.close();
 }
 await writeFile('theme-screenshots/report.json',JSON.stringify(report,null,2));
 console.log('BROWSER_THEME_VERIFIED',JSON.stringify({pages:paths.length,widths:[390,1280],screens:report.length,transactions:0}));
} finally {await browser.close();}
