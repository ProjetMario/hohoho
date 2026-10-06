/** Preserve the production function environment. Never substitute a proxy runtime.
 * --prepare: lock the existing live deploy, stage a full production-context version,
 * verify files/functions/database/pages, and leave the original site live for review.
 * --validate ID / --publish ID: validate that exact version again; publish only explicitly.
 * Credentials stay in the GitHub Actions secret. No customer APIs or SQL are called.
 */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {hash,ensure,fileInventory,functionPlan,buildPatch} from './publish.mjs';
const cfg=JSON.parse(await readFile(new URL('./release.json',import.meta.url),'utf8'));
const sourceId=cfg.expectedSourceDeploy;
const title='HoHoHo Santa - full application branding';
const args=process.argv.slice(2),mode=args[0],candidateId=args[1];
ensure(['--prepare','--validate','--publish'].includes(mode),'Mode invalide.');
ensure(mode==='--prepare'?args.length===1:args.length===2&&/^[a-f0-9]{24}$/.test(candidateId||''),'Arguments invalides.');
const secret=process.env.NETLIFY_AUTH_TOKEN;
ensure(secret,'Secret Netlify absent.');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,{method='GET',json,bytes}={}) {
  const u=new URL('https://api.netlify.com/api/v1'+path);
  ensure(path.startsWith('/')&&!path.includes('..')&&u.origin==='https://api.netlify.com','Destination incorrecte.');
  const headers={Authorization:`Bearer ${secret}`,Accept:'application/json'};
  if(json!==undefined)headers['Content-Type']='application/json';
  if(bytes)headers['Content-Type']='application/octet-stream';
  const r=await fetch(u,{method,headers,body:bytes||(json!==undefined?JSON.stringify(json):undefined),redirect:'error',signal:AbortSignal.timeout(50000)});
  ensure(r.ok,`Netlify ${method} ${u.pathname} HTTP ${r.status}`);
  const text=await r.text();return text?JSON.parse(text):{};
}
async function publicRead(url) {
  const r=await fetch(url,{redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
  ensure(r.status===200,`Ressource HTTP ${r.status}: ${new URL(url).pathname}`);
  return {bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||'',robots:r.headers.get('x-robots-tag')||''};
}
async function current() {
  const s=await api(`/sites/${cfg.siteId}`);
  ensure(s.id===cfg.siteId&&s.custom_domain===cfg.hostname,'Projet/domaine différent.');
  return s;
}
async function deploy(id) {
  const d=await api(`/deploys/${id}`);ensure(d.id===id&&d.site_id===cfg.siteId,'Déploiement différent.');return d;
}
async function unchangedAndLocked() {
  const s=await current();
  ensure(s.published_deploy?.id===sourceId,'Une autre version a été publiée. Arrêt.');
  ensure((await deploy(sourceId)).locked===true,'Le verrou de publication manque. Arrêt.');
}
function configsForProduction(source) {
  const p=functionPlan(source,cfg.expectedFunctions);
  ensure(!(source.functions_region_overrides?.length),'Régions particulières : examen requis.');
  const configs=structuredClone(p.configs);
  // Source deployment has no region overrides; preserve the site defaults.
  for(const c of Object.values(configs)){delete c.region;delete c.memory;}
  return {...p,configs};
}
function runtimeEqual(a,b) {
  ensure(b.context==='production','La nouvelle version n’a pas le contexte production.');
  assert.deepEqual(functionPlan(b,cfg.expectedFunctions).fingerprints,functionPlan(a,cfg.expectedFunctions).fingerprints,'Code ou configuration des fonctions différent.');
  assert.deepEqual(b.function_schedules,a.function_schedules,'Tâches modifiées.');
  for(const f of a.available_functions) {
    const g=b.available_functions.find(x=>x.n===f.n);
    // Same lambda object and original ID: not the older preview-environment cache.
    for(const k of ['id','oid','d','r','im','bd','rg','m'])assert.deepEqual(g[k],f[k],`Environnement runtime différent: ${f.n}/${k}`);
  }
  assert.equal(b.database_branch_id,a.database_branch_id,'Branche de base de données différente.');
  assert.equal(b.blobs_region,a.blobs_region,'Stockage différent.');
  assert.deepEqual(b.functions_region_overrides||[],a.functions_region_overrides||[],'Régions différentes.');
  ensure(!(b.database_migrations?.files?.length),'Migrations non prévues : arrêt.');
}
async function validateFiles(id,expected) {
  const records=await api(`/deploys/${id}/files?per_page=1000`);
  const actual=fileInventory(records);
  assert.deepEqual(actual,expected,'Inventaire des fichiers différent.');
}
async function validatePages(origin,sourceOrigin,patch) {
  const home=await publicRead(origin+'/');
  ensure(home.type.includes('text/html')&&home.bytes.includes(Buffer.from('data-hohoho-branding="2026-10-06"')),'Nouvel accueil non servi.');
  ensure(home.bytes.toString().includes('<meta name="robots" content="index,follow">'),'Directive HTML robots incorrecte.');
  // Netlify adds X-Robots-Tag:noindex to unpublished production permalinks.
  // It must disappear on the actual public hostname after manual publication.
  // https://docs.netlify.com/deploy/deploy-overview/#search-engine-indexing
  if(new URL(origin).hostname===cfg.hostname)ensure(!/noindex/i.test(home.robots),'Accueil publié non indexable.');
  else ensure(/^[a-f0-9]{24}--hohohosanta-live\.netlify\.app$/.test(new URL(origin).hostname),'Origine de test inattendue.');
  for(const[p,b]of patch) {
    if(p==='/index.html')continue;
    const r=await publicRead(origin+p);ensure(hash(r.bytes)===hash(b),`Fichier de marque différent: ${p}`);
  }
  const scripts=new Set();
  const pageTitle=b=>b.toString().match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  for(const p of cfg.pages) {
    const[a,b]=await Promise.all([publicRead(sourceOrigin+p),publicRead(origin+p)]);
    ensure(a.type.includes('text/html')&&b.type.includes('text/html'),'Type de page différent.');
    ensure(pageTitle(a.bytes)&&pageTitle(a.bytes)===pageTitle(b.bytes),`Titre de page différent: ${p}`);
    ensure(!b.bytes.includes(Buffer.from('data-hohoho-branding=')),`Page remplacée par l’accueil: ${p}`);
    for(const m of b.bytes.toString().matchAll(/\bsrc=["'](\/_next\/[^"']+)["']/g))scripts.add(m[1].replaceAll('&amp;','&'));
  }
  ensure(scripts.size>0,'Scripts applicatifs absents.');
  for(const p of scripts) {
    const[a,b]=await Promise.all([publicRead(sourceOrigin+p),publicRead(origin+p)]);
    ensure(hash(a.bytes)===hash(b.bytes),'Script applicatif modifié.');
  }
  console.log('PAGE_CHECKS_PASSED',JSON.stringify({pages:cfg.pages.length,scripts:scripts.size,brandFiles:patch.size}));
}
async function main() {
  const site=await current();ensure(site.published_deploy?.id===sourceId,'Production différente de la source attendue.');
  const source=await deploy(sourceId);ensure(source.state==='ready'&&source.context==='production','Source invalide.');
  const sourceOrigin=source.links?.permalink||source.deploy_ssl_url;
  ensure(sourceOrigin===`https://${sourceId}--hohohosanta-live.netlify.app`,'Adresse source différente.');
  const files=fileInventory(await api(`/sites/${cfg.siteId}/files`));
  const downloads=new Map();
  for(const p of Object.keys(cfg.files))downloads.set(p,(await publicRead(cfg.previewOrigin+p)).bytes);
  const patch=buildPatch(downloads,cfg,(await publicRead(sourceOrigin+'/')).bytes.toString());
  const expected={...files,...Object.fromEntries([...patch].map(([p,b])=>[p,hash(b)]))};
  const plan=configsForProduction(source);
  let id=candidateId,ownedLock=false;
  try {
    if(mode==='--prepare') {
      ensure(!source.locked,'Verrou préexistant : aucune modification automatique.');
      const ds=await api(`/sites/${cfg.siteId}/deploys?per_page=50`);
      ensure(!ds.some(d=>d.context==='production'&&!['ready','error','rejected'].includes(d.state)),'Autre déploiement de production en cours.');
      await api(`/deploys/${sourceId}/lock`,{method:'POST'});ownedLock=true;
      await unchangedAndLocked();console.log('ORIGINAL_PUBLICATION_LOCKED',sourceId);
      const created=await api(`/sites/${cfg.siteId}/deploys?title=${encodeURIComponent(title)}`,{method:'POST',json:{files:expected,functions:plan.functions,functions_config:plan.configs,function_schedules:plan.schedules,framework:source.framework,draft:false,async:true}});
      ensure(created.id&&created.site_id===cfg.siteId,'Création ambiguë : contrôler Netlify, ne pas relancer automatiquement.');
      id=created.id;console.log('STAGED_PRODUCTION_CREATED',id);
      const byHash=new Map([...patch].map(([p,b])=>[hash(b),{p,b}]));const uploaded=new Set();let ready=false;
      for(let i=0;i<100;i++) {
        await unchangedAndLocked();
        const d=await deploy(id);
        ensure(d.context==='production','Contexte de création incorrect.');
        ensure(!['error','rejected'].includes(d.state),'Déploiement refusé.');
        if(d.required_functions?.length)console.log('REQUIRED_FUNCTION_NAMES',source.available_functions.filter(f=>d.required_functions.includes(f.d)).map(f=>f.n));
        ensure(!(d.required_functions?.length||d.required_server?.length||d.required_edge_functions?.length),'Archives de production non réutilisables.');
        for(const sha of d.required||[]) {
          const f=byHash.get(sha);ensure(f,'Fichier ancien indisponible.');
          if(!uploaded.has(sha)){await api(`/deploys/${id}/files/${f.p.slice(1).split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',bytes:f.b});uploaded.add(sha);}
        }
        if(d.state==='ready'){ready=true;break;}
        await sleep(1800);
      }
      ensure(ready,'Délai de préparation dépassé.');
    } else await unchangedAndLocked();
    let ready=await deploy(id);
    ensure(ready.state==='ready'&&ready.title===title,'Version non éligible.');
    runtimeEqual(source,ready);console.log('ALL_5_PRODUCTION_FUNCTIONS_AND_DATABASE_RETAINED');
    await validateFiles(id,expected);
    const origin=`https://${id}--hohohosanta-live.netlify.app`;
    await validatePages(origin,sourceOrigin,patch);
    await unchangedAndLocked();
    console.log('STAGED_PRODUCTION_VALIDATED',origin);
    if(mode!=='--publish') {console.log('ORIGINAL_REMAINS_LIVE_AND_LOCKED_FOR_REVIEW');return;}
    // Explicit manual publication works while auto-publishing remains locked.
    await api(`/sites/${cfg.siteId}/deploys/${id}/restore`,{method:'POST'});
    ensure((await current()).published_deploy?.id===id,'Publication non confirmée.');
    ready=await deploy(id);runtimeEqual(source,ready);
    await validatePages(`https://${cfg.hostname}`,sourceOrigin,patch);
    console.log('PUBLISHED_AND_VERIFIED',JSON.stringify({hostname:cfg.hostname,deployId:id,functions:5,schedules:2,databaseBranch:ready.database_branch_id}));
    // Restore normal auto-publishing only if this deployment is still current.
    if((await current()).published_deploy?.id===id && ready.locked===true)await api(`/deploys/${id}/unlock`,{method:'POST'});
  } catch(e) {
    console.error('STOP',e.message);
    const now=await current();
    if(mode==='--prepare'&&ownedLock&&now.published_deploy?.id===sourceId) {
      // Delete only the unpublished candidate created by this run, then undo our lock.
      if(id)await api(`/deploys/${id}`,{method:'DELETE'});
      if((await current()).published_deploy?.id===sourceId)await api(`/deploys/${sourceId}/unlock`,{method:'POST'});
      console.log('ORIGINAL_UNCHANGED_AND_UNLOCKED');
    } else if(id&&now.published_deploy?.id===id&&(mode==='--publish'||ownedLock)) {
      await api(`/sites/${cfg.siteId}/deploys/${sourceId}/restore`,{method:'POST'});
      ensure((await current()).published_deploy?.id===sourceId,'Retour à la source non confirmé.');
      console.log('ORIGINAL_RESTORED_AFTER_FAILED_POSTCHECK');
    }
    throw e;
  }
}
main().catch(e=>{console.error('PUBLICATION_STOPPED',e.message);process.exitCode=1;});
