# Radar — veille d'actualités sur vos sujets

Application Android (APK) : vous tapez ce qui vous intéresse (« Find X10 Ultra », « Galaxy S27 », « voitures BYD »…),
le téléphone cherche chaque jour à 8 h dans Google Actualités, Bing, GDELT, Reddit, des sites spécialisés et la recherche web Tavily,
puis Gemini traduit, classe (Officiel / Leak fiable / Rumeur / Non vérifié), regroupe les doublons et tient une fiche technique pour les produits.

## Compilation

Automatique : chaque dépôt de `Radar-sources.zip` (ou modification) déclenche GitHub Actions, qui publie `Radar.apk`
dans **Releases**. En cas d'échec, un ticket « Échec de compilation » est ouvert avec le journal.

## Structure

- `app/` — projet Android (Java) : vue web plein écran, base SQLite, réseau, notifications, tâche de fond horaire.
- `app/src/main/assets/` — interface et moteur compilés (générés depuis `source/`).
- `source/engine/` — moteur (collecte, analyse IA, déduplication, fiche technique), testé par `source/test/`.
- `source/web/` — interface React + Tailwind.
- `keystore/` — clé de signature fixe, pour que les mises à jour s'installent par-dessus.

Régénérer les assets : `sh source/scripts/build-web.sh` (esbuild + Tailwind CLI), depuis la racine contenant `engine/` et `web/`.
