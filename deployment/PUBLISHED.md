# Publication effectuée le 6 octobre 2026

La nouvelle page d’accueil, le logo réaliste approuvé et le favicon sont en production sur **https://hohohosanta.app/**.

- Projet Netlify : `bd9b6590-f31a-42c7-b58d-12779e45cb0e` (`hohohosanta-live`).
- Déploiement publié final : `6ac4e90b56f9e65ce5189936`.
- Publication confirmée par Netlify : `2026-10-06T12:27:17.442Z`.
- Contexte : `production` ; état `ready` ; verrou de publication retiré (`locked: false`).
- Exécution GitHub Actions terminée avec succès : https://github.com/ProjetMario/hohoho/actions/runs/37463276318.
- Première publication du nouvel accueil : `6ac4e7986db27e50c42c3ad2`. La dernière version enlève uniquement la mention d’aperçu en bas de page.

## Application conservée, pas reconstruite

Les cinq fonctions originales ont été réutilisées avec les mêmes empreintes de code, identifiants de fonctions, identifiants d’origine, runtime, régions et modes d’invocation : `cloud-trial`, `santa-call-background`, `santa-cleanup`, `santa-retention`, `___netlify-server-handler`.

Les deux tâches planifiées, la branche de base de données `production`, les redirections et les scripts applicatifs existants sont conservés. Aucune nouvelle migration SQL n’a été appliquée. Le nouveau déploiement ne dépend pas d’un proxy vers un ancien déploiement. L’essai de façade proxy n’a jamais été publié.

La difficulté venait du **contexte de déploiement** : un brouillon `deploy-preview` ne retrouvait pas toutes les fonctions de l’environnement de production. La procédure retenue verrouille temporairement la version publiée, prépare la nouvelle version dans le contexte `production`, la vérifie, la publie manuellement, puis retire le verrou.

## Vérifications effectuées

Les onze tests de base ont réussi. La procédure a comparé l’inventaire des fichiers, les cinq fonctions, la configuration des tâches et la branche de base de données. Huit pages de l’application, seize scripts Next.js et treize fichiers de marque ont été contrôlés par requêtes GET avant et après publication. Le domaine principal ne renvoie pas de directive `noindex` pour le nouvel accueil. Netlify ajoute normalement cette directive sur les permaliens de versions non publiées ; ce comportement n’est pas une erreur de référencement du site principal.

Aucun appel, paiement, enregistrement ou achat de test n’a été déclenché. Ces vérifications ne remplacent pas un test transactionnel complet.

## Limites restantes

Le code source complet de l’application Next.js n’a pas été reconstitué ni importé dans ce dépôt. Les binaires déployés existants ont été conservés. Les écrans internes de l’application conservent leur mise en page précédente. Le modèle PDF de `redesign/souvenir/` n’est pas encore raccordé à l’export automatique.

Les scripts de cette publication sont volontairement attachés à des identifiants de source précis. Ne pas les relancer aveuglément, ne pas changer ces identifiants sans vérifier l’inventaire de la version alors publiée. Les anciens README et essais de récupération doivent être lus à la lumière de ce compte rendu.
