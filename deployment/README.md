# Publication prudente de HoHoHo Santa

## État et périmètre

Cette procédure est une **alternative préparée, pas une publication effectuée**.
Les tests unitaires et l’intégrité des fichiers publics de la prévisualisation peuvent être contrôlés sans authentification. La réutilisation effective des binaires, les routes, la base de données et la publication **doivent encore être vérifiées avec une connexion Netlify opérationnelle**.

L’objectif est de ne plus remplacer toute l’application par la seule vitrine. Le script prépare un nouveau déploiement à partir de l’inventaire du déploiement de production existant : il déclare les mêmes fichiers et les mêmes fonctions par leurs empreintes, conserve les tâches planifiées et ajoute uniquement la nouvelle page d’accueil, le logo approuvé et les icônes. Il ne reconstruit pas le code source de l’application.

Site ciblé : `hohohosanta.app` / `bd9b6590-f31a-42c7-b58d-12779e45cb0e`.
Source attendue : `6ac36ead5077d61df784c7cd`.
Prévisualisation figée : `6ac3cfb4a873557f7f13d031`.

**Ne pas publier directement le déploiement `branding-preview` sur le domaine principal : il ne contient pas les fonctions de l’application.**

## Exécution sur un ordinateur disposant de Node.js 22.13 ou ultérieur

Depuis le dossier du dépôt GitHub :

```sh
cd deployment
npm install
npm test
npm run login
npm run prepare
```

`npm run login` utilise la connexion officielle Netlify CLI **sur l’ordinateur qui exécute le script**. Ne pas réutiliser un ancien lien d’autorisation de cette conversation. Ne pas copier de mot de passe ou de jeton dans le chat, un fichier du dépôt ou un journal public.

`prepare` crée uniquement un brouillon. Le site en production reste inchangé. Le script affiche un lien après réussite de ses contrôles. Vérifier le rendu sur ordinateur et téléphone, ainsi que le parcours d’essai. Les contrôles automatiques ne déclenchent ni conversation, ni paiement et ne remplacent pas un test complet du parcours utilisateur.

Après cette vérification :

```sh
npm run publish
```

La commande reprend le brouillon validé, recommence les contrôles et le publie. Elle tente un retour à l’ancien déploiement si un contrôle après publication échoue. Une panne réseau peut aussi empêcher ce retour ; dans ce cas il faut vérifier le tableau de bord Netlify. La restauration automatique n’est donc pas une garantie contre toute indisponibilité.

Le mécanisme s’arrête si la production a changé depuis le relevé. Il ne faut pas supprimer cette protection sans réévaluer la nouvelle version.

### Retour arrière explicite

```sh
npm run rollback
```

Cette commande n’est permise que si le déploiement préparé par ce script est toujours actif. Elle rétablit l’ancien déploiement, pas la base de données. L’état local est stocké dans `.state/`, exclu de Git ; conserver ce dossier jusqu’à la fin de la mise en ligne.

## Garanties de périmètre et contrôles prévus

- Tous les fichiers existants sont repris par leur empreinte SHA-1, notamment `_next`, les redirections et les en-têtes. Les fichiers de marque sont isolés dans `/branding-20261006/`.
- Les cinq fonctions sont déclarées avec leurs empreintes de code, routes, mémoire, région et priorité. Les métadonnées retournées doivent correspondre à la source, y compris les modes d’invocation et les tâches planifiées.
- Si Netlify exige le téléversement d’un ancien fichier ou d’un binaire serveur qui n’est plus réutilisable, **arrêt sans publication**. Une récupération du projet d’origine reste alors nécessaire.
- La liaison à la branche de base de données, la région du stockage et les régions particulières des fonctions sont comparées. Une différence bloque la publication.
- L’accueil doit servir la nouvelle version, sans `noindex` en en-tête. Le logo et les icônes sont vérifiés par empreinte.
- Huit pages de l’application et leurs scripts Next.js sont contrôlés par requêtes GET. Une redirection vers un autre domaine, un titre incohérent ou le remplacement d’une page par l’accueil bloque la publication.
- Aucun paramètre DNS, secret, abonnement, code de fonction ou contenu de base de données n’est modifié par le script. Il n’exporte aucune variable d’environnement.

**Limites importantes :** ce mécanisme ne modifie pas les en-têtes internes des pages de l’application et ne raccorde pas le nouveau modèle PDF à l’export automatique. Il n’offre pas de nouveau test transactionnel du paiement. Le comportement réel de l’application doit être validé sur le brouillon ; en particulier, la réutilisation du stockage et des services externes ne peut pas être déduite des seuls tests unitaires.

## Diagnostic sans écriture

```sh
npm run assets   # fichiers publics approuvés uniquement ; sans connexion
npm run plan     # inventaire authentifié ; aucune écriture Netlify
```

Une variable `NETLIFY_AUTH_TOKEN` déjà définie dans un environnement sécurisé est également prise en charge. Sinon, le script lit uniquement la session active du magasin de connexion officiel Netlify CLI via `@netlify/dev-utils`. Aucun jeton n’est inclus dans ce dossier.

## Références techniques

- API Netlify, déploiements par empreintes : https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
- Schémas `deployFiles`, `functions_config`, `function_schedules`, restauration : https://open-api.netlify.com/
- Connexion et commandes officielles : https://cli.netlify.com/commands/login/

Versions des dépendances relevées le 6 octobre 2026 : `netlify-cli` 27.11.2 et `@netlify/dev-utils` 6.0.3. Versions directes fixées ; `npm install` crée un verrou de dépendances dans l’environnement d’exécution.
