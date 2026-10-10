# Vérification du formulaire de l’essai gratuit — 11 octobre 2026

## Périmètre et statut

Vérification du code JavaScript actuellement servi par `/essai`, puis exécution de neuf scénarios dans Chromium avec deux largeurs d’affichage (1280 et 390 pixels). La largeur mobile ne constitue pas un test de Safari/iOS natif.

**Des défauts de formulaire ont été reproduits. Aucun correctif applicatif n’a été déployé.** Seuls le test automatisé, son workflow et ce compte rendu sont ajoutés au dépôt. Aucun appel réel, paiement, accès à un vrai microphone ou changement de production n’a été effectué.

Exécution vérifiée : https://github.com/ProjetMario/hohoho/actions/runs/38093652062
Job : `114334988076`, terminé avec succès. Ce succès indique que l’audit s’est exécuté, pas que les anomalies sont corrigées.

Test : `deployment/audit-free-trial-form.mjs`
Workflow : `.github/workflows/audit-free-trial-form.yml`

## Méthode

Le premier scénario lit réellement la page et les API publiques. Les huit autres chargent les mêmes pages et scripts publics mais remplacent les réponses de configuration et d’éligibilité dans le navigateur de test uniquement. Ils permettent notamment de tester un essai disponible indépendamment de la classification VPN du runner GitHub.

Toutes les requêtes autres que GET et HEAD sont interceptées avant envoi. Les domaines tiers sont bloqués. Le microphone et la caméra sont des périphériques synthétiques de Chromium. L’erreur `FORM_AUDIT_STOP` est une réponse artificielle du test, pas une erreur observée du serveur en production.

## Ce qui fonctionne dans les scénarios d’essai disponible

- Sur 1280 et 390 pixels, le bouton est désactivé pour un prénom vide, un espace ou `123`.
- `Camille`, `Éléonore`, `Jean-Luc` et `O’Connor` activent le bouton.
- Décocher l’enregistrement du souvenir ne désactive pas le bouton.
- Avec un prénom valide, le clic déclenche bien la demande de média puis tente `POST /api/cloud-trial/connect`. Cette requête est interceptée par le test avant d’atteindre le serveur.
- Cela fonctionne dans ces tests alors que la disponibilité du paiement est simulée à `false`. La condition d’activation du bouton gratuit n’est donc pas la disponibilité de Stripe ou de l’offre payante.
- Aucun plantage JavaScript n’a été relevé dans les neuf scénarios.

## Défaut 1 — La validation au clavier ne démarre rien

Dans les scénarios ordinateur et largeur mobile, le champ prénom et le bouton ne sont associés à aucun élément `<form>` (`formTag: null`). Le bouton a pourtant le type DOM `submit`.

Après saisie d’un prénom valide et pression sur Entrée : aucun événement `submit`, aucune demande de microphone/caméra, aucune requête de lancement, phase toujours `welcome`. Le clic sur le bouton fonctionne, contrairement à Entrée.

Correction à intégrer : un véritable `<form onSubmit>` pour la préparation gratuite ; un bouton de lancement `type="submit"` ; des boutons secondaires `type="button"` pour ne pas lancer accidentellement l’appel. La validation du prénom et la vérification serveur doivent rester appliquées.

## Défaut 2 — Attente du microphone sans sortie ni message adapté

Le lancement demande d’abord la caméra, puis le microphone séparément. Quand l’autorisation du microphone est simulée comme restant sans réponse, le formulaire reste en phase `connecting` après une avance de 60 secondes de l’horloge du navigateur. Le seul message de statut est « Le Père Noël prépare sa caméra… ». Aucune requête `/connect` n’a encore été envoyée.

La lecture du code confirme que la temporisation de connexion est installée après l’attente de `getUserMedia` : elle ne couvre donc pas cette attente de permission.

Correction à intégrer : traiter d’abord le microphone nécessaire à la conversation, afficher une instruction explicite d’autorisation, prévoir annulation et délai d’attente avec nouvelle tentative, arrêter les pistes qui arriveraient après une annulation. Garder la caméra personnelle facultative et éviter deux demandes de permission concurrentes.

## Défaut 3 — Le parcours payant masque le parcours gratuit à tort

Trois scénarios où l’essai est refusé pour `vpn`, `reserved` ou `unavailable` ouvrent automatiquement la fenêtre `.trial-upgrade-dialog.step-details`. Elle contient les champs obligatoires d’âge, d’e-mail et de consentements du paiement. Ces motifs sont traités comme si l’essai avait été consommé, alors que seul `used` indique une consommation.

Le scénario réel en lecture seule a aussi reproduit cette ouverture automatique pour `reason: vpn` depuis le réseau du runner. Cela ne démontre pas que le réseau de l’utilisateur est classé VPN.

Un autre scénario confirme qu’une ancienne valeur locale `santa:free-trial-used=true` ouvre cette même fenêtre payante **même lorsque la réponse d’éligibilité simulée autorise l’essai**. Le code du bouton « J’ai déjà essayé · Voir l’appel de 5 minutes » écrit ce marqueur avant tout appel : il ne constitue donc pas une preuve fiable de consommation.

Correction à intégrer : distinguer intention explicite d’achat, essai réellement consommé, réservation en cours et indisponibilité technique. Ne pas utiliser un ancien marqueur local pour contredire l’autorisation du serveur. Pour `vpn`, `reserved` et `unavailable`, afficher le motif et une nouvelle vérification plutôt qu’ouvrir automatiquement le paiement. Ne pas contourner les refus du serveur.

## Code inspecté

- `/_next/static/chunks/2ot_gz3drradr.js` : composant `CloudVoiceTrial`, marqueur local, préparation et bascule vers le payant.
- `/_next/static/chunks/1jqq023am1z1e.js` : composant `TrialVideoCall`, condition du bouton, gestionnaire de lancement, permissions et fenêtre `TrialUpgrade`.

La condition actuelle du bouton correspond à : avatar prêt ET voix prête ET prénom valide ET (appel payé déjà autorisé OU essai gratuit autorisé par le serveur). L’option d’enregistrement et l’activation préalable de la caméra ne sont pas des conditions de ce bouton.

## Limite de la conclusion

Ces défauts sont reproduits dans le parcours du formulaire et peuvent expliquer un blocage avant démarrage. Aucun échange complet voix + avatar n’a été testé ; la réponse réelle à `/api/cloud-trial/connect` n’a pas été sollicitée. Sans observation de l’écran et du navigateur de l’utilisateur, on ne peut pas attribuer avec certitude son incident personnel à un seul de ces défauts.
