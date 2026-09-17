#!/usr/bin/env bash
# Push main + create GitHub Release with local installer artifacts.
# Usage: ./scripts/publish-release.sh [v0.1.7]
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-v0.1.7}"
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

- Default appearance is **light (白昼)**
- Fix Glass/skull skin crash when switching themes (\`scene.animate\` race)
- Verify API credentials and model availability before saving a provider configuration
- Route DeepSeek through its official Anthropic-compatible endpoint and report unsupported protocols clearly
- Refresh the desktop chrome: app icon, refined appearance cards, unified title bar, and non-blocking supervisor preview
- Render the product switcher as a viewport-safe floating menu so it cannot be covered by the main content
- macOS zip includes \`mac-first-open.command\` helper
- Ad-hoc deep-signed mac build (not Apple-notarized)

| Platform | File |
| -------- | ---- |
| macOS Apple Silicon | \`Lab-Agent-${VER}-mac-arm64.zip\` |
| Windows x64 | \`Lab-Agent-${VER}-win-x64.zip\` |
| Linux x64 | \`Lab-Agent-${VER}-linux-x64.tar.gz\` |

### macOS first open
1. Unzip → drag \`Lab Agent.app\` to Applications
2. If blocked: System Settings → Privacy & Security → **Open Anyway**
3. Or run \`mac-first-open.command\` from the unzipped folder
"

echo "[publish] done → https://github.com/lant1ng-1216/lab-agent/releases/tag/$TAG"
