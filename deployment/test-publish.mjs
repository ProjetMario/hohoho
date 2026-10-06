import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, functionPlan, fileInventory, buildPatch } from './publish.mjs';

function fixture() {
  return { available_functions: [
    {n:'___netlify-server-handler',d:'a'.repeat(64),r:'nodejs24.x',im:'stream',m:1024,p:0,rg:'us-east-2',
     bd:{bootstrapVersion:'2.18.0',runtimeAPIVersion:2},ro:[{p:'/*',l:null,e:'^(?:/(.*))/?$',m:null,ps:true}]},
    {n:'santa-cleanup',d:'b'.repeat(64),r:'nodejs24.x',im:'stream',m:1024,p:10,rg:'us-east-2'},
    {n:'santa-call-background',d:'c'.repeat(64),r:'nodejs24.x',im:'background',m:1024,p:10,rg:'us-east-2'}
  ],function_schedules:[{name:'santa-cleanup',cron:'* * * * *'}] };
}
const names=['___netlify-server-handler','santa-cleanup','santa-call-background'];
test('retains every function digest, runtime and invocation mode',()=>{
 const p=functionPlan(fixture(),names);
 assert.equal(Object.keys(p.functions).length,3);
 assert.equal(p.functions['santa-call-background'],'c'.repeat(64));
 assert.equal(p.fingerprints['santa-call-background'].invocation,'background');
});
test('retains Next.js routes and static-file precedence',()=>{
 const p=functionPlan(fixture(),names);
 assert.deepEqual(p.configs['___netlify-server-handler'].routes,[{pattern:'/*',expression:'^(?:/(.*))/?$',prefer_static:true}]);
 assert.equal(p.configs['___netlify-server-handler'].memory,1024);
 assert.equal(p.configs['___netlify-server-handler'].priority,0);
});
test('retains schedules',()=>assert.deepEqual(functionPlan(fixture(),names).schedules,[{name:'santa-cleanup',cron:'* * * * *'}]));
test('refuses a missing function',()=>{
 const d=fixture(); d.available_functions.pop(); assert.throws(()=>functionPlan(d,names),/Liste des fonctions/);
});
test('refuses unavailable digest and unknown invocation mode',()=>{
 const d=fixture();d.available_functions[0].d='bad';assert.throws(()=>functionPlan(d,names),/Empreinte/);
 d.available_functions[0].d='a'.repeat(64);d.available_functions[0].im='unknown';assert.throws(()=>functionPlan(d,names),/invocation/);
});
test('refuses unsupported edge and server deployments',()=>{
 const d=fixture();d.edge_functions_present=true;assert.throws(()=>functionPlan(d,names),/Edge/);
 d.edge_functions_present=false;d.server={sha:'a'.repeat(64)};assert.throws(()=>functionPlan(d,names),/Server/);
});
test('refuses an orphaned scheduled task',()=>{
 const d=fixture();d.function_schedules.push({name:'not-found',cron:'0 0 * * *'});assert.throws(()=>functionPlan(d,names),/Tâche/);
});
test('preserves existing redirects and headers in the file inventory',()=>{
 const p=fileInventory([{path:'_next/static/a.js',sha:'a'.repeat(40)},{path:'/_redirects',sha:'b'.repeat(40)},{path:'_headers',sha:'c'.repeat(40)}]);
 assert.equal(p['/_redirects'],'b'.repeat(40));assert.equal(p['/_headers'],'c'.repeat(40));
});
test('refuses invalid, duplicate and incomplete static manifests',()=>{
 assert.throws(()=>fileInventory([]));
 assert.throws(()=>fileInventory([{path:'_next/a',sha:'bad'}]));
 assert.throws(()=>fileInventory([{path:'_next/a',sha:'a'.repeat(40)},{path:'/_next/a',sha:'b'.repeat(40)}]));
 assert.throws(()=>fileInventory([{path:'x/../_next/a',sha:'a'.repeat(40)}]));
});
function assets() {
 const html='<html><head><meta name="robots" content="noindex,nofollow"><link href="styles.css"><link href="site.webmanifest"></head><body class="santa-design"><img src="assets/logo-hohoho-santa.webp"><a href="https://hohohosanta.app/essai">Essai</a><a href="https://hohohosanta.app">Accueil</a></body></html>';
 const map=new Map([
  ['/',Buffer.from(html)],['/styles.css',Buffer.from('body{}')],
  ['/site.webmanifest',Buffer.from('{"icons":[{"src":"assets/icon-192.png"}]}')],
  ['/assets/logo-hohoho-santa.webp',Buffer.from('webp')],
  ['/assets/favicon.ico',Buffer.from('ico')],['/assets/favicon.png',Buffer.from('png')],
  ['/assets/apple-touch-icon.png',Buffer.from('apple')]
 ]);
 return {map, config:{hostname:'hohohosanta.app',prefix:'/branding-20261006',files:Object.fromEntries([...map].map(([p,b])=>[p,hash(b,'sha256')]))}};
}
test('isolates assets, removes preview noindex and preserves domain verification',()=>{
 const {map,config}=assets();
 const patch=buildPatch(map,config,'<meta name="google-site-verification" content="example-public-verification">');
 const html=patch.get('/index.html').toString();
 assert.match(html,/data-hohoho-branding/);assert.match(html,/content="index,follow"/);
 assert.match(html,/href="\/branding-20261006\/styles.css"/);
 assert.match(html,/href="\/essai"/);assert.match(html,/href="\/"/);
 assert.match(html,/google-site-verification/);assert.match(html,/rel="canonical"/);
 assert.ok(patch.has('/favicon.ico'));assert.ok(patch.has('/icon.svg'));
 assert.ok(!patch.has('/_redirects'));assert.ok(!patch.has('/_headers'));
 assert.ok(!patch.has('/robots.txt'));assert.ok(!patch.has('/essai'));
 const manifest=JSON.parse(patch.get('/branding-20261006/site.webmanifest').toString());
 assert.equal(manifest.icons[0].src,'/branding-20261006/assets/icon-192.png');
});
test('refuses changed approved assets',()=>{
 const {map,config}=assets();map.set('/assets/favicon.png',Buffer.from('different'));
 assert.throws(()=>buildPatch(map,config),/Fichier de référence modifié/);
});
