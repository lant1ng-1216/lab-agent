#!/usr/bin/env bash
# Push main + create GitHub Release v0.1.0 with local installer artifacts.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-v0.1.0}"
TAG="$VERSION"

echo "[publish] pushing main…"
git push origin main

MAC="release/Lab-Agent-0.1.0-mac-arm64.dmg"
WIN="release/Lab-Agent-0.1.0-win-x64.zip"
LINUX="release/Lab-Agent-0.1.0-linux-x64.tar.gz"
for f in "$MAC" "$WIN" "$LINUX"; do
  [[ -f "$f" ]] || { echo "missing $f — run npm run dist first"; exit 1; }
done

echo "[publish] creating $TAG…"
gh release create "$TAG" "$MAC" "$WIN" "$LINUX" \
  --title "Lab Agent ${TAG#v}" \
  --notes "## Lab Agent ${TAG#v}

First public desktop builds (Lab Code engine + Electron shell).

| Platform | File |
| -------- | ---- |
| macOS Apple Silicon | \`Lab-Agent-0.1.0-mac-arm64.dmg\` |
| Windows x64 | \`Lab-Agent-0.1.0-win-x64.zip\` |
| Linux x64 | \`Lab-Agent-0.1.0-linux-x64.tar.gz\` |

- macOS unsigned: Right-click → Open the first time.
- Windows: unzip and run \`Lab Agent.exe\`.
- Linux: extract and run from the unpacked folder.
- Configure API key via settings or \`lab-agent.env\` (see README).
"

echo "[publish] done → https://github.com/lant1ng-1216/lab-agent/releases/tag/$TAG"
