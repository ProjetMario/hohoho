# Diagnostic du demarrage video — 11 octobre 2026

## Statut

**Incident non resolu en production.** Seuls un workflow de diagnostic en lecture seule et ce compte rendu ont ete ajoutes. Aucun correctif du lecteur, du serveur ou des quotas n'a ete deploye. Aucun appel ni paiement n'a ete cree par le diagnostic.

## Verifications effectuees

- La page `/essai` repond et affiche l'interface. Dans le navigateur de test, apres preparation de l'appel et saisie d'un prenom fictif, le bouton de demarrage devient actif.
- `GET /api/cloud-trial/config` : HTTP 200, `ready: true`, `preview: false`, `durationSeconds: 30`. Cette reponse n'est pas une preuve qu'un appel complet peut aboutir.
- `GET /api/cloud-trial/eligibility` : `freeAvailable: true`, `reason: available` depuis le navigateur de test ; `freeAvailable: false`, `reason: vpn` depuis les runners GitHub Actions. La classification du reseau de l'utilisateur n'a pas ete mesuree.
- `GET /api/cloud-trial/purchase/config` : HTTP 200, `paidVideoAvailable: false`, `unavailableReason: capacity_exhausted`, `priceCents: 499`, `durationSeconds: 300`. Le blocage de l'offre payante est confirme. Il ne demontre pas a lui seul la cause d'un echec de l'essai gratuit.
- Dans l'echantillon de logs du controle automatique `santa-service-health`, les cinq etats extraits indiquent `available: true` et `capacityLow: true`. Les logs bruts, les donnees clients et les valeurs secretes n'ont pas ete publies.
- Les variables Anam et OpenAI sont presentes dans le contexte production et le scope Functions. Leurs valeurs sont masquees par l'API Netlify : leur validite n'a pas ete verifiee. Le HTTP 401 du deuxieme diagnostic correspondait a un test non probant avec une valeur masquee ; le troisieme diagnostic detecte ce cas et n'envoie plus cette valeur au fournisseur. Ne pas conclure qu'une cle de production est invalide.
- Le demarrage complet voix + avatar n'a pas ete valide. Le test interactif de lancement n'a pas pu etre execute par l'outil de navigation.

## Code et deploiement

Le deploiement publie au moment du diagnostic est `6ac80733c08a980228141707`, publie le 8 octobre 2026, source `cli`, sans depot relie ni archive de sources disponible dans ses metadonnees. Le diagnostic a confirme que ce deploiement etait reste inchange.

Le depot `ProjetMario/hohoho` ne contient pas le projet applicatif complet, ce que son README documente egalement. Sa seule branche est `main`. Les scripts de deploiement historiques ne doivent pas etre relances sans adaptation : ils visent une ancienne version et ne representent plus toutes les fonctions publiees.

Le code JavaScript distribue au navigateur fait apparaitre le parcours suivant : microphone / WebRTC, `/api/cloud-trial/connect`, `/api/cloud-trial/anam/session`, puis `/api/cloud-trial/start`. Ce parcours n'est pas la lecture d'un simple fichier MP4.

## Prochaine correction a realiser avec les sources completes

1. Importer le projet correspondant au deploiement actuel : `package.json`, lockfile, pages/composants et fonctions serveur. Ne pas importer de `.env`, de cles, de donnees clients ou de sauvegarde de production.
2. Reproduire le refus exact au lancement sur un reseau autorise et relever uniquement l'etape, le statut HTTP et le code d'erreur non sensible.
3. Verifier separement la capacite des appels payants, l'eligibilite des essais gratuits et la disponibilite reelle du fournisseur. Ne pas forcer `paidVideoAvailable: true`, relever les plafonds ou desactiver la protection VPN pour masquer le probleme.
4. Distinguer dans l'interface les raisons `used`, `vpn` et indisponibilite technique ; ne pas les transformer toutes en demande de paiement.
5. Valider un appel de bout en bout dans un environnement de test avant une publication controlee, en preservant la facturation et les donnees existantes.

## Diagnostic reproductible

Workflow : `.github/workflows/diagnose-video-start.yml`

Derniere execution verifiee : https://github.com/ProjetMario/hohoho/actions/runs/38092182265

Le workflow ne fait que des requetes GET et affiche des metadonnees et compteurs filtres. Un resultat GitHub Actions vert signifie que le diagnostic s'est execute, pas que la video fonctionne.
