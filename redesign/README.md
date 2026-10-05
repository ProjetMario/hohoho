# HoHoHo Santa — nouvelle interface

Page d’accueil codée en HTML/CSS, aux couleurs du logo approuvé : rouge Père Noël, rouge profond, or chaleureux, ivoire et blanc chaud. Le logo est intégré dans l’en-tête, la carte de présentation et le pied de page.

## État réel

Cette interface est disponible dans le dépôt, mais **n’a pas été déployée sur hohohosanta.app**. Ce dossier ne contient pas le code complet de l’application Next.js. Il ne remplace ni les appels, ni le paiement Stripe, ni les fonctions serveur, ni l’espace parent.

**Ne pas déployer ce dossier à la racine du projet Netlify existant comme remplacement de l’application.** Aucun paramètre de production, secret ou automatisme de déploiement n’a été ajouté ou modifié.

## Voir l’interface

Ouvrir `index.html` dans un navigateur récent en conservant `styles.css` et le dossier `assets` à côté. Aucune compilation, police externe, bibliothèque JavaScript ou connexion à un service tiers n’est nécessaire pour afficher le design.

Le menu mobile et les réponses de la FAQ utilisent les éléments natifs `details` et `summary`. Le JavaScript ferme simplement le menu après navigation ou avec la touche Échap. Il ne demande aucune autorisation de microphone, n’enregistre rien et ne déclenche aucun paiement.

Les boutons de service renvoient explicitement aux chemins du site existant : `/essai`, `/demo`, `/mes-souvenirs`, `/parent`, `/support`, etc. Cliquer sur ces liens quitte donc la prévisualisation.

## Fichiers

- `index.html` : structure et contenu de la page, icônes et amélioration progressive du menu.
- `styles.css` : styles limités au conteneur `.santa-design`, variantes mobile/tablette/ordinateur et états de focus.
- `assets/logo.svg` : conteneur SVG autonome embarquant une copie WebP optimisée du logo approuvé. **Le dessin est une image matricielle, pas un logo vectorisé.** Seules les marges transparentes et la taille de l’image ont été optimisées.
- `tests/check_layout.py` : contrôles locaux de mise en page avec Playwright.
- `tests/layout-report.json` : compte rendu des contrôles effectués.

## Contenu conservé

Les chemins, le prix de **4,99 € TTC** et la durée de **5 minutes maximum** ont été vérifiés sur la page publique https://hohohosanta.app le 5 octobre 2026. Le tarif fictif de 14,90 € et la durée de 5–10 minutes figurant dans une ancienne image de maquette n’ont pas été repris. Aucun avis client, compteur de clients, label de certification ou classement commercial n’a été inventé.

Le choix d’enregistrer le souvenir, l’accompagnement parental et l’absence de promesse de cadeau restent explicités. La prévisualisation porte `noindex,nofollow` : ce choix concerne le dossier de design, pas le référencement du site actif.

## Contrôles

Rendu Chromium inspecté à 1 440, 1 024, 768, 620, 390 et 320 pixels : aucune image cassée, aucun débordement horizontal, aucun lien d’ancre manquant, un seul titre H1 et aucune erreur JavaScript. Ouverture/fermeture du menu, navigation mobile, touche Échap et ouverture de la FAQ contrôlées à 390 pixels.

Ces contrôles concernent uniquement la nouvelle interface. Ils ne constituent pas des tests de paiement, d’appels en direct ou un audit complet d’accessibilité.

## Intégration à l’application existante

Lorsque les sources de l’application seront disponibles, importer cette présentation dans la page d’accueil et appliquer la classe `.santa-design` uniquement à son conteneur. Conserver les routes, les fonctions serveur, les variables d’environnement, le consentement à l’enregistrement et l’intégration Stripe existants. Adapter les liens aux composants de navigation du projet, replacer le logo dans ses ressources publiques, et garder les métadonnées et le référencement de production.

Valider ensuite une prévisualisation Netlify de l’application complète, y compris ses parcours d’essai, de paiement, d’appel et de souvenirs, avant toute publication en production.
