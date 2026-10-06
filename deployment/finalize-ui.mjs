/** One-off UI polish. Uses the already validated production-context deployment
 * procedure unchanged except for removing the obsolete preview-only paragraph.
 * Does not modify any application function, database, secret, or route.
 */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const sourceId='6ac4e7986db27e50c42c3ad2';
const base=new URL('./',import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'hohoho-ui-final-'));
const patchModule=`import {buildPatch as original} from './publish.mjs';
export {hash,ensure,fileInventory,functionPlan} from './publish.mjs';
export function buildPatch(...args) {
  const patch=original(...args);
  const html=patch.get('/index.html').toString('utf8');
  const paragraph=/<([a-z0-9]+)\\b[^>]*>\\s*Aperçu du nouveau design[\\s\\S]*?<\\/\\1>/gi;
  const matches=[...html.matchAll(paragraph)];
  if(matches.length!==1 || !matches[0][0].includes('Les appels et les paiements restent sur'))throw new Error('Mention de prévisualisation différente : arrêt.');
  const clean=html.replace(paragraph,'');
  if(clean.includes('Aperçu du nouveau design'))throw new Error('Mention de prévisualisation non supprimée.');
  patch.set('/index.html',Buffer.from(clean));
  return patch;
}
`;
async function run(args) {
  const child=spawn(process.execPath,args,{cwd:dir,env:process.env,stdio:['ignore','pipe','pipe']});
  let text='';
  for(const s of [child.stdout,child.stderr])s.on('data',chunk=>{
    process.stdout.write(chunk);
    text=(text+chunk.toString()).slice(-100000);
  });
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  assert.equal(code,0,'La procédure a arrêté la publication. Voir le résultat ci-dessus.');
  return text;
}
try {
  const cfg=JSON.parse(await readFile(new URL('release.json',base),'utf8'));
  cfg.expectedSourceDeploy=sourceId;
  await writeFile(join(dir,'release.json'),JSON.stringify(cfg));
  await writeFile(join(dir,'publish.mjs'),await readFile(new URL('publish.mjs',base)));
  const staged=await readFile(new URL('production-staged.mjs',base),'utf8');
  const from="import {hash,ensure,fileInventory,functionPlan,buildPatch} from './publish.mjs';";
  assert.equal(staged.split(from).length,2,'Import source différent : arrêt.');
  await writeFile(join(dir,'production-staged.mjs'),staged.replace(from,"import {hash,ensure,fileInventory,functionPlan,buildPatch} from './production-patch.mjs';"));
  await writeFile(join(dir,'production-patch.mjs'),patchModule);
  const output=await run(['production-staged.mjs','--prepare']);
  const id=output.match(/STAGED_PRODUCTION_VALIDATED https:\/\/([a-f0-9]{24})--hohohosanta-live\.netlify\.app/)?.[1];
  assert.ok(id,'Déploiement validé introuvable : aucune publication.');
  await run(['production-staged.mjs','--publish',id]);
  console.log('FINAL_BRANDING_PUBLICATION',id);
} finally {
  await rm(dir,{recursive:true,force:true});
}
