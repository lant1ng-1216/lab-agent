#!/usr/bin/env bash
# Push main + create GitHub Release with local installer artifacts.
# Usage: ./scripts/publish-release.sh [v0.1.8]
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-v0.1.8}"
VER="${TAG#v}"

echo "[publish] pushing main…"
git push origin main

MAC="release/Lab-Agent-${VER}-mac-arm64.zip"
WIN="release/Lab-Agent-${VER}-win-x64.zip"
LINUX="release/Lab-Agent-${VER}-linux-x64.tar.gz"
for f in "$MAC" "$WIN" "$LINUX"; do
  [[ -f "$f" ]] || { echo "missing $f — run npm run dist first"; exit 1; }
done

echo "[publish] creating ${TAG}…"
gh release create "$TAG" "$MAC" "$WIN" "$LINUX" \
  --title "Lab Agent ${VER}" \
  --notes "## Lab Agent ${VER}

- Improve desktop engine discovery and add sanitized runtime diagnostics when an engine or tool fails.
- Make long-running Agent turns more reliable: permission waits are distinguished from stalls, and quiet Shell/tool work gets appropriate bounded timeouts.
- Store the API Key locally using Electron's secure storage, clarify model-list verification, and show concise, bounded API errors.
- Clean up model selection by deduplicating canonical IDs and presenting clear model names.
- Replace speculative context-window percentages with reported cumulative token totals, with provider cache accounting covered by regression tests.
- Improve conversation scrolling: reserve space above the composer, follow new output by default, respect history browsing, and provide a return-to-latest control.
- Keep Agent working/complete presentation in sync and reduce visual flicker during tool activity.
- Include regression coverage for engine discovery, watchdog behavior, credentials, model catalogs, token accounting, and chat scrolling.
- macOS zip includes \`mac-first-open.command\` helper.
- macOS build is ad-hoc signed and is **not Apple-notarized**.

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
