# FBF — Notes projet (lire en début de session)

## Économie des builds APK  ⚠️ IMPORTANT
Le workflow `.github/workflows/build-apk.yml` se déclenche à chaque push sur
`main` et `claude/**`. Un build = beaucoup de CI. **Politique choisie : 1 seul
build APK par session, en toute fin.**

Règle à appliquer **systématiquement** :
- Sur **tous les commits intermédiaires** d'une session → ajouter **`[skip ci]`**
  dans le message de commit (GitHub Actions saute alors le build).
- **Uniquement le tout dernier push** de la session → message **sans** `[skip ci]`
  → c'est lui qui génère l'APK final, une fois que tout est prêt et vérifié.
- Filet de sécurité déjà en place : `concurrency: cancel-in-progress` annule
  un build dépassé si un nouveau push arrive.
- Toujours valider le JS localement (`node --check`) avant de pousser, pour ne
  pas « gâcher » le build final.

Si l'utilisateur veut tester un APK en cours de session, faire un push **sans**
`[skip ci]` à ce moment précis (build ciblé volontaire).

## Architecture audio
- Moteur 100 % **Web Audio natif** (Tone.js retiré) dans FBF 432 et Omcha 396 →
  anti-craquement APK/Bluetooth. Contexte audio unique partagé via `window.AC`.
- Réglages DSP sur **grille de 9** (432 → 9) : anti-crack plancher 0.18,
  compresseur −27/9, limiteur −1.8/18, attaques 0.009, releases 0.27/0.18.
- `sample-studio.js` : voie Sample partagée (EQ 3 bandes, VU, micro, record WAV/M4A).
- Modules ouverts en **iframe** (`#screen-frame`) dans Omcha → le JS inline s'exécute.

## Pièges connus
- **Pas de gros JS inline** dans un module HTML : certaines WebView l'affichent
  comme texte. Préférer un fichier externe `*.js` (ex. `theme432.js`) + l'ajouter
  à la copie dans `build-apk.yml`.
- Les deux apps sont **séparées** (pas de fusion d'interface) ; on duplique les
  features via fichiers partagés (`sample-studio.js`) plutôt que fusionner.

## Branche de dev
`claude/fbf-432-apk-crashes-ttxln3` (ne pas pousser ailleurs sans accord).
