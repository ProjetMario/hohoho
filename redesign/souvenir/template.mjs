/**
 * HoHoHo Santa — modèle de PDF souvenir, sans service externe.
 * Les données proviennent de l'application ou du parent : aucun échange n'est inventé.
 * @typedef {{prenom:string, dateAppel?:string, sujets?:string[], souvenir?:string,
 *   noteParent?:string, exemple?:boolean}} SouvenirData
 */
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[c]);

function text(value, field, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new TypeError(`${field} doit être un texte.`);
  const clean = value.normalize('NFC').trim();
  if (required && !clean) throw new TypeError(`${field} est obligatoire.`);
  if (clean.length > max) throw new RangeError(`${field} dépasse ${max} caractères.`);
  return clean;
}

function formatDate(value) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('dateAppel : format AAAA-MM-JJ requis.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new RangeError('dateAppel : date invalide.');
  return new Intl.DateTimeFormat('fr-FR', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(date);
}

// Les chemins sont des ressources de confiance du projet, jamais des données du parent.
function asset(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f]/.test(value))
    throw new TypeError('Chemin de ressource invalide.');
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) &&
      !/^data:image\/(?:svg\+xml|png|webp);base64,[a-z0-9+/=]+$/i.test(value))
    throw new TypeError('Utiliser une ressource locale ou une image intégrée.');
  return escapeHtml(value);
}

/**
 * Produit un document HTML imprimable A4. Aucun JavaScript ni appel réseau ajouté.
 * @param {SouvenirData} data
 * @param {{logoUrl?:string, styleUrl?:string}} options
 * @returns {string}
 */
export function renderSouvenir(data, {logoUrl = '../assets/logo.svg', styleUrl = './souvenir.css'} = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Données requises.');
  const prenom = text(data.prenom, 'prenom', 80, true);
  const date = formatDate(text(data.dateAppel, 'dateAppel', 10));
  if (data.sujets != null && !Array.isArray(data.sujets)) throw new TypeError('sujets doit être une liste.');
  if ((data.sujets || []).length > 12) throw new RangeError('12 sujets maximum.');
  if (data.exemple != null && typeof data.exemple !== 'boolean') throw new TypeError('exemple doit être un booléen.');
  const sujets = (data.sujets || []).map(s => text(s, 'sujet', 240, true));
  const souvenir = text(data.souvenir, 'souvenir', 4000);
  const note = text(data.noteParent, 'noteParent', 4000);
  const e = escapeHtml;
  const paragraphs = value => value.split(/\n+/).map(p => `<p>${e(p)}</p>`).join('');
  const stars = '<span aria-hidden="true" class="stars"><i></i><i></i><i></i></span>';
  const longName = Array.from(prenom).length > 24;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light">
<title>HoHoHo Santa — Mon souvenir de Noël</title>
<link rel="stylesheet" href="${asset(styleUrl)}">
</head>
<body>
<main class="sheet">
  <div class="ribbon">UN PRÉNOM. UNE VOIX. UN SOUVENIR.</div>
  <div class="inside">
    <header class="masthead">
      <div class="masthead-copy"><p class="eyebrow">MON SOUVENIR DE NOËL</p>
      <h1>Un appel.<br><em>Mille étoiles.</em></h1>
      <p class="intro">Un petit moment de magie,<br>à garder tout près du cœur.</p></div>
      <img class="brand-logo" src="${asset(logoUrl)}" width="360" height="302" alt="HoHoHo Santa">
    </header>
    <section class="personal" aria-label="Le souvenir de ${e(prenom)}">
      ${stars}<p class="eyebrow">CE SOUVENIR APPARTIENT À</p>
      <h2 class="name${longName ? ' name-long' : ''}">${e(prenom)}</h2>
      <p class="date">${date ? e(date) + '<span class="dot">·</span>' : ''}Une rencontre avec le Père Noël</p>
    </section>
    <section class="memory-card" aria-labelledby="memory-title">
      <div class="card-heading"><span aria-hidden="true" class="small-star">✦</span><h2 id="memory-title">Les petits trésors de notre échange</h2></div>
      <p class="label">CE DONT NOUS AVONS PARLÉ</p>
      ${sujets.length ? `<ul class="topics">${sujets.map(s => `<li>${e(s)}</li>`).join('')}</ul>` : '<p class="empty">À compléter ensemble après la rencontre.</p>'}
      <div class="moment"><p class="label">MON MOMENT PRÉFÉRÉ</p>
      ${souvenir ? `<div class="memory-text">${paragraphs(souvenir)}</div>` : '<div class="writing-lines" aria-label="Espace pour écrire le moment préféré"></div>'}</div>
    </section>
    <section class="family" aria-labelledby="family-title"><h2 id="family-title" class="label">UN MOT DE MA FAMILLE</h2>
      ${note ? `<div class="family-text">${paragraphs(note)}</div>` : '<div class="writing-lines" aria-label="Espace pour écrire un mot en famille"></div>'}
    </section>
    <div class="closing">${stars}<p>Les petits moments font<br><em>les grands souvenirs.</em></p></div>
    <footer><div class="footer-line"><span>HOHOHO SANTA</span><span>LA MAGIE A UNE VOIX.</span></div>
      <p class="site-name">hohohosanta.app</p>
      ${data.exemple === true ? '<p class="sample">APERÇU DU MODÈLE · PRÉNOM ET SOUVENIRS FICTIFS</p>' : ''}
    </footer>
  </div>
</main>
</body>
</html>`;
}
