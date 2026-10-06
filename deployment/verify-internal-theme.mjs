// Verify a specific branding deployment. Read-only unless --publish is explicit.
// Uses the official Netlify SDK with the existing repository deployment secret.
import {NetlifyAPI} from '@netlify/api';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const siteId='bd9b6590-f31a-42c7-b58d-12779e45cb0e';
const sourceId='6ac4e90b56f9e65ce5189936';
const title='HoHoHo Santa - internal pages red gold ivory';
const selected=process.argv[2],publish=process.argv[3]==='--publish';
assert.match(selected||'',/^[a-f0-9]{24}$/);
assert.ok(process.argv.length<=4||publish,'Invalid mode');
const pages=['/essai','/demo','/parent','/mes-souvenirs','/support','/legal','/privacy','/child-safety','/terms','/terms-of-sale','/cookies','/magie','/magie/appel-video-pere-noel-francais-france-3-ans-prenom-00001'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const css=await readFile(new URL('../branding/internal-pages.css',import.meta.url));
const origin=id=>`https://${id}--hohohosanta-live.netlify.app`;
async function read(base,path){
 const response=await fetch(base+path,{headers:{'Cache-Control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(45000)});
 assert.equal(response.status,200,'Unexpected response '+path);
 return {bytes:Buffer.from(await response.arrayBuffer()),headers:response.headers};
}
function compareRuntime(original,candidate){
 assert.equal(candidate.context,'production');
 for(const key of ['database_branch_id','blobs_region','function_schedules','functions_region_overrides'])assert.deepEqual(candidate[key],original[key],key+' changed');
 assert.ok(!candidate.database_migrations?.files?.length,'Unexpected migrations');
 assert.equal(candidate.available_functions.length,5);
 for(const a of original.available_functions){
  const b=candidate.available_functions.find(f=>f.n===a.n);assert.ok(b,'Missing function '+a.n);
  for(const k of ['id','oid','d','r','im','bd','rg','m','p','ro'])assert.deepEqual(b[k],a[k],'Function changed '+a.n+'/'+k);
 }
 assert.equal(candidate.edge_functions_present,true,'Theme middleware missing');
}
async function verifyPages(base){
 const sourceBase=origin(sourceId);
 const scripts=new Set();
 const pageTitle=bytes=>bytes.toString().match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
 const originalHome=await read(sourceBase,'/'),home=await read(base,'/');
 assert.equal(digest(home.bytes),digest(originalHome.bytes),'Approved homepage was changed');
 const servedCSS=await read(base,'/branding-internal/theme-20261006-v1.css');
 assert.equal(digest(servedCSS.bytes),digest(css),'Different theme stylesheet');
 for(const path of pages){
  const [a,b]=await Promise.all([read(sourceBase,path),read(base,path)]);
  assert.equal(pageTitle(b.bytes),pageTitle(a.bytes),'Page title changed '+path);
  assert.ok(b.bytes.includes(Buffer.from('data-hohoho-theme="20261006-v1"')),'Missing theme '+path);
  for(const key of ['content-security-policy','permissions-policy','referrer-policy','x-content-type-options','x-frame-options'])assert.equal(b.headers.get(key),a.headers.get(key),'Security header changed '+path+'/'+key);
  const sources=bytes=>[...bytes.toString().matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&'));
  assert.deepEqual(sources(b.bytes),sources(a.bytes),'Application scripts changed '+path);
  for(const file of sources(a.bytes))if(file.startsWith('/_next/'))scripts.add(file);
 }
 for(const path of scripts){const[a,b]=await Promise.all([read(sourceBase,path),read(base,path)]);assert.equal(digest(b.bytes),digest(a.bytes),'JavaScript modified '+path);}
 console.log('INTERNAL_THEME_PUBLIC_CHECKS_PASSED',JSON.stringify({pages:pages.length,scripts:scripts.size,homepageUnchanged:true,transactions:0}));
}
async function main(){
 assert.ok(process.env.NETLIFY_AUTH_TOKEN,'Deployment credential missing');
 const api=new NetlifyAPI(process.env.NETLIFY_AUTH_TOKEN);
 const site=await api.getSite({siteId});assert.equal(site.custom_domain,'hohohosanta.app');
 const original=await api.getDeploy({deployId:sourceId}),candidate=await api.getDeploy({deployId:selected});
 assert.equal(candidate.site_id,siteId);assert.equal(candidate.title,title);assert.equal(candidate.state,'ready');
 compareRuntime(original,candidate);await verifyPages(origin(selected));
 if(!publish){console.log('INTERNAL_THEME_VALIDATION_COMPLETE',selected);return;}
 assert.equal(site.published_deploy?.id,sourceId,'Another version is already live');
 assert.equal(original.locked,true,'Original publication lock is missing');
 let published=false;
 try{
  const current=await api.getSite({siteId});assert.equal(current.published_deploy?.id,sourceId);
  await api.restoreSiteDeploy({siteId,deployId:selected});published=true;
  assert.equal((await api.getSite({siteId})).published_deploy?.id,selected,'Publication not confirmed');
  compareRuntime(original,await api.getDeploy({deployId:selected}));
  await verifyPages('https://hohohosanta.app');
  if((await api.getDeploy({deployId:selected})).locked)await api.unlockDeploy({deployId:selected});
  console.log('INTERNAL_PAGES_PUBLISHED_AND_VERIFIED',JSON.stringify({hostname:'hohohosanta.app',deployId:selected,pages:pages.length,functions:5,schedules:2}));
 }catch(error){
  if(published&&(await api.getSite({siteId})).published_deploy?.id===selected){
   await api.restoreSiteDeploy({siteId,deployId:sourceId});
   assert.equal((await api.getSite({siteId})).published_deploy?.id,sourceId,'Rollback not confirmed');
   if((await api.getDeploy({deployId:sourceId})).locked)await api.unlockDeploy({deployId:sourceId});
   console.log('ORIGINAL_RESTORED_AFTER_FAILED_CHECK');
  }
  throw error;
 }
}
main().catch(error=>{console.error('THEME_VERIFICATION_STOPPED',error instanceof assert.AssertionError?error.message:(error.status||error.name||'Verification error'));process.exitCode=1;});
