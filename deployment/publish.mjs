/**
 * HoHoHo Santa: prepare a branding-only draft from the published deploy.
 * No framework rebuild, no database writes, no call/payment API requests.
 * CLI only: process.env is intentionally used here, not in a Netlify Function.
 * Default is an authenticated read-only plan. See README before --prepare.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const DIR = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.netlify.com/api/v1';
const STATE = join(DIR, '.state');
const STATE_FILE = join(STATE, 'release.json');
const MARKER = 'data-hohoho-branding="2026-10-06"';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const hash = (data, algorithm = 'sha1') => createHash(algorithm).update(data).digest('hex');
export function ensure(condition, message) { if (!condition) throw new Error(message); }
const equal = (a, b, message) => { try { assert.deepEqual(a, b); } catch { throw new Error(message); } };
const sortObject = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

// These field aliases are returned by GET /deploys/{id}. Unknown runtime types
// or incomplete metadata are rejected rather than silently dropping functions.
export function functionPlan(deploy, expectedNames) {
  const items = deploy.available_functions;
  ensure(Array.isArray(items), 'Inventaire des fonctions indisponible. Arrêt.');
  equal(items.map(f => f.n).sort(), [...expectedNames].sort(), 'Liste des fonctions différente de celle attendue.');
  ensure(!deploy.edge_functions_present, 'Des Edge Functions nécessitent une intégration distincte.');
  ensure(!(deploy.required_server?.length) && !deploy.server, 'Netlify Server non pris en charge par cette procédure.');
  const functions = {}, configs = {}, fingerprints = {};
  for (const f of items) {
    ensure(typeof f.n === 'string' && /^[a-f0-9]{64}$/.test(f.d || ''), 'Empreinte de fonction invalide.');
    ensure(/^nodejs\d+\.x$/.test(f.r || ''), 'Runtime de fonction non pris en charge.');
    ensure(['stream', 'background', 'buffered'].includes(f.im), 'Mode d’invocation inconnu.');
    functions[f.n] = f.d;
    const c = {};
    for (const [from, to] of [['dn','display_name'], ['g','generator'], ['bd','build_data'], ['m','memory'], ['p','priority'], ['rg','region']]) {
      if (f[from] !== null && f[from] !== undefined) c[to] = f[from];
    }
    if (f.ro) c.routes = f.ro.map(r => {
      const out = {};
      for (const [from,to] of [['p','pattern'], ['l','literal'], ['e','expression'], ['m','methods'], ['ps','prefer_static']]) {
        if (r[from] !== null && r[from] !== undefined) out[to] = r[from];
      }
      return out;
    });
    ensure(!f.excluded_routes?.length && !f.exro?.length && !f.event_subscriptions?.length,
      'Configuration de fonction non gérée : vérification manuelle nécessaire.');
    configs[f.n] = c;
    fingerprints[f.n] = {
      digest: f.d, runtime: f.r, invocation: f.im, region: f.rg,
      memory: f.m, priority: f.p, routes: c.routes || [], build_data: f.bd || null
    };
  }
  const schedules = deploy.function_schedules || [];
  ensure(schedules.every(s => Object.hasOwn(functions, s.name)), 'Tâche planifiée sans fonction correspondante.');
  return { functions, configs, fingerprints: sortObject(fingerprints), schedules: [...schedules].sort((a,b) => a.name.localeCompare(b.name)) };
}
export function fileInventory(entries) {
  ensure(Array.isArray(entries) && entries.length > 0, 'Inventaire des fichiers vide.');
  const out = {};
  for (const f of entries) {
    ensure(typeof f.path === 'string' && /^[a-f0-9]{40}$/.test(f.sha || ''), 'Inventaire de fichiers incomplet.');
    const path = '/' + f.path.replace(/^\/+/, '');
    ensure(!path.split('/').includes('..') && !Object.hasOwn(out,path), 'Chemin de fichier invalide ou dupliqué.');
    out[path] = f.sha;
  }
  ensure(Object.keys(out).some(p => p.startsWith('/_next/')), 'Les fichiers Next.js sont absents.');
  return out;
}
export function buildPatch(downloads, config, oldHtml = '') {
  const prefix = config.prefix;
  const patch = new Map();
  for (const [path, digest] of Object.entries(config.files)) {
    const b = downloads.get(path);
    ensure(Buffer.isBuffer(b) && hash(b,'sha256') === digest, `Fichier de référence modifié : ${path}`);
    if (path !== '/') patch.set(prefix + path, b);
  }
  let html = downloads.get('/').toString('utf8');
  ensure(html.includes('santa-design') && html.includes('logo-hohoho-santa.webp'), 'La page de référence ne correspond pas au nouveau design.');
  html = html.replace(/<meta\s+name=["']robots["'][^>]*>/i, '<meta name="robots" content="index,follow">')
    .replace(/\b(href|src)=(["'])(assets\/[^"']+|styles\.css|site\.webmanifest)\2/g,
      (_m, attr, q, path) => `${attr}=${q}${prefix}/${path}${q}`)
    .replace(/https:\/\/hohohosanta\.app(?=[/"'])/g, '')
    .replace(/href=(["'])\1/g, 'href="/"')
    .replace('<body ', `<body ${MARKER} `);
  // Preserve site verification, not old React hydration scripts.
  const verification = oldHtml.match(/<meta\b[^>]*name=["'](?:google-site-verification|msvalidate\.01)["'][^>]*>/gi) || [];
  html = html.replace('</head>', `<link rel="canonical" href="https://${config.hostname}/">\n${verification.join('\n')}\n</head>`);
  patch.set('/index.html', Buffer.from(html));
  const manifest = JSON.parse(downloads.get('/site.webmanifest').toString('utf8'));
  for (const icon of manifest.icons || []) icon.src = prefix + '/' + icon.src.replace(/^\//, '');
  patch.set(prefix + '/site.webmanifest', Buffer.from(JSON.stringify(manifest)));
  patch.set('/favicon.ico', downloads.get('/assets/favicon.ico'));
  patch.set('/apple-touch-icon.png', downloads.get('/assets/apple-touch-icon.png'));
  const png = downloads.get('/assets/favicon.png').toString('base64');
  patch.set('/icon.svg', Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${png}"/></svg>`));
  return patch;
}

async function token() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  try {
    // Official Netlify CLI store; read only the active login, never print it.
    const { getGlobalConfigStore } = await import('@netlify/dev-utils');
    const store = await getGlobalConfigStore();
    const id = store.get('userId');
    const value = id && store.get(`users.${id}.auth.token`);
    if (value) return value;
  } catch { /* No logged-in CLI in this environment. */ }
  throw new Error('Connexion requise : npm install puis npm run login dans deployment/. Ne transmettez aucune clé dans le chat.');
}
function apiClient(secret) {
  return async (path, { method = 'GET', body, bytes } = {}) => {
    const u = new URL(path.startsWith('https:') ? path : API + path);
    ensure(u.origin === 'https://api.netlify.com' && u.pathname.startsWith('/api/v1/'), 'Destination API refusée.');
    const headers = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bytes) headers['Content-Type'] = 'application/octet-stream';
    const r = await fetch(u, { method, headers, body: bytes || (body !== undefined ? JSON.stringify(body) : undefined),
      redirect: 'error', signal: AbortSignal.timeout(60000) });
    ensure(r.ok, `API Netlify ${method} ${u.pathname} : HTTP ${r.status}. Aucune relance automatique de l’écriture.`);
    const text = await r.text();
    return { data: text ? JSON.parse(text) : {}, next: r.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
  };
}
async function publicGet(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(35000) });
  ensure(new URL(r.url).origin === new URL(url).origin, 'Redirection vers un autre domaine : test non concluant.');
  ensure(r.ok, `Page ou ressource inaccessible : ${new URL(url).pathname} (HTTP ${r.status}).`);
  return { bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '', robots: r.headers.get('x-robots-tag') || '' };
}
async function head(api, config) {
  const { data: site } = await api(`/sites/${config.siteId}`);
  ensure(site.id === config.siteId && site.custom_domain === config.hostname, 'Le site ou le domaine ne correspond pas.');
  ensure(!site.published_deploy?.locked, 'Déploiement verrouillé : publication interrompue.');
  ensure(site.published_deploy?.id, 'Déploiement publié introuvable.');
  return site.published_deploy.id;
}
async function allFiles(api, siteId) {
  let path = `/sites/${siteId}/files`, result = [], seen = new Set();
  while (path) {
    ensure(!seen.has(path), 'Pagination cyclique.'); seen.add(path);
    const r = await api(path); result.push(...r.data); path = r.next;
  }
  return fileInventory(result);
}
async function getDeploy(api, config, id) {
  const { data: d } = await api(`/deploys/${id}`);
  ensure(d.site_id === config.siteId && d.id === id, 'Déploiement d’un autre site.');
  return d;
}
function checkRuntime(source, draft, config) {
  const a = functionPlan(source,config.expectedFunctions), b = functionPlan(draft,config.expectedFunctions);
  equal(a.fingerprints,b.fingerprints,'Fonctions, routes ou paramètres modifiés : publication interdite.');
  equal(a.schedules,b.schedules,'Tâches planifiées modifiées : publication interdite.');
  equal(source.database_branch_id || null,draft.database_branch_id || null,'Branche de base de données différente : publication interdite.');
  equal(source.blobs_region || null,draft.blobs_region || null,'Région du stockage différente : publication interdite.');
  equal(source.functions_region_overrides || [],draft.functions_region_overrides || [],'Régions de fonctions différentes.');
}
async function validatePages(origin, sourceOrigin, config, patch) {
  const home = await publicGet(origin + '/');
  ensure(home.type.includes('text/html') && home.bytes.toString().includes(MARKER), 'Le nouvel accueil n’est pas servi.');
  ensure(!/noindex/i.test(home.robots), 'L’accueil conserve un en-tête noindex.');
  for (const [path, bytes] of patch) {
    if (path === '/index.html') continue;
    const actual = await publicGet(origin + path);
    ensure(hash(actual.bytes) === hash(bytes), `Ressource modifiée ou inaccessible : ${path}`);
  }
  const scripts = new Set();
  for (const path of config.pages) {
    const before = await publicGet(sourceOrigin + path), after = await publicGet(origin + path);
    ensure(before.type.includes('text/html') && after.type.includes('text/html'), `Type de page incorrect : ${path}`);
    const a = before.bytes.toString(), b = after.bytes.toString();
    ensure(!b.includes(MARKER), `La page ${path} a été remplacée par l’accueil.`);
    const title = s => s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    ensure(title(a) && title(a) === title(b), `Titre différent : ${path}`);
    for (const m of b.matchAll(/\bsrc=["'](\/_next\/[^"']+)["']/g)) scripts.add(m[1].replaceAll('&amp;','&'));
  }
  ensure(scripts.size > 0, 'Scripts de l’application absents.');
  for (const path of scripts) {
    const [a,b] = await Promise.all([publicGet(sourceOrigin+path),publicGet(origin+path)]);
    ensure(hash(a.bytes) === hash(b.bytes), 'Un script de l’application a changé.');
  }
  console.log(`Contrôles GET réussis : ${config.pages.length} pages et ${scripts.size} scripts. Aucun appel ni paiement déclenché.`);
}
async function waitReady(api, config, id, patch) {
  const uploaded = new Set(), byHash = new Map([...patch].map(([p,b]) => [hash(b),{ path:p,bytes:b }]));
  const end = Date.now() + 8 * 60 * 1000;
  while (Date.now() < end) {
    const d = await getDeploy(api,config,id);
    ensure(!['error','rejected'].includes(d.state), 'Netlify a rejeté le brouillon. La production reste inchangée.');
    ensure(!(d.required_functions?.length || d.required_edge_functions?.length || d.required_server?.length),
      'Netlify exige des binaires serveur non réutilisables. Arrêt sans publication.');
    for (const sha of d.required || []) {
      const f = byHash.get(sha);
      ensure(f, 'Netlify exige un fichier ancien indisponible. Arrêt sans publication.');
      if (!uploaded.has(sha)) {
        await api(`/deploys/${id}/files/${f.path.slice(1).split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',bytes:f.bytes});
        uploaded.add(sha);
      }
    }
    if (d.state === 'ready') return d;
    await sleep(2500);
  }
  throw new Error(`Le brouillon ${id} n’est pas prêt après huit minutes. Production inchangée.`);
}
async function main() {
  ensure(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22.13 ou ultérieur est nécessaire.');
  const flags = process.argv.slice(2);
  ensure(flags.length <= 1 && flags.every(f => ['--assets-check','--prepare','--publish','--rollback'].includes(f)), 'Options : --assets-check, --prepare, --publish ou --rollback.');
  const mode = flags[0] || '--plan';
  const config = JSON.parse(await readFile(join(DIR,'release.json'),'utf8'));
  const downloads = new Map();
  if (mode !== '--rollback') for (const path of Object.keys(config.files)) {
    const { bytes } = await publicGet(config.previewOrigin + path);
    downloads.set(path,bytes);
  }
  if (mode === '--assets-check') {
    const patch = buildPatch(downloads,config);
    console.log(`Références vérifiées : ${downloads.size} fichiers ; ${patch.size} fichiers de remplacement préparables. Aucune authentification ni écriture.`);
    return;
  }
  const api = apiClient(await token());
  if (mode === '--rollback') {
    const state = JSON.parse(await readFile(STATE_FILE,'utf8'));
    ensure(state.siteId === config.siteId, 'Sauvegarde d’un autre site.');
    ensure(await head(api,config) === state.draftId, 'La production a changé depuis cette publication. Arrêt.');
    await api(`/sites/${config.siteId}/deploys/${state.sourceId}/restore`,{method:'POST'});
    ensure(await head(api,config) === state.sourceId, 'Restauration non confirmée.');
    console.log('Ancien déploiement restauré.'); return;
  }
  const sourceId = await head(api,config);
  ensure(sourceId === config.expectedSourceDeploy, 'Le déploiement source a changé. Réévaluation nécessaire avant publication.');
  const source = await getDeploy(api,config,sourceId), plan = functionPlan(source,config.expectedFunctions);
  ensure(source.state === 'ready', 'Source non prête.');
  const sourceOrigin = source.links?.permalink || source.deploy_ssl_url;
  ensure(new URL(sourceOrigin).hostname.endsWith('--hohohosanta-live.netlify.app'), 'Origine source inattendue.');
  const files = await allFiles(api,config.siteId);
  ensure(await head(api,config) === sourceId, 'Publication concurrente détectée.');
  const patch = buildPatch(downloads,config,(await publicGet(sourceOrigin+'/')).bytes.toString());
  for (const path of patch.keys()) {
    ensure(['/index.html','/favicon.ico','/icon.svg','/apple-touch-icon.png'].includes(path) || path.startsWith(config.prefix+'/'), 'Modification hors périmètre.');
    ensure(!path.startsWith(config.prefix+'/') || !Object.hasOwn(files,path), 'Espace de fichiers de marque déjà utilisé.');
  }
  console.log(`Plan : conserver ${Object.keys(files).length} fichiers, ${Object.keys(plan.functions).length} fonctions et ${plan.schedules.length} tâches ; appliquer ${patch.size} fichiers de marque.`);
  if (mode === '--plan') { console.log('Aucune écriture. Utiliser --prepare pour créer et contrôler un brouillon.'); return; }
  await mkdir(STATE,{recursive:true,mode:0o700});
  const merged = {...files,...Object.fromEntries([...patch].map(([p,b]) => [p,hash(b)]))};
  let draft, state;
  if (mode === '--prepare') {
    const {data:created} = await api(`/sites/${config.siteId}/deploys?title=HoHoHo%20Santa%20-%20branding%20with%20existing%20application`, {
      method:'POST',body:{files:merged,functions:plan.functions,functions_config:plan.configs,
        function_schedules:plan.schedules,framework:source.framework,draft:true,async:true}
    });
    ensure(created.id, 'Réponse sans identifiant de brouillon : ne pas relancer automatiquement.');
    state = {siteId:config.siteId,sourceId,draftId:created.id,patch:sortObject(Object.fromEntries([...patch].map(([p,b])=>[p,hash(b)]))),validated:false};
    await writeFile(STATE_FILE,JSON.stringify(state,null,2),{mode:0o600});
    console.log(`Brouillon créé : ${created.id}. Production inchangée.`);
    draft = await waitReady(api,config,created.id,patch);
  } else {
    state = JSON.parse(await readFile(STATE_FILE,'utf8'));
    ensure(state.validated && state.siteId === config.siteId && state.sourceId === sourceId, 'Créer et valider le brouillon avec --prepare avant --publish.');
    equal(state.patch,sortObject(Object.fromEntries([...patch].map(([p,b])=>[p,hash(b)]))),'Les fichiers ont changé depuis les contrôles.');
    draft = await getDeploy(api,config,state.draftId);
    ensure(draft.state === 'ready','Le brouillon n’est plus prêt.');
  }
  checkRuntime(source,draft,config);
  const draftOrigin = draft.links?.permalink || draft.deploy_ssl_url;
  ensure(new URL(draftOrigin).hostname.endsWith('--hohohosanta-live.netlify.app'),'URL de brouillon inattendue.');
  await validatePages(draftOrigin,sourceOrigin,config,patch);
  ensure(await head(api,config) === sourceId,'La production a changé pendant les contrôles.');
  state.validated = true;
  await writeFile(STATE_FILE,JSON.stringify(state,null,2),{mode:0o600});
  console.log(`Brouillon contrôlé : ${draftOrigin}`);
  if (mode !== '--publish') { console.log('Production inchangée. Vérifier visuellement ce lien avant --publish.'); return; }
  try {
    await api(`/sites/${config.siteId}/deploys/${draft.id}/restore`,{method:'POST'});
    ensure(await head(api,config) === draft.id,'La publication n’est pas confirmée par Netlify.');
    await validatePages('https://'+config.hostname,sourceOrigin,config,patch);
    checkRuntime(source,await getDeploy(api,config,draft.id),config);
    console.log(`PUBLIÉ ET CONTRÔLÉ : https://${config.hostname}`);
  } catch (error) {
    // A write timeout is ambiguous: inspect head instead of reissuing the write.
    if (await head(api,config) === draft.id) {
      await api(`/sites/${config.siteId}/deploys/${sourceId}/restore`,{method:'POST'});
      ensure(await head(api,config) === sourceId,'Retour arrière non confirmé : contrôler le tableau de bord Netlify.');
      console.error('Échec d’un contrôle : ancien déploiement restauré.');
    }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('ARRÊT : '+error.message); process.exitCode=1; });
}
