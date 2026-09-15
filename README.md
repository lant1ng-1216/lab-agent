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

构建为 **ad-hoc 深签**，**尚未** Apple 公证。用户只需：

1. 下载 zip → 解压 → 双击 `Lab Agent.app`
2. 若弹出「无法验证」→ **系统设置 → 隐私与安全性 → 仍要打开**（只需一次）
3. 打开后若提示「完成安装」→ 点 **安装并在桌面创建图标**（会装到「应用程序」并在桌面放上快捷方式，然后自动重启）

之后从**桌面上的 Lab Agent** 打开即可。不必自己拖文件、也不必搞懂「应用程序」路径。

> Windows：解压后运行 `Lab Agent.exe`；首次也可一键安装并在桌面创建快捷方式。  
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
