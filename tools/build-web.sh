#!/usr/bin/env bash
# Copies the app into dist/ for the App Store and Google Play wrappers (Capacitor). See docs/APP_STORES.md.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp -R index.html 404.html manifest.webmanifest sw.js icon.svg icon-192.png icon-512.png apple-touch-icon.png privacy.html terms.html legal.css src vendor dist/
echo "Built dist/ ($(du -sh dist | cut -f1))"
