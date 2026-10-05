import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSouvenir} from './template.mjs';

test('identité et date en français', () => {
  const html = renderSouvenir({prenom:'Éloïse', dateAppel:'2026-12-24'});
  assert.match(html, /Éloïse/);
  assert.match(html, /24 décembre 2026/);
  assert.match(html, /\.\.\/assets\/logo\.svg/);
});
test('aucune injection HTML par les données', () => {
  const html = renderSouvenir({prenom:'<script>', sujets:['<img src=x onerror=alert(1)>'],
    souvenir:'<script>alert(1)</script>', noteParent:'<iframe src=x>'});
  assert.doesNotMatch(html, /<script|<iframe|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});
test('données facultatives laissées vierges', () => {
  const html = renderSouvenir({prenom:'Camille'});
  assert.match(html, /À compléter ensemble/);
  assert.doesNotMatch(html, /décembre|2026|PRÉNOM ET SOUVENIRS FICTIFS/);
});
test('démonstration explicitement marquée', () => {
  assert.match(renderSouvenir({prenom:'Camille', exemple:true}), /PRÉNOM ET SOUVENIRS FICTIFS/);
  assert.doesNotMatch(renderSouvenir({prenom:'Camille', exemple:false}), /PRÉNOM ET SOUVENIRS FICTIFS/);
});
test('dates et tailles invalides refusées, jamais tronquées', () => {
  for (const dateAppel of ['2026-02-30', '2026-13-01', '24/12/2026'])
    assert.throws(() => renderSouvenir({prenom:'Camille', dateAppel}));
  assert.throws(() => renderSouvenir({prenom:''}));
  assert.throws(() => renderSouvenir({prenom:'a'.repeat(81)}));
  assert.throws(() => renderSouvenir({prenom:'Camille', souvenir:'a'.repeat(4001)}));
  assert.throws(() => renderSouvenir({prenom:'Camille', sujets:Array(13).fill('Sujet')}));
  assert.throws(() => renderSouvenir({prenom:'Camille', exemple:'true'}));
});
test('les notes longues et les prénoms longs sont préservés', () => {
  const noteParent = 'Un souvenir précieux. '.repeat(120) + ' FIN-NOTE';
  const html = renderSouvenir({prenom:'Marie-Charlotte Anne-Élisabeth', noteParent});
  assert.match(html, /name-long/);
  assert.match(html, /FIN-NOTE/);
});
test('pas de ressource distante ou de script dans les chemins', () => {
  for (const logoUrl of ['https://example.com/trace.png', '//example.com/x', 'javascript:alert(1)'])
    assert.throws(() => renderSouvenir({prenom:'Camille'}, {logoUrl}));
});
