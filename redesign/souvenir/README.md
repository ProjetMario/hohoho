# PDF souvenir — HoHoHo Santa

Nouveau modèle assorti au design du site : rouge #BD0C0F, rouge profond #850909,
or #D79753, ivoire #FEF8EE, et logo partagé `../assets/logo.svg`.

## Statut exact

Ce dossier ajoute un **modèle autonome** et son générateur local. Le code du
moteur PDF de l'application en production n'était pas présent dans le dépôt.
Il ne s'agit donc pas d'une modification de l'export en ligne : aucun branchement
au parcours d'appel, aucun changement de paiement et aucun déploiement Netlify.
Aucun ancien PDF n'a été fourni pour vérifier la conservation de ses champs.

`exemple.json` et `exemple.html` contiennent uniquement des données fictives,
signalées sur le document. Ne jamais committer de données réelles d'enfants
ou de familles dans ce dépôt.

## Aperçu

Ouvrir `exemple.html` dans un navigateur, puis Imprimer / Enregistrer en PDF.
Choisir A4, activer les arrière-plans et désactiver les en-têtes du navigateur.
Le modèle conserve des marges de 10 mm. L'exemple tient sur une page ; les textes
plus longs se poursuivent sur d'autres pages sans troncature volontaire.

## Générer un vrai PDF

Depuis ce dossier :

```sh
npm install --save-dev playwright
npx playwright install chromium
node generate.mjs exemple.json souvenir-exemple.pdf
node --test test-template.mjs
```

`CHROMIUM_EXECUTABLE` permet d'utiliser un Chromium déjà installé. Les requêtes
réseau sont bloquées pendant le rendu. Le logo est intégré au HTML et les polices
sont locales. Aucun service externe, stockage ou journal de données personnelles
n'est ajouté. Les données et le PDF restent cependant présents dans les fichiers
choisis par l'appelant : leur stockage et leur suppression doivent être gérés
par l'application.

## Raccordement ultérieur

```js
import { renderSouvenir } from './template.mjs';
const html = renderSouvenir({
  prenom: donneesDuParent.prenom,
  dateAppel: donneesDuParent.dateAppel, // AAAA-MM-JJ, facultatif
  sujets: donneesDuParent.sujets,     // facultatif, textes validés
  souvenir: donneesDuParent.souvenir,
  noteParent: donneesDuParent.noteParent,
  exemple: false
});
```

Les chemins du logo et du CSS sont configurables via le deuxième argument.
Les chemins doivent être locaux ; une image intégrée en base64 est aussi acceptée.
Les champs sont échappés avant insertion HTML. Les dates et types sont validés.
Les longueurs excessives provoquent une erreur explicite plutôt qu'une coupe.
Ne pas fabriquer de souvenirs ni présenter une phrase générée comme une citation
réelle de l'appel. Un champ absent reste vierge ou à compléter en famille.

Avant la mise en production, raccorder ce modèle au véritable export PDF,
à son authentification et à ses règles de consentement. Préserver les champs
existants après comparaison avec le PDF d'origine et tester un appel de bout
en bout dans un environnement de test. Le nouveau design seul n'effectue rien
de cela.

## Vérifications effectuées

Sept tests de validation et d'échappement passent. Rendu Chromium vérifié :
exemple et champs vierges sur une page, textes longs sur trois pages, mot très
long sur deux pages, textes contenus dans les marges. Vérification d'affichage
à 390 et 1440 px sans débordement horizontal. Voir `checks.json`.
Le script Node de génération a été exécuté avec le moteur Playwright fourni
avec l'installation locale et Chromium. Aucune dépendance ni police n'est livrée.

Référence technique : https://playwright.dev/docs/api/class-page#page-pdf
