#!/usr/bin/env bash
# Push main + create GitHub Release with local installer artifacts.
# Usage: ./scripts/publish-release.sh [v0.1.1]
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-v0.1.1}"
VER="${TAG#v}"

echo "[publish] pushing main…"
git push origin main

MAC="release/Lab-Agent-${VER}-mac-arm64.zip"
WIN="release/Lab-Agent-${VER}-win-x64.zip"
LINUX="release/Lab-Agent-${VER}-linux-x64.tar.gz"
for f in "$MAC" "$WIN" "$LINUX"; do
  [[ -f "$f" ]] || { echo "missing $f — run npm run dist first"; exit 1; }
done

echo "[publish] creating $TAG…"
gh release create "$TAG" "$MAC" "$WIN" "$LINUX" \
  --title "Lab Agent ${VER}" \
  --notes "## Lab Agent ${VER}

Fixes Gatekeeper **“damaged and can’t be opened”** on macOS (v0.1.0 had a broken/incomplete code signature).

| Platform | File |
| -------- | ---- |
| macOS Apple Silicon | \`Lab-Agent-${VER}-mac-arm64.zip\` |
| Windows x64 | \`Lab-Agent-${VER}-win-x64.zip\` |
| Linux x64 | \`Lab-Agent-${VER}-linux-x64.tar.gz\` |

### macOS
- Ad-hoc **deep-signed** (passes \`codesign --verify --deep --strict\`); not Apple-notarized.
- Unzip → drag \`Lab Agent.app\` to Applications.
- If still blocked: **Right-click → Open**, or \`xattr -cr \"/Applications/Lab Agent.app\"\`.

### Other
- Windows: unzip and run \`Lab Agent.exe\`.
- Linux: extract and run from the unpacked folder.
"

echo "[publish] done → https://github.com/lant1ng-1216/lab-agent/releases/tag/$TAG"
