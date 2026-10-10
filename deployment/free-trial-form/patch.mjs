/** Scoped repair for two verified UI defects in the deployed client bundle.
 * No eligibility, local trial flag, payment, capacity or provider logic changes.
 * Must pass isolated browser tests before use. Source is exact-match guarded.
 */
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
export const VERSION = 'form-permissions-20261011-v1';
export const SOURCE_DEPLOY = '6ac80733c08a980228141707';
export const SOURCE_PATH = '/_next/static/chunks/1jqq023am1z1e.js';
export const PATCHED_PATH = SOURCE_PATH.replace(/\.js$/, '.' + VERSION + '.js');

export function acquireMicrophone(constraints, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(new DOMException('Connexion annulée', 'AbortError'));
    timer = setTimeout(() => {
      const error = new Error('L’autorisation du microphone est toujours en attente. Autorisez-le dans votre navigateur, puis réessayez.');
      error.name = 'TimeoutError';
      fail(error);
    }, 20000);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) return onAbort();
    Promise.resolve().then(() => {
      if (signal.aborted) throw new DOMException('Connexion annulée', 'AbortError');
      return navigator.mediaDevices.getUserMedia(constraints);
    }).then(stream => {
      if (settled || signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      settled = true;
      cleanup();
      resolve(stream);
    }, fail);
  });
}

export function patchClient(source) {
  let code = source;
  const replace = (before, after, label) => {
    assert.equal(code.split(before).length - 1, 1, 'Unexpected source: ' + label);
    code = code.replace(before, after);
  };
  replace('function ei({cloud:j=', acquireMicrophone.toString() + '\nfunction ei({cloud:j=', 'microphone helper');
  replace('y||"video"!==t||"on"===tL.status||tj();let s=!1;try{let a,o,l;', '/* Personal camera remains optional, using its own button. */let s=!1;let m=new AbortController;tU.current=m;try{let a,o,l;', 'request microphone separately');
  replace('tP.current?.stream??await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0},video:!1})', 'tP.current?.stream??await acquireMicrophone({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0},video:!1},m.signal)', 'bounded permission wait');
  replace('eu("video"===t?"Le Père Noël prépare sa caméra…":"Connexion à la voix du Père Noël…"),ep(!1)', 'eu("Autorisez le microphone dans votre navigateur pour démarrer l’appel."),ep(!1)', 'permission instruction');
  replace('tM.current=c,c.getAudioTracks()', 'eu("video"===t?"Le Père Noël prépare sa caméra…":"Connexion à la voix du Père Noël…"),tM.current=c,c.getAudioTracks()', 'connection status after permission');
  replace('let m=new AbortController;tU.current=m;let f=setTimeout(()=>m.abort(),25e3)', 'let f=setTimeout(()=>m.abort(),25e3)', 'reuse cancellation controller');
  replace('"welcome"===K&&(0,t.jsxs)(r.Lsection,{className:"trial-call-actions",children:', '"welcome"===K&&(0,t.jsxs)(r.Lform,{className:"trial-call-actions","data-form-fix":"' + VERSION + '",onSubmit:e=>{e.preventDefault();void tZ("video")},children:', 'native submit handler');
  replace('id:"trial-child-name",className:"trial-child-name-input",type:"text",autoComplete:', 'id:"trial-child-name",className:"trial-child-name-input",type:"text",required:!0,autoComplete:', 'required first name');
  replace('className:"button trial-upgrade-cta-button",onClick:', 'className:"button trial-upgrade-cta-button",type:"button",onClick:', 'secondary button');
  replace('className:"button call-button",disabled:!T||!I||!eD||!eb&&!eN?.freeAvailable,onClick:()=>void tZ("video")', 'className:"button call-button",type:"submit",disabled:!T||!I||!eD||!eb&&!eN?.freeAvailable', 'submit preserves all original eligibility conditions');
  replace('className:"trial-secondary-button",onClick:re,children:', 'className:"trial-secondary-button",type:"button",onClick:re,children:', 'camera button');
  replace('className:"trial-secondary-button",onClick:z,children:"Configurer la connexion"', 'className:"trial-secondary-button",type:"button",onClick:z,children:"Configurer la connexion"', 'configuration button');
  replace('className:"end-call",onClick:tK,"aria-label":"Terminer l’appel",children:(0,t.jsx)(l.PhoneOff,{size:23})', 'className:"end-call",type:"button",onClick:()=>{if("connecting"===tT.current){tJ();void tG();tX("welcome")}else tK()},"aria-label":"connecting"===K?"Annuler la connexion":"Terminer l’appel",children:"connecting"===K?"Annuler":(0,t.jsx)(l.PhoneOff,{size:23})', 'cancel before connection');
  // These safeguards must stay byte-for-byte unchanged.
  for (const guard of [
    'if(t$.current||!I||"video"===t&&!T||!eb&&!eN?.freeAvailable||eb&&"video"!==t)return;',
    't9=!eb&&!y&&(b||ek||eN?.freeAvailable===!1||eK<=0)',
    'disabled:!T||!I||!eD||!eb&&!eN?.freeAvailable'
  ]) assert.ok(code.includes(guard), 'Original eligibility condition changed');
  code = '/* ' + VERSION + ' */\n' + code;
  new Script(code);
  return code;
}
