#!/usr/bin/env bash
# Publish the generated Hexo site to the production webroot.
#
# The previous build is kept next to it (WEBROOT.prev), so a rollback is a
# pair of `mv`s. nginx serves the directory directly; no reload is needed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="${WEBROOT:-/var/www/rikka.moe}"
STAGING="${WEBROOT}.next"

cd "$ROOT"

echo "==> building"
npx hexo clean
npx hexo generate

echo "==> staging into $STAGING"
rsync -a --delete "$ROOT/public/" "$STAGING/"
chmod -R a+rX "$STAGING"

echo "==> swapping webroot"
rm -rf "${WEBROOT}.prev"
mv "$WEBROOT" "${WEBROOT}.prev"
mv "$STAGING" "$WEBROOT"

echo "==> deployed $(date -Is) to $WEBROOT (previous build: ${WEBROOT}.prev)"
