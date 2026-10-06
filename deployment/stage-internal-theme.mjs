// Stage only the presentation layer with the official Netlify SDK.
// The live deployment stays locked. All original files and functions are retained.
import {NetlifyAPI} from '@netlify/api';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileInventory,functionPlan} from './publish.mjs';
const siteId='bd9b6590-f31a-42c7-b58d-12779e45cb0e';
const sourceId='6ac4e90b56f9e65ce5189936';
const recoverId='6ac4f14e6db27e83d72c3aa4';
const resume=process.argv[2]==='--resume-created-candidate';
assert.ok(process.argv.length===2||resume&&process.argv.length===3,'Invalid arguments');
const expectedNames=['cloud-trial','santa-call-background','santa-cleanup','santa-retention','___netlify-server-handler'];
const title='HoHoHo Santa - internal pages red gold ivory';
const root=resolve(import.meta.dirname,'..');
const digest=(bytes,algorithm='sha1')=>createHash(algorithm).update(bytes).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 assert.ok(process.env.NETLIFY_AUTH_TOKEN,'Deployment credential missing');
 const api=new NetlifyAPI(process.env.NETLIFY_AUTH_TOKEN);
 const site=await api.getSite({siteId});
 assert.equal(site.id,siteId);assert.equal(site.custom_domain,'hohohosanta.app');
 assert.equal(site.published_deploy?.id,sourceId,'Production has changed');
 const source=await api.getDeploy({deployId:sourceId});
 assert.equal(source.state,'ready');assert.equal(source.context,'production');
 if(resume){
  // Resume ONLY the empty candidate created by this task, never another deployment.
  const pending=await api.getDeploy({deployId:recoverId});
  assert.equal(source.locked,true);assert.equal(pending.site_id,siteId);
  assert.equal(pending.state,'new');assert.equal(pending.title,title);
  assert.equal(pending.context,'production');assert.ok(!pending.published_at);
  assert.equal(pending.available_functions.length,0);
 }else assert.ok(!source.locked,'Existing publication lock requires review');
 const files=fileInventory(await api.listSiteFiles({siteId}));
 const plan=functionPlan(source,expectedNames);
 assert.deepEqual(source.functions_region_overrides||[],[]);
 for(const c of Object.values(plan.configs)){delete c.region;delete c.memory;}
 const patch=new Map([['/branding-internal/theme-20261006-v1.css',await readFile(resolve(root,'branding/internal-pages.css'))]]);
 const dist=resolve(root,'.netlify/edge-functions-dist');
 const manifest=JSON.parse(await readFile(resolve(dist,'manifest.json'),'utf8'));
 assert.ok(manifest.bundles?.length);assert.deepEqual([...new Set(manifest.routes.map(r=>r.function))],['site-theme']);
 for(const file of await readdir(dist,{withFileTypes:true}))if(file.isFile())patch.set('/.netlify/internal/edge-functions/'+file.name,await readFile(resolve(dist,file.name)));
 const edges={},edgeBytes=new Map();
 for(const bundle of manifest.bundles){const bytes=await readFile(resolve(dist,bundle.asset)),sha=digest(bytes,'sha256');edges[bundle.format]=sha;edgeBytes.set(sha,bytes);}
 const expected={...files,...Object.fromEntries([...patch].map(([path,bytes])=>[path,digest(bytes)]))};
 const byHash=new Map([...patch].map(([path,bytes])=>[digest(bytes),{path,bytes}]));
 const body={files:expected,functions:plan.functions,functions_config:plan.configs,function_schedules:plan.schedules,edge_functions:edges,framework:source.framework,draft:false,async:true};
 let candidateId=resume?recoverId:null;
 async function confirmLock(){assert.equal((await api.getSite({siteId})).published_deploy?.id,sourceId,'Production changed');assert.equal((await api.getDeploy({deployId:sourceId})).locked,true,'Publication lock missing');}
 if(!resume)await api.lockDeploy({deployId:sourceId});
 await confirmLock();
 // The SDK's universal request-body parameter is `body`.
 const candidate=resume?await api.updateSiteDeploy({siteId,deployId:recoverId,body}):await api.createSiteDeploy({siteId,title,body});
 assert.equal(candidate.site_id,siteId);assert.match(candidate.id,/^[a-f0-9]{24}$/);candidateId=candidate.id;
 assert.equal(candidate.context,'production');console.log('INTERNAL_THEME_STAGED',candidateId);
 const uploaded=new Set(),uploadedEdges=new Set();let ready=false,lastState='';
 for(let attempt=0;attempt<120;attempt++){
  await confirmLock();const state=await api.getDeploy({deployId:candidateId});
  if(state.state!==lastState){console.log('STAGING_STATE',state.state);lastState=state.state;}
  assert.ok(!['error','rejected'].includes(state.state),'Candidate rejected');
  assert.ok(!(state.required_functions?.length||state.required_server?.length),'Original runtime unavailable');
  for(const sha of state.required||[]){const file=byHash.get(sha);assert.ok(file,'Required original file unavailable');if(!uploaded.has(sha)){await api.uploadDeployFile({deployId:candidateId,path:file.path.slice(1),body:file.bytes});uploaded.add(sha);}}
  for(const sha of state.required_edge_functions||[]){const bytes=edgeBytes.get(sha);assert.ok(bytes,'Unknown edge bundle');if(!uploadedEdges.has(sha)){await api.uploadDeployEdgeFunction({deployId:candidateId,codeSha:sha,body:bytes});uploadedEdges.add(sha);}}
  if(state.state==='ready'){ready=true;break;}await pause(2000);
 }
 assert.ok(ready,'Staging timed out; original remains locked for review');await confirmLock();
 const state=await api.getDeploy({deployId:candidateId});
 assert.equal(state.context,'production');assert.equal(state.database_branch_id,source.database_branch_id);assert.equal(state.blobs_region,source.blobs_region);
 assert.deepEqual(state.function_schedules,source.function_schedules);assert.deepEqual(state.available_functions.map(f=>f.n).sort(),expectedNames.sort());
 for(const a of source.available_functions){const b=state.available_functions.find(f=>f.n===a.n);for(const k of ['id','oid','d','r','im','bd','rg','m','p','ro'])assert.deepEqual(b[k],a[k],`Runtime changed ${a.n}/${k}`);}
 assert.ok(!state.database_migrations?.files?.length);assert.equal(state.edge_functions_present,true,'Theme middleware missing');
 await mkdir(resolve(root,'theme-screenshots'),{recursive:true});
 await writeFile(resolve(root,'theme-screenshots/release.json'),JSON.stringify({siteId,sourceId,candidateId,title,origin:`https://${candidateId}--hohohosanta-live.netlify.app`,cssSha:digest(patch.get('/branding-internal/theme-20261006-v1.css')),files:expected},null,2));
 console.log('INTERNAL_THEME_READY_FOR_REVIEW',`https://${candidateId}--hohohosanta-live.netlify.app`);
 console.log('PRODUCTION_UNCHANGED_ALL_FIVE_FUNCTIONS_RETAINED');
}
main().catch(error=>{console.error('STAGING_STOPPED',error instanceof assert.AssertionError?error.message:(error.status||error.name||'Deployment error'));process.exitCode=1;});
