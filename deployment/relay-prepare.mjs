/** Draft-only migration. Keep the existing runtime on its immutable deploy.
 * This is NOT a reconstruction of missing Next.js sources and never publishes.
 * The two existing scheduled functions must be reused without any code change.
 */
import { readFile } from 'node:fs/promises';
import { buildPatch, hash, ensure, fileInventory } from './publish.mjs';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile(new URL('./release.json', import.meta.url), 'utf8'));
const sourceId = config.expectedSourceDeploy;
const sourceOrigin = `https://${sourceId}--hohohosanta-live.netlify.app`;
const apiOrigin = 'https://api.netlify.com/api/v1';
const secret = process.env.NETLIFY_AUTH_TOKEN;
ensure(secret, 'NETLIFY_AUTH_TOKEN absent.');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, {method='GET', json, bytes, raw=false}={}) {
  ensure(path.startsWith('/') && !path.includes('..'), 'Chemin API incorrect.');
  const headers = {Authorization:`Bearer ${secret}`, Accept:'application/json'};
  if (json) headers['Content-Type']='application/json';
  if (bytes) headers['Content-Type']='application/octet-stream';
  if (raw) headers['Content-Type']='application/vnd.bitballoon.v1.raw';
  const r=await fetch(apiOrigin+path,{method,headers,body:bytes||(json?JSON.stringify(json):undefined),redirect:'error',signal:AbortSignal.timeout(45000)});
  ensure(r.ok,`API ${method} ${path.split('?')[0]} HTTP ${r.status}`);
  const b=Buffer.from(await r.arrayBuffer());
  return raw?b:(b.length?JSON.parse(b.toString()):{});
}
async function publicRead(url) {
  const r=await fetch(url,{redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
  const body=Buffer.from(await r.arrayBuffer());
  return {status:r.status,type:r.headers.get('content-type')||'',location:r.headers.get('location'),robots:r.headers.get('x-robots-tag'),body};
}
const site=await api(`/sites/${config.siteId}`);
ensure(site.custom_domain===config.hostname && site.published_deploy?.id===sourceId,'La production a changé.');
const source=await api(`/deploys/${sourceId}`);
ensure(source.site_id===config.siteId && source.state==='ready','Source invalide.');
const entries=await api(`/sites/${config.siteId}/files`);
const files=fileInventory(entries);
const downloads=new Map();
for(const p of Object.keys(config.files)) {
  const r=await publicRead(config.previewOrigin+p);
  ensure(r.status===200,`Aperçu inaccessible ${p}`);
  downloads.set(p,r.body);
}
const oldHome=await publicRead(sourceOrigin+'/');
ensure(oldHome.status===200,'Ancien accueil inaccessible.');
const patch=buildPatch(downloads,config,oldHome.body.toString());
const originalConfig=await api(`/deploys/${sourceId}/files/netlify.toml`,{raw:true});
ensure(hash(originalConfig)===files['/netlify.toml'],'Configuration différente de son empreinte.');
const text=originalConfig.toString();
ensure(!/^\s*from\s*=\s*["']\/\*["']/m.test(text),'Une route de repli existe déjà.');
ensure(!Object.hasOwn(files,'/_redirects'),'Redirections supplémentaires : examen requis.');
// Existing image CDN rules remain before the fallback. Static assets win.
const fallback=`\n\n# Transitional branding facade: the original deployed runtime remains authoritative.\n[[redirects]]\n  from = "/*"\n  to = "${sourceOrigin}/:splat"\n  status = 200\n  force = false\n`;
patch.set('/netlify.toml',Buffer.from(text+fallback));
const schedules=source.function_schedules||[];
ensure(schedules.length===2,'Inventaire des tâches inattendu.');
const names=new Set(schedules.map(x=>x.name));
const scheduled=(source.available_functions||[]).filter(f=>names.has(f.n));
ensure(scheduled.length===names.size,'Fonction planifiée absente.');
const functions={},functions_config={};
for(const f of scheduled) {
  ensure(/^[a-f0-9]{64}$/.test(f.d),'Empreinte de fonction invalide.');
  functions[f.n]=f.d;
  const c={};
  for(const [a,b] of [['dn','display_name'],['g','generator'],['bd','build_data'],['p','priority']]) if(f[a]!=null)c[b]=f[a];
  ensure(!f.ro?.length,'Route inattendue sur une tâche planifiée.');
  functions_config[f.n]=c;
}
const merged={...files,...Object.fromEntries([...patch].map(([p,b])=>[p,hash(b)]))};
ensure((await api(`/sites/${config.siteId}`)).published_deploy?.id===sourceId,'La production a changé.');
const draft=await api(`/sites/${config.siteId}/deploys?title=Branding%20facade%20validation%20-%20draft%20only`,{method:'POST',json:{files:merged,functions,functions_config,function_schedules:schedules,framework:source.framework,draft:true,async:true}});
ensure(draft.id && draft.site_id===config.siteId,'Réponse de création invalide. Ne pas relancer automatiquement.');
console.log('FACADE_DRAFT_CREATED',draft.id);
const byHash=new Map([...patch].map(([p,b])=>[hash(b),{p,b}]));
const uploaded=new Set();
let ready;
for(let i=0;i<80;i++) {
  const d=await api(`/deploys/${draft.id}`);
  ensure(!['error','rejected'].includes(d.state),'Brouillon refusé. Production inchangée.');
  ensure(!(d.required_functions?.length||d.required_edge_functions?.length||d.required_server?.length),'Tâches originales non réutilisables : arrêt.');
  for(const sha of d.required||[]) {
    const f=byHash.get(sha);ensure(f,'Fichier ancien demandé : arrêt.');
    if(!uploaded.has(sha)) {
      await api(`/deploys/${d.id}/files/${f.p.slice(1).split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',bytes:f.b});uploaded.add(sha);
    }
  }
  if(d.state==='ready'){ready=d;break;}
  await sleep(2000);
}
ensure(ready,'Brouillon non prêt dans le délai imparti.');
assert.deepEqual(ready.function_schedules,source.function_schedules,'Tâches modifiées.');
const reused=ready.available_functions||[];
ensure(reused.length===scheduled.length,'Nombre de tâches incorrect.');
for(const f of scheduled) {
  const g=reused.find(x=>x.n===f.n);ensure(g,'Tâche absente.');
  // Reusing the actual deployed function object also retains its environment.
  for(const k of ['d','id','oid','r','im','m','rg','bd'])assert.deepEqual(g[k],f[k],`Fonction planifiée modifiée : ${f.n}/${k}`);
}
const origin=`https://${draft.id}--hohohosanta-live.netlify.app`;
console.log('FACADE_DRAFT_READY',origin);
console.log('RUNTIME_REUSE',{scheduledFunctions:reused.map(x=>x.n),database_branch_id:ready.database_branch_id||null,source_database_branch_id:source.database_branch_id||null});
const report=[];
const home=await publicRead(origin+'/');
ensure(home.status===200 && home.body.includes(Buffer.from('data-hohoho-branding="2026-10-06"')),'Nouvel accueil non servi.');
for(const [p,b]of patch) {
  if(p==='/netlify.toml'||p==='/index.html')continue;
  const r=await publicRead(origin+p);ensure(r.status===200&&hash(r.body)===hash(b),`Ressource non servie ${p}`);
}
const scripts=new Set();
for(const p of config.pages) {
  const a=await publicRead(sourceOrigin+p),b=await publicRead(origin+p);
  const title=r=>r.body.toString().match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  report.push({path:p,before:a.status,after:b.status,titleMatches:title(a)===title(b),redirect:b.location||null});
  ensure(a.status===200&&b.status===200&&title(a)&&title(a)===title(b),`Page non conservée : ${p}`);
  ensure(!b.body.includes(Buffer.from('data-hohoho-branding=')),`Accueil retourné à la place de ${p}`);
  for(const m of b.body.toString().matchAll(/\bsrc=["'](\/_next\/[^"']+)["']/g))scripts.add(m[1].replaceAll('&amp;','&'));
}
for(const p of scripts) {
  const a=await publicRead(sourceOrigin+p),b=await publicRead(origin+p);
  ensure(a.status===200&&b.status===200&&hash(a.body)===hash(b.body),'Script applicatif non conservé.');
}
ensure((await api(`/sites/${config.siteId}`)).published_deploy?.id===sourceId,'La production a changé.');
console.log('READ_ONLY_PAGE_CHECKS',JSON.stringify(report));
console.log('SCRIPTS_CHECKED',scripts.size);
console.log('DRAFT_VALIDATED_NOT_PUBLISHED',draft.id);
console.log('LIMITATION: original runtime is retained, not reconstructed. No call or payment was triggered.');
