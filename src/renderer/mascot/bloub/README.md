# Lab Agent mascot (bloub)

Engine copied from [jeremy-prt/bloub](https://github.com/jeremy-prt/bloub) (`src/bot/`), MIT License.

Chat wiring (`BloubAvatar.tsx`):
- single avatar on live / latest assistant row only (no historical Bloub)
- gaze never releases to REST — holds last aim; viewport follow + deadzone
- 38px slot, eye holes use real chat paper, 2× supersample
- dark theme: body flips to near-white via `html.dark` / `data-theme` (not raw --page; oklch broke the old path)

Not affiliated with xAI / Grok. The MIT license covers this code recreation, not the imitated design.

See `LICENSE` in this folder.
