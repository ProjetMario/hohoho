// Stage the approved internal-page stylesheet and its HTML middleware.
// Uses Netlify's official SDK and the existing GitHub deployment secret.
// This command never publishes: the currently published version stays locked for review.
import {NetlifyAPI} from '@netlify/api';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileInventory,functionPlan} from './publish.mjs';

const siteId='bd9b6590-f31a-42c7-b58d-12779e45cb0e';
const sourceId='6ac4e90b56f9e65ce5189936';
const expectedNames=['cloud-trial','santa-call-background','santa-cleanup','santa-retention','___netlify-server-handler'];
const title='HoHoHo Santa - internal pages red gold ivory';
const root=resolve(import.meta.dirname,'..');
const digest=(bytes,algorithm='sha1')=>createHash(algorithm).update(bytes).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));

async function main(){
 assert.ok(process.env.NETLIFY_AUTH_TOKEN,'Deployment credential is not configured');
 const api=new NetlifyAPI(process.env.NETLIFY_AUTH_TOKEN);
 const site=await api.getSite({siteId});
 assert.equal(site.id,siteId);assert.equal(site.custom_domain,'hohohosanta.app');
 assert.equal(site.published_deploy?.id,sourceId,'Another version is already published');
 const source=await api.getDeploy({deployId:sourceId});
 assert.equal(source.state,'ready');assert.equal(source.context,'production');assert.ok(!source.locked,'Existing publication lock');
 const files=fileInventory(await api.listSiteFiles({siteId}));
 const plan=functionPlan(source,expectedNames);
 assert.deepEqual(source.functions_region_overrides||[],[]);
 for(const config of Object.values(plan.configs)){delete config.region;delete config.memory;}
 const patch=new Map();
 patch.set('/branding-internal/theme-20261006-v1.css',await readFile(resolve(root,'branding/internal-pages.css')));
 const dist=resolve(root,'.netlify/edge-functions-dist');
 const manifest=JSON.parse(await readFile(resolve(dist,'manifest.json'),'utf8'));
 assert.ok(manifest.bundles?.length,'Edge build is missing');
 assert.deepEqual([...new Set(manifest.routes.map(r=>r.function))],['site-theme']);
 for(const file of await readdir(dist,{withFileTypes:true})){
  if(file.isFile())patch.set('/.netlify/internal/edge-functions/'+file.name,await readFile(resolve(dist,file.name)));
 }
 const edgeFunctions={},edgeBytes=new Map();
 for(const bundle of manifest.bundles){const bytes=await readFile(resolve(dist,bundle.asset));const sha=digest(bytes,'sha256');edgeFunctions[bundle.format]=sha;edgeBytes.set(sha,bytes);}
 const expected={...files,...Object.fromEntries([...patch].map(([path,bytes])=>[path,digest(bytes)]))};
 const byHash=new Map([...patch].map(([path,bytes])=>[digest(bytes),{path,bytes}]));
 let candidateId,ownedLock=false;
 async function confirmLock(){
  const current=await api.getSite({siteId});assert.equal(current.published_deploy?.id,sourceId,'Production changed');
  assert.equal((await api.getDeploy({deployId:sourceId})).locked,true,'Publication is not locked');
 }
 try{
  await api.lockDeploy({deployId:sourceId});ownedLock=true;await confirmLock();
  const candidate=await api.createSiteDeploy({siteId,title,deploy:{files:expected,functions:plan.functions,functions_config:plan.configs,function_schedules:plan.schedules,edge_functions:edgeFunctions,framework:source.framework,draft:false,async:true}});
  assert.equal(candidate.site_id,siteId);assert.match(candidate.id,/^[a-f0-9]{24}$/);candidateId=candidate.id;
  console.log('INTERNAL_THEME_STAGED',candidateId);
  const uploaded=new Set(),uploadedEdges=new Set();let ready=false;
  for(let attempt=0;attempt<120;attempt++){
   await confirmLock();
   const state=await api.getDeploy({deployId:candidateId});
   assert.ok(!['error','rejected'].includes(state.state),'Netlify rejected the staged build');
   assert.ok(!(state.required_functions?.length||state.required_server?.length),'Original functions could not be retained');
   for(const sha of state.required||[]){
    const file=byHash.get(sha);assert.ok(file,'Required original file is not available');
    if(!uploaded.has(sha)){await api.uploadDeployFile({deployId:candidateId,path:file.path.slice(1),body:file.bytes});uploaded.add(sha);}
   }
   for(const sha of state.required_edge_functions||[]){
    const bytes=edgeBytes.get(sha);assert.ok(bytes,'Unexpected edge bundle requested');
    if(!uploadedEdges.has(sha)){await api.uploadDeployEdgeFunction({deployId:candidateId,codeSha:sha,body:bytes});uploadedEdges.add(sha);}
   }
   if(state.state==='ready'){ready=true;break;}await pause(2000);
  }
  assert.ok(ready,'Staging timed out');await confirmLock();
  const state=await api.getDeploy({deployId:candidateId});
  assert.equal(state.context,'production');
  assert.equal(state.database_branch_id,source.database_branch_id);
  assert.equal(state.blobs_region,source.blobs_region);
  assert.deepEqual(state.function_schedules,source.function_schedules);
  assert.deepEqual(state.available_functions.map(f=>f.n).sort(),expectedNames.sort());
  for(const original of source.available_functions){
   const retained=state.available_functions.find(f=>f.n===original.n);
   for(const key of ['id','oid','d','r','im','bd','rg','m','p','ro'])assert.deepEqual(retained[key],original[key],`Runtime changed: ${original.n}/${key}`);
  }
  assert.ok(!(state.database_migrations?.files?.length),'Unexpected database migration');
  assert.equal(state.edge_functions_present,true,'Theme middleware not detected');
  await mkdir(resolve(root,'theme-screenshots'),{recursive:true});
  await writeFile(resolve(root,'theme-screenshots/release.json'),JSON.stringify({siteId,sourceId,candidateId,title,origin:`https://${candidateId}--hohohosanta-live.netlify.app`,cssSha:digest(patch.get('/branding-internal/theme-20261006-v1.css')),files:expected},null,2));
  console.log('INTERNAL_THEME_READY_FOR_REVIEW',`https://${candidateId}--hohohosanta-live.netlify.app`);
  console.log('PRODUCTION_UNCHANGED_ALL_FIVE_FUNCTIONS_RETAINED');
 }catch(error){
  // Undo only this run's unpublished candidate and temporary publication lock.
  const current=await api.getSite({siteId});
  if(ownedLock&&current.published_deploy?.id===sourceId){
   if(candidateId)await api.deleteDeploy({deployId:candidateId});
   await api.unlockDeploy({deployId:sourceId});
   console.log('ORIGINAL_UNCHANGED_AND_UNLOCKED');
  }
  throw error;
 }
}
main().catch(error=>{console.error('STAGING_STOPPED',error instanceof assert.AssertionError?error.message:(error.status||error.name||'Deployment error'));process.exitCode=1;});
