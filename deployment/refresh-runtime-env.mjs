/** Refresh deployment-bound environment after a credential was rotated.
 * Never prints secret values, never changes payment flags or customer data.
 * --prepare creates a production-context candidate under a publication lock.
 * --publish ID publishes only after code, assets, routes and payment readiness checks.
 */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const siteId='bd9b6590-f31a-42c7-b58d-12779e45cb0e';
const sourceId='6ac4f14e6db27e83d72c3aa4';
const title='HoHoHo Santa - refresh rotated production credentials';
const mode=process.argv[2],selected=process.argv[3];
assert.ok(mode==='--prepare'||mode==='--publish');
if(mode==='--publish')assert.match(selected||'',/^[a-f0-9]{24}$/);
const expectedNames=['___netlify-server-handler','cloud-trial','santa-call-background','santa-cleanup','santa-retention'];
const root=resolve(import.meta.dirname,'..');
const sha=(bytes,algorithm='sha1')=>createHash(algorithm).update(bytes).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=process.env.NETLIFY_AUTH_TOKEN;
assert.ok(token,'Repository deployment credential missing');
async function api(path,{method='GET',json,bytes}={}){
 assert.ok(path.startsWith('/')&&!path.includes('..'));
 const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
 if(json!==undefined)headers['Content-Type']='application/json';
 if(bytes)headers['Content-Type']='application/octet-stream';
 const r=await fetch('https://api.netlify.com/api/v1'+path,{method,headers,body:bytes||(json!==undefined?JSON.stringify(json):undefined),redirect:'error',signal:AbortSignal.timeout(45000)});
 assert.ok(r.ok,`Netlify ${method} ${path.split('?')[0]} HTTP ${r.status}`);
 const text=await r.text();return text?JSON.parse(text):{};
}
const origin=id=>`https://${id}--hohohosanta-live.netlify.app`;
async function read(base,path){
 const r=await fetch(base+path,{redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,`Public GET ${path} HTTP ${r.status}`);
 return {bytes:Buffer.from(await r.arrayBuffer()),headers:r.headers};
}
function inventory(records){
 assert.ok(Array.isArray(records)&&records.length>50,'Incomplete deployment file inventory');
 const result={};
 for(const file of records){assert.match(file.sha||'',/^[a-f0-9]{40}$/);result['/'+file.path.replace(/^\/+/, '')]=file.sha;}
 assert.ok(result['/index.html']&&result['/branding-internal/theme-20261006-v1.css']);return result;
}
function runtimePlan(source){
 assert.deepEqual(source.available_functions.map(f=>f.n).sort(),expectedNames);
 assert.ok(!source.server&&!source.required_server?.length);
 assert.deepEqual(source.functions_region_overrides||[],[]);
 const functions={},configs={};
 for(const f of source.available_functions){
  assert.match(f.d,/^[a-f0-9]{64}$/);assert.match(f.r,/^nodejs\d+\.x$/);
  assert.ok(['stream','background','buffered'].includes(f.im));
  assert.ok(!f.excluded_routes?.length&&!f.exro?.length&&!f.event_subscriptions?.length);
  functions[f.n]=f.d;const c={};
  for(const [a,b] of [['dn','display_name'],['g','generator'],['bd','build_data'],['p','priority']])if(f[a]!=null)c[b]=f[a];
  if(f.ro)c.routes=f.ro.map(r=>{const out={};for(const [a,b] of [['p','pattern'],['l','literal'],['e','expression'],['m','methods'],['ps','prefer_static']])if(r[a]!=null)out[b]=r[a];return out;});
  configs[f.n]=c;
 }
 return {functions,configs};
}
function compareRuntime(source,candidate){
 assert.equal(candidate.site_id,siteId);assert.equal(candidate.context,'production');assert.equal(candidate.state,'ready');
 for(const key of ['database_branch_id','blobs_region','function_schedules','functions_region_overrides'])assert.deepEqual(candidate[key],source[key],`Changed ${key}`);
 assert.ok(!candidate.database_migrations?.files?.length,'Unexpected database migration');
 assert.equal(candidate.edge_functions_present,true,'Branding middleware missing');
 assert.deepEqual(candidate.available_functions.map(f=>f.n).sort(),expectedNames);
 // Lambda identities may change because environment values changed; code may not.
 for(const a of source.available_functions){const b=candidate.available_functions.find(f=>f.n===a.n);for(const k of ['d','r','im','bd','rg','m','p','ro'])assert.deepEqual(b[k],a[k],`Changed runtime code/config ${a.n}/${k}`);}
}
async function checkPages(base){
 const old=origin(sourceId),scripts=new Set();
 const home=await read(base,'/'),oldHome=await read(old,'/');
 assert.equal(sha(home.bytes),sha(oldHome.bytes),'Homepage changed');
 for(const path of ['/essai','/demo','/parent','/mes-souvenirs','/privacy','/terms-of-sale']){
  const [a,b]=await Promise.all([read(old,path),read(base,path)]);
  const scriptPaths=bytes=>[...bytes.toString().matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&'));
  assert.deepEqual(scriptPaths(b.bytes),scriptPaths(a.bytes),'Application script list changed '+path);
  assert.ok(b.bytes.includes(Buffer.from('data-hohoho-theme="20261006-v1"')),'Theme missing '+path);
  for(const key of ['content-security-policy','permissions-policy','x-content-type-options','x-frame-options'])assert.equal(b.headers.get(key),a.headers.get(key),'Security policy changed '+path);
  for(const p of scriptPaths(a.bytes))if(p.startsWith('/_next/'))scripts.add(p);
 }
 for(const path of scripts){const [a,b]=await Promise.all([read(old,path),read(base,path)]);assert.equal(sha(a.bytes),sha(b.bytes),'Application code changed');}
 const free=JSON.parse((await read(base,'/api/cloud-trial/config')).bytes.toString());
 const paid=JSON.parse((await read(base,'/api/cloud-trial/purchase/config')).bytes.toString());
 assert.equal(free.ready,true,'Free trial unavailable');assert.equal(free.preview,false);
 assert.equal(paid.priceCents,499);assert.equal(paid.durationSeconds,300);
 console.log('PUBLIC_READINESS',JSON.stringify({freeReady:free.ready,paidVideoAvailable:paid.paidVideoAvailable,priceCents:paid.priceCents,durationSeconds:paid.durationSeconds,scripts:scripts.size,transactions:0}));
 return paid.paidVideoAvailable===true;
}
async function main(){
 const site=await api('/sites/'+siteId);assert.equal(site.custom_domain,'hohohosanta.app');assert.equal(site.published_deploy?.id,sourceId,'Another version was published');
 const source=await api('/deploys/'+sourceId);assert.equal(source.state,'ready');assert.equal(source.context,'production');
 const files=inventory(await api('/deploys/'+sourceId+'/files?per_page=1000'));
 const plan=runtimePlan(source);
 const dist=resolve(root,'.netlify/edge-functions-dist');
 const manifest=JSON.parse(await readFile(resolve(dist,'manifest.json'),'utf8'));
 assert.deepEqual([...new Set(manifest.routes.map(r=>r.function))],['site-theme']);
 const edgeFunctions={},edgeBytes=new Map();
 for(const file of await readdir(dist)){
  const bytes=await readFile(resolve(dist,file)),path='/.netlify/internal/edge-functions/'+file;
  assert.equal(sha(bytes),files[path],'Rebuilt edge middleware differs from published code');
 }
 for(const bundle of manifest.bundles){const bytes=await readFile(resolve(dist,bundle.asset)),hash=sha(bytes,'sha256');edgeFunctions[bundle.format]=hash;edgeBytes.set(hash,bytes);}
 let candidateId=selected,ownedLock=false,published=false,keep=false;
 async function guard(){const s=await api('/sites/'+siteId);assert.equal(s.published_deploy?.id,sourceId,'Production changed');assert.equal((await api('/deploys/'+sourceId)).locked,true,'Publication lock missing');}
 try{
  if(mode==='--prepare'){
   assert.ok(!source.locked,'Pre-existing publication lock');
   await api('/deploys/'+sourceId+'/lock',{method:'POST'});ownedLock=true;await guard();
   const candidate=await api('/sites/'+siteId+'/deploys?title='+encodeURIComponent(title),{method:'POST',json:{files,functions:plan.functions,functions_config:plan.configs,function_schedules:source.function_schedules,edge_functions:edgeFunctions,framework:source.framework,draft:false,async:true}});
   assert.equal(candidate.site_id,siteId);assert.match(candidate.id,/^[a-f0-9]{24}$/);candidateId=candidate.id;
   console.log('ENVIRONMENT_REFRESH_CANDIDATE',candidateId);
   let ready=false;const uploadedEdges=new Set();
   for(let i=0;i<75;i++){
    await guard();const d=await api('/deploys/'+candidateId);
    assert.ok(!['error','rejected'].includes(d.state),'Candidate rejected');
    if(d.required_functions?.length)console.log('REQUIRED_ORIGINAL_ARCHIVES',source.available_functions.filter(f=>d.required_functions.includes(f.d)).map(f=>f.n));
    assert.ok(!d.required_functions?.length&&!d.required_server?.length,'Original runtime archive required; no substitution allowed');
    assert.ok(!d.required?.length,'Unchanged original asset required');
    for(const hash of d.required_edge_functions||[]){assert.ok(edgeBytes.has(hash),'Unexpected edge code');if(!uploadedEdges.has(hash)){await api('/deploys/'+candidateId+'/edge_functions/'+hash,{method:'PUT',bytes:edgeBytes.get(hash)});uploadedEdges.add(hash);}}
    if(d.state==='ready'){ready=true;break;}await sleep(1500);
   }
   assert.ok(ready,'Candidate did not become ready');
  }else{assert.equal(source.locked,true);await guard();}
  const candidate=await api('/deploys/'+candidateId);assert.equal(candidate.title,title);compareRuntime(source,candidate);
  assert.deepEqual(inventory(await api('/deploys/'+candidateId+'/files?per_page=1000')),files,'Deployment asset inventory changed');
  console.log('RUNTIME_IDENTITIES',candidate.available_functions.map(f=>({name:f.n,environmentRecreated:f.id!==source.available_functions.find(o=>o.n===f.n).id})));
  const paidReady=await checkPages(origin(candidateId));await guard();
  await mkdir(resolve(root,'runtime-refresh-report'),{recursive:true});
  await writeFile(resolve(root,'runtime-refresh-report/release.json'),JSON.stringify({sourceId,candidateId,paidReady,origin:origin(candidateId)},null,2));
  assert.equal(paidReady,true,'Payment readiness still false after redeployment');
  if(mode==='--prepare'){keep=true;console.log('REFRESH_READY_FOR_REVIEW',origin(candidateId));return;}
  await api('/sites/'+siteId+'/deploys/'+candidateId+'/restore',{method:'POST'});published=true;
  assert.equal((await api('/sites/'+siteId)).published_deploy?.id,candidateId);
  compareRuntime(source,await api('/deploys/'+candidateId));assert.equal(await checkPages('https://hohohosanta.app'),true);
  if((await api('/deploys/'+candidateId)).locked)await api('/deploys/'+candidateId+'/unlock',{method:'POST'});
  console.log('REFRESH_PUBLISHED_AND_VERIFIED',candidateId);
 }finally{
  if(!keep){
   const current=await api('/sites/'+siteId);
   if(published&&current.published_deploy?.id===candidateId){
    // A successful publication is retained; a thrown postcheck rolls back in catch below.
   }else if((ownedLock||mode==='--publish')&&current.published_deploy?.id===sourceId){
    if(candidateId&&mode==='--prepare'){
     try{await api('/deploys/'+candidateId,{method:'DELETE'});}catch{console.log('UNPUBLISHED_CANDIDATE_RETAINED',candidateId);}
    }
    if((await api('/deploys/'+sourceId)).locked)await api('/deploys/'+sourceId+'/unlock',{method:'POST'});
    console.log('ORIGINAL_REMAINS_PUBLISHED');
   }
  }
 }
}
main().catch(async error=>{
 console.error('RUNTIME_REFRESH_STOPPED',error.message);
 if(mode==='--publish'&&selected){
  const now=await api('/sites/'+siteId);
  if(now.published_deploy?.id===selected){await api('/sites/'+siteId+'/deploys/'+sourceId+'/restore',{method:'POST'});assert.equal((await api('/sites/'+siteId)).published_deploy?.id,sourceId);if((await api('/deploys/'+sourceId)).locked)await api('/deploys/'+sourceId+'/unlock',{method:'POST'});console.log('ROLLBACK_VERIFIED');}
 }
 process.exitCode=1;
});
