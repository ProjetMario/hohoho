import {bundle} from '@netlify/edge-bundler';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const dist=resolve(root,'.netlify/edge-functions-dist');
await bundle([resolve(root,'netlify/edge-functions')],dist,[],{basePath:root,rootPath:root});
const manifest=JSON.parse(await readFile(resolve(dist,'manifest.json'),'utf8'));
console.log('EDGE_BUILD_MANIFEST',JSON.stringify(manifest));
