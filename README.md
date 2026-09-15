# Lab Agent

Open-source coding agent for the vibe-coding era: a **Lab Code** engine in the terminal, plus an optional **desktop** shell (workspaces, chat, tools, permissions) on the same engine.

Inspired by how projects like [OpenCode](https://github.com/anomalyco/opencode) ship core + desktop together.

---

## Install

### Desktop

Download the latest build from [Releases](https://github.com/lant1ng-1216/lab-agent/releases):

| Platform | Artifact |
| -------- | -------- |
| macOS (Apple Silicon) | `Lab-Agent-*-mac-arm64.zip`（解压得 `Lab Agent.app`） |
| Windows (x64) | `Lab-Agent-*-win-x64.zip` |
| Linux (x64) | `Lab-Agent-*-linux-x64.tar.gz` |

#### macOS（重要）

构建为 **ad-hoc 深签**，**尚未** Apple 公证。其他用户按下面做即可（与本机相同）：

1. 解压 zip，将 `Lab Agent.app` **拖到「应用程序」**（不要从「下载」里直接双击常开——会触发 App Translocation，工具/会话目录会变成只读）
2. 从「应用程序」打开。若弹出「无法验证 / 未打开」→ **完成** → **系统设置 → 隐私与安全性 → 仍要打开**（只点一次）
3. 也可解压后双击附带的 `mac-first-open.command`（清隔离并启动）
4. 终端备选：`xattr -cr "/Applications/Lab Agent.app" && open "/Applications/Lab Agent.app"`

> 程序坞图标若仍指向「下载」里的副本，请删掉坞里旧图标，再从「应用程序」拖一次。  
> Windows：解压后运行 `Lab Agent.exe`（偶发 SmartScreen 选仍要运行即可）。  
> Linux：解压后运行包内可执行文件。

Configure a model API key after install (DeepSeek Anthropic-compatible endpoint is the default path — see Configuration).

默认界面为 **白昼（浅色）**；可在应用内切换黑夜或「璃 / Glass」皮肤。

### Terminal (Lab Code only)

```bash
git clone https://github.com/lant1ng-1216/lab-agent.git
cd lab-agent/agents/lab-coding
cp lab-agent.env.example lab-agent.env   # set your API key
bun install && bun run build:dev
./start-lab-agent.command /path/to/your/project
```

### Desktop from source

```bash
git clone https://github.com/lant1ng-1216/lab-agent.git
cd lab-agent
cd agents/lab-coding && cp lab-agent.env.example lab-agent.env && bun install && bun run build:dev && cd ../..
npm install
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

---

## What it is

- **Lab Code** — coding-agent runtime (tools, sessions, TUI, permissions) under [`agents/lab-coding/`](./agents/lab-coding/)
- **Desktop shell** — Electron + React UI at the repo root; spawns the same engine binary
- **Workspaces** — sessions stay bound to a folder; new chat is a draft until the first send

---

## Configuration

Copy [`agents/lab-coding/lab-agent.env.example`](./agents/lab-coding/lab-agent.env.example) to `lab-agent.env` (never commit the real file) and set:

- `ANTHROPIC_AUTH_TOKEN` — API key (e.g. DeepSeek)
- `ANTHROPIC_BASE_URL` — e.g. `https://api.deepseek.com/anthropic`
- model vars as needed (defaults lean on DeepSeek Flash)

The desktop app can also take a key from its settings UI.

---

## Development

```bash
npm run desktop          # Electron shell (engine must be built)
npm run build            # compile main + renderer
npm run prepare:engines  # cross-compile engine binaries for installers
npm run dist             # engines + app + electron-builder → release/
```

Engine scripts live in `agents/lab-coding` (`bun run build:dev`).

---

## Contributing

Issues and PRs welcome. Please note terminal vs desktop, OS, and steps to reproduce (redact keys).

## License

[Apache-2.0](./LICENSE)

Formerly **vibe-lab**; renamed to **lab-agent** (stars preserved).
