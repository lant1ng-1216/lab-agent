# Lab Agent

**Lab Agent** is an open-source coding agent for the vibe-coding era: a serious **Lab Code** engine in the terminal, plus an optional **desktop shell** that wraps the same engine in a product UI (chat, workspaces, tools, permissions).

This repository is a **monorepo** (inspired by how projects like [OpenCode](https://github.com/anomalyco/opencode) ship core + desktop together):

| Path | What it is | Who needs it |
|------|------------|--------------|
| [`agents/lab-coding/`](./agents/lab-coding/) | **Engine + terminal (Lab Code)** — tools, sessions, TUI | Everyone who wants the agent itself |
| Root (`src/`, `scripts/`, `build/`) | **Desktop shell** — Electron + React | People who want the GUI / local desktop app |
| [`docs/`](./docs/) | Design notes & archives | Contributors / history |

> **Website / installers** will come later. For now, run from source. Star history on this repo continues from the earlier **vibe-lab** concept (renamed; stars preserved).

---

## Table of contents

- [Why Lab Agent](#why-lab-agent)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start — Terminal only](#quick-start--terminal-only)
- [Quick start — Desktop](#quick-start--desktop)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Reporting bugs & contributing](#reporting-bugs--contributing)
- [Security](#security)
- [Roadmap (near term)](#roadmap-near-term)
- [License & attribution](#license--attribution)

---

## Why Lab Agent

Modern coding agents often force a choice: a powerful CLI that feels like infrastructure, or a polished desktop UI that hides the engine. Lab Agent aims for both:

1. **Lab Code (terminal)** — a full coding-agent runtime you can run in any project directory: read/edit files, run commands, plan, debug, with a real permission model.
2. **Desktop shell** — the same engine behind a workspace-centric UI (sessions under folders, composer, file tree, tool traces, approvals), so feedback from daily use lands in one product.

Open source means you can **reproduce bugs**, **send PRs**, and **self-host** without waiting on a closed binary.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Desktop shell (Electron)                               │
│  src/main · src/preload · src/renderer                  │
│  workspaces · sessions · chat UI · permissions bridge   │
└───────────────────────────┬─────────────────────────────┘
                            │ spawn / stream-json IPC
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Lab Code engine  (agents/lab-coding)                   │
│  tools · sessions · TUI · model providers (e.g. DeepSeek)│
└─────────────────────────────────────────────────────────┘
```

- **Terminal-only users** talk to the engine directly (no Electron).
- **Desktop users** keep the engine as a child process; UI never reimplements the tool loop.

---

## Requirements

### Terminal (Lab Code)

| Tool | Notes |
|------|--------|
| [Bun](https://bun.sh/) | Build the engine (`bun run build:dev`) |
| macOS / Linux | Primary targets today |
| API key | DeepSeek (Anthropic-compatible endpoint) — see config below |

### Desktop shell

| Tool | Notes |
|------|--------|
| Node.js 20+ | Root `npm install` |
| Same Lab Code binary | Built under `agents/lab-coding` (`cli-dev`) |
| Electron | Pulled via root `package.json` |

---

## Quick start — Terminal only

Use this path if you only want the coding agent in the terminal (closest to “just pull the engine”).

```bash
git clone https://github.com/lant1ng-1216/lab-agent.git
cd lab-agent/agents/lab-coding

# 1) Configure secrets (never commit this file)
cp lab-agent.env.example lab-agent.env
# Edit lab-agent.env — set ANTHROPIC_AUTH_TOKEN (DeepSeek key) and base URL

# 2) Install & build the engine binary
bun install
bun run build:dev    # produces ./cli-dev

# 3) Launch in a project directory
./start-lab-agent.command /path/to/your/project
```

On first launch you may see theme / trust / onboarding flows. Config and session transcripts for the CLI live under `agents/lab-coding/.lab-agent-config/` (gitignored).

More engine-specific notes: [`agents/lab-coding/README.lab.md`](./agents/lab-coding/README.lab.md).

---

## Quick start — Desktop

Use this path for the full local desktop experience.

```bash
git clone https://github.com/lant1ng-1216/lab-agent.git
cd lab-agent

# Engine must be built first (desktop spawns agents/lab-coding/cli-dev)
cd agents/lab-coding
cp lab-agent.env.example lab-agent.env   # add your API key
bun install && bun run build:dev
cd ../..

# Desktop deps + run
npm install
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

> On macOS, prefer `env -u ELECTRON_RUN_AS_NODE npm run desktop` so the real Electron GUI binary starts (not Node-as-Electron).

**Dev tip:** After changing `src/main`, restart the desktop process; Vite HMR alone does not reload the main process.

### Workspaces & sessions (desktop)

Product model:

- A **workspace** is a folder on disk.
- **Sessions** live under a workspace; they are not silently rebound across folders.
- **New chat** starts as a draft (no sidebar row) until the first message is sent.
- Removing a workspace can cascade-delete its sessions (with confirm).

---

## Configuration

### `agents/lab-coding/lab-agent.env`

Copy from `lab-agent.env.example`. Typical keys:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_AUTH_TOKEN` | API key (DeepSeek or compatible) |
| `ANTHROPIC_BASE_URL` | e.g. `https://api.deepseek.com/anthropic` |
| `ANTHROPIC_MODEL` / default model vars | Model ids (defaults lean on DeepSeek Flash) |

The desktop bridge also reads this file (and will not commit it). You may additionally configure a custom API inside the desktop UI.

### Do not commit

- `lab-agent.env`, `.env`, API keys  
- `.lab-agent-config/` (sessions / local agent state)  
- `cli-dev` / `cli` binaries (build them locally)  
- `node_modules/`, `dist/`

---

## Repository layout

```
lab-agent/
├── agents/
│   └── lab-coding/          # Lab Code engine + terminal launcher
├── src/
│   ├── main/                # Electron main (window, dock icon, agent bridge)
│   ├── preload/
│   ├── renderer/            # React UI (chat, sidebar, skin, composer)
│   ├── agent/               # Lightweight loops used by the shell
│   └── shared/              # IPC / protocol types
├── build/                   # App icons (.png / .icns)
├── scripts/                 # dev.mjs, copy-lab-coding.mjs
├── docs/                    # Notes & archive (incl. early concept drafts)
├── package.json             # Desktop workspace root
└── README.md                # You are here
```

---

## Development

### Scripts (root)

| Command | Description |
|---------|-------------|
| `npm run desktop` | Start Electron desktop (via `scripts/dev.mjs`) |
| `npm run build` | Typecheck main + Vite build renderer |
| `npm run typecheck` | `tsc --noEmit` |

### Scripts (engine)

| Command | Description |
|---------|-------------|
| `bun run build:dev` | Build `cli-dev` for local / desktop use |
| `./start-lab-agent.command [project]` | Launch TUI with env + health check |

### Code style

- Match existing TypeScript / React patterns in `src/renderer`.
- Prefer evidence over speculation when fixing agent hangs (logs, stream-json events).
- Do not commit secrets or personal session transcripts.

---

## Reporting bugs & contributing

We welcome issues and PRs — especially from people using Lab Agent daily.

**When filing a bug, please include:**

1. Terminal vs Desktop (or both)  
2. OS + Node/Bun versions  
3. Steps to reproduce  
4. Relevant logs (redact API keys)  
5. Whether `.lab-agent-config` was wiped / sessions resumed  

**PR tips:**

- Keep changes focused (engine vs desktop).  
- For desktop UI, describe the UX expectation (workspaces, drafts, notices).  
- Rebuild `cli-dev` when engine behavior changes.

Friends and collaborators: clone the monorepo, run the path you care about (terminal or desktop), and send patches against `main`.

---

## Security

- Treat `lab-agent.env` as secret; rotate keys if leaked.  
- The agent can read/write files and run commands in the trusted project directory — review permission prompts on desktop.  
- This project is under active development; use on trusted machines and repositories.

If you discover a security-sensitive issue, open a private report or contact the maintainer rather than posting exploit details in a public issue.

---

## Roadmap (near term)

- [ ] Official website & branded installers (desktop downloads)  
- [ ] Hardened packaging (`Lab Agent.app` name + icons — not “Electron” in Dock)  
- [ ] Clearer contribution templates / CI  
- [ ] Supervisor / multi-agent mode beyond concept preview  

---

## License & attribution

- Repository license: see [`LICENSE`](./LICENSE) (Apache-2.0).  
- The Lab Code engine under `agents/lab-coding` builds on community coding-agent work; see files and notices inside that package for upstream attribution.  
- UI/mascot assets may carry their own licenses (e.g. under `src/renderer/mascot/`).

---

## Links

- **GitHub:** https://github.com/lant1ng-1216/lab-agent  
- **Issues:** https://github.com/lant1ng-1216/lab-agent/issues  

Formerly published as **vibe-lab**; this repository was renamed to **lab-agent** while keeping community stars and evolving the product into Lab Agent (terminal + desktop).
