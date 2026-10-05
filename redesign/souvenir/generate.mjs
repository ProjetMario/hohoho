#!/usr/bin/env node
/** Génération locale du PDF, sans API externe ni envoi des données. */
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderSouvenir} from './template.mjs';

const here = dirname(fileURLToPath(import.meta.url));
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage : node generate.mjs donnees.json sortie.pdf');
  const data = JSON.parse(await readFile(resolve(input), 'utf8'));
  const css = await readFile(resolve(here, 'souvenir.css'), 'utf8');
  const logo = await readFile(resolve(here, '../assets/logo.svg'));
  let html = renderSouvenir(data, {logoUrl: `data:image/svg+xml;base64,${logo.toString('base64')}`});
  html = html.replace('<link rel="stylesheet" href="./souvenir.css">', `<style>${css}</style>`);
  const {chromium} = await import('playwright').catch(() => {
    throw new Error('Installer Playwright : npm install --save-dev playwright puis npx playwright install chromium');
  });
  const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {});
  try {
    const context = await browser.newContext({serviceWorkers: 'block'});
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, {waitUntil:'load'});
    await page.emulateMedia({media:'print'});
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all([...document.images].map(img => img.decode()));
    });
    await mkdir(dirname(resolve(output)), {recursive:true});
    await page.pdf({path:resolve(output), format:'A4', preferCSSPageSize:true,
      printBackground:true, displayHeaderFooter:false, tagged:true});
    console.log('PDF créé. Aucun déploiement effectué.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
