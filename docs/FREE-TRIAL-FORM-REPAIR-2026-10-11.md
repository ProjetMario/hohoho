# Correctif du formulaire gratuit — 11 octobre 2026

## Statut exact

**Correctif partiel écrit et testé sur la branche `fix/free-trial-form-permissions`. Non déployé sur le site.**

Le correctif traite la validation au clavier et les blocages de permission du microphone. Le troisième défaut documenté dans `FREE-TRIAL-FORM-2026-10-11.md` — ouverture injustifiée de la fenêtre payante — reste inchangé.

L’écriture d’un correctif global puis celle d’un script de publication ont été bloquées par les contrôles de sécurité de l’outil. Le périmètre accepté a été limité au clavier et au microphone, avec conservation exacte des conditions d’éligibilité. Aucune publication Netlify, modification de secrets, paiement ou véritable appel n’a été effectué. Le sélecteur de version envisagé pour le déploiement a été retiré de la branche, car il n’avait pas été validé.

## Changements effectivement implémentés

- La préparation utilise un véritable formulaire et un gestionnaire `onSubmit`. Entrée et le clic sur le bouton suivent la même validation et ne produisent qu’une tentative de connexion.
- Le prénom est obligatoire. Les conditions originales de validation et d’autorisation serveur du bouton et du gestionnaire sont conservées et vérifiées par des assertions.
- Les boutons secondaires de caméra, d’offre payante et de configuration ont le type `button` pour ne pas soumettre le formulaire.
- Le démarrage demande le microphone, sans déclencher automatiquement une demande concurrente de caméra personnelle. La caméra reste accessible par son bouton et facultative.
- L’attente du microphone affiche une instruction explicite, expire après 20 secondes et permet de réessayer.
- Le bouton Annuler interrompt une tentative en préparation et revient à l’écran de préparation. Toute piste reçue après annulation ou expiration est arrêtée et ne peut pas relancer l’ancienne tentative.

## Preuve des tests

Exécution GitHub Actions : https://github.com/ProjetMario/hohoho/actions/runs/38094343492

Job `114337035662`, terminé avec succès. Révision de code testée : `9c6c82faf41c78265422e6b3b087c8b44239a079`.

Les 11 scénarios réussis : Entrée ordinateur, clic en largeur mobile, Entrée en largeur mobile, prénom invalide, caméra sans soumission, bouton d’offre sans soumission, annulation du microphone avec autorisation tardive, expiration du microphone avec autorisation tardive, refus du microphone suivi d’une nouvelle tentative, refus serveur VPN conservé, essai consommé conservé.

Le premier essai du correctif a été arrêté par la vérification de syntaxe avant toute publication ; la révision ci-dessus corrige cette erreur et passe l’ensemble des tests.

Les pages et scripts publics sont chargés dans Chromium. La révision corrigée et les réponses des API de configuration/éligibilité sont injectées uniquement dans le navigateur de test. Tous les appels autres que GET/HEAD sont interceptés, les domaines tiers bloqués, et les périphériques média sont synthétiques. Le statut `FORM_TEST_STOP` est une réponse volontaire du test, pas une erreur de production.

**Ces tests valident le formulaire, pas un échange réel voix et avatar.** Le scénario mobile correspond à une largeur Chromium de 390 pixels, et non à Safari/iOS natif.

## Fichiers livrés

- `deployment/free-trial-form/patch.mjs` : transformation contrôlée du script client, avec correspondances exactes et validation syntaxique.
- `deployment/free-trial-form/test-browser.mjs` : tests de régression isolés.
- `.github/workflows/test-free-trial-form-repair.yml` : exécution des tests sur la branche, sans secret de déploiement.

Le dépôt ne contient toujours pas les sources complètes de l’application. Le correctif est donc une transformation ciblée du fichier distribué `/_next/static/chunks/1jqq023am1z1e.js`, correspondant au déploiement `6ac80733c08a980228141707`, et non une reconstruction des composants originaux. Il s’arrête si les fragments attendus ne correspondent plus. Une fusion GitHub ne suffit pas à l’appliquer au site.

## Restant à faire avant de considérer l’incident résolu

Intégrer le correctif dans le projet réellement déployé, valider son chargement et la navigation en préproduction, puis vérifier l’appel complet avant une publication contrôlée. Corriger séparément la bascule injustifiée vers le paiement, sans retirer les contrôles serveur ni les limites d’essai.

Aucune commande de déploiement de ce dépôt partiel n’est proposée : il ne doit pas remplacer l’application actuelle.
