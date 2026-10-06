import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import theme from '../netlify/edge-functions/site-theme.ts';
const sample='<html><head><meta name="theme-color" content="#122e2d"><link rel="stylesheet" href="/original.css"></head><body><p>étoiles ✦</p></body></html>';
const context=(body=sample,type='text/html')=>({next:async()=>new Response(body,{headers:{'content-type':type}})});
test('adds versioned CSS and retains original page',async()=>{
 const r=await theme(new Request('https://example.test/parent'),context());const text=await r.text();
 assert.ok(text.includes('theme-20261006-v1.css'));assert.ok(text.includes('/original.css'));
 assert.equal(text.slice(text.indexOf('<body>')),sample.slice(sample.indexOf('<body>')));
 assert.ok(text.includes('content="#850909"'));
});
for(const path of ['/','/api/example','/_next/example','/.netlify/example','/branding-internal/example.css'])test('leaves excluded path unchanged '+path,async()=>{
 const r=await theme(new Request('https://example.test'+path),context());assert.equal(await r.text(),sample);
});
test('leaves non-document response unchanged',async()=>{
 const r=await theme(new Request('https://example.test/parent'),context('{"example":true}','application/json'));
 assert.equal(await r.text(),'{"example":true}');
});
test('leaves component response unchanged',async()=>{
 const r=await theme(new Request('https://example.test/parent',{headers:{rsc:'1'}}),context());assert.equal(await r.text(),sample);
});
test('leaves non-GET request unchanged',async()=>{
 const r=await theme(new Request('https://example.test/form',{method:'POST',body:'example'}),context());assert.equal(await r.text(),sample);
});
test('works with split head and UTF-8 characters',async()=>{
 const bytes=new TextEncoder().encode(sample);
 const stream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});
 const r=await theme(new Request('https://example.test/demo'),{next:async()=>new Response(stream,{headers:{'content-type':'text/html'}})});
 const text=await r.text();assert.ok(text.includes('étoiles ✦'));assert.equal((text.match(/data-hohoho-theme=/g)||[]).length,1);
});
test('leaves unusual document without head intact',async()=>{const r=await theme(new Request('https://example.test/parent'),context('example'));assert.equal(await r.text(),'example');});
test('stylesheet covers the internal screen families',async()=>{
 const css=await readFile(new URL('../branding/internal-pages.css',import.meta.url),'utf8');
 for(const c of ['.content-page','.brand-stamp','.flow-page','.input','.call-shell','.trial-video-call','.trial-upgrade-dialog','.account-form','.legal-section','.seo-hero'])assert.ok(css.includes(c));
});
