# Lab Code

Terminal coding agent that powers **Lab Agent**.

This package is the **engine**: tools, sessions, TUI, and model providers.  
The Electron desktop app at the repository root spawns the binary built here (`cli-dev`).

## Quick start

From this directory:

```bash
cp lab-agent.env.example lab-agent.env   # add your API key
bun install
bun run build:dev
./start-lab-agent.command /path/to/your/project
```

See **[`README.lab.md`](./README.lab.md)** for Lab-specific notes, and the **[root README](../../README.md)** for the full monorepo (desktop + terminal).

## Layout

| Item | Role |
|------|------|
| `src/` | Engine source |
| `start-lab-agent.command` | Launcher (loads `lab-agent.env`, checks endpoint, runs `cli-dev`) |
| `lab-agent.env.example` | Config template (never commit real `lab-agent.env`) |
| `.lab-agent-config/` | Local sessions / config (gitignored) |

## Build

```bash
bun run build:dev
```

Produces `./cli-dev` for local use and for the desktop shell.
