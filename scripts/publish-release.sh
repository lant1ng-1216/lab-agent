#!/usr/bin/env bash
# Push main + create GitHub Release with local installer artifacts.
# Usage: ./scripts/publish-release.sh [v0.2.0]
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
TAG="${1:-v${VERSION}}"
VER="${TAG#v}"

if [[ "$VER" != "$VERSION" ]]; then
  echo "release tag $TAG does not match package.json version $VERSION" >&2
  exit 1
fi

echo "[publish] pushing main…"
git push origin main

MAC="release/Lab-Agent-${VER}-mac-arm64.zip"
WIN="release/Lab-Agent-${VER}-win-x64.zip"
LINUX="release/Lab-Agent-${VER}-linux-x64.tar.gz"
for f in "$MAC" "$WIN" "$LINUX"; do
  [[ -f "$f" ]] || { echo "missing $f — run npm run dist first"; exit 1; }
done

echo "[publish] creating ${TAG}…"
NOTES="docs/releases/${VER}.md"
[[ -f "$NOTES" ]] || { echo "missing release notes: $NOTES" >&2; exit 1; }
gh release create "$TAG" "$MAC" "$WIN" "$LINUX" \
  --title "Lab Agent ${VER}" \
  --notes-file "$NOTES"

echo "[publish] done → https://github.com/lant1ng-1216/lab-agent/releases/tag/$TAG"
