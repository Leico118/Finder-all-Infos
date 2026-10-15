#!/usr/bin/env sh
# Compile l'interface et le moteur dans android/app/src/main/assets (esbuild + Tailwind CLI).
# Usage : ESBUILD=… TAILWIND=… sh scripts/build-web.sh
set -e
cd "$(dirname "$0")/.."
OUT=android/app/src/main/assets
ESBUILD=${ESBUILD:-npx esbuild}; TAILWIND=${TAILWIND:-npx @tailwindcss/cli}
rm -rf "$OUT" && mkdir -p "$OUT/assets"
cp -r web/public/icons "$OUT/icons"
$ESBUILD web/src/main.jsx web/src/background.js --bundle --minify --jsx=automatic --loader:.css=empty --outdir="$OUT/assets" \
  --entry-names=[name]-[hash] --define:process.env.NODE_ENV='"production"' --target=chrome100 --format=iife --log-level=warning $ESBUILD_ARGS
$TAILWIND -i web/src/index.css -o "$OUT/assets/app.css" --minify 2>/dev/null
H=$(sha1sum "$OUT/assets/app.css" | cut -c1-8); mv "$OUT/assets/app.css" "$OUT/assets/index-$H.css"
JS=$(cd "$OUT/assets" && ls main-*.js); BG=$(cd "$OUT/assets" && ls background-*.js)
sed -e "s#<script type=\"module\" src=\"/src/main.jsx\"></script>#<link rel=\"stylesheet\" href=\"/assets/index-$H.css\"><script defer src=\"/assets/$JS\"></script>#" \
    -e 's#<link rel="manifest" href="/manifest.webmanifest" />##' web/index.html > "$OUT/index.html"
sed -e "s#<script type=\"module\" src=\"/src/background.js\"></script>#<script src=\"/assets/$BG\"></script>#" web/background.html > "$OUT/background.html"
echo "assets prêts : $(du -sh "$OUT" | cut -f1)"
