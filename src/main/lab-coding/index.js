#!/usr/bin/env node

/**
 * Lab Coding — 产品自建 Coding Agent REPL
 * 与 Lab 监工通过 IPC/PTY 协议通信
 */

const readline = require("readline");
const { Writable } = require("stream");

const VERSION = "0.1.0";
const MODELS = ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"];

// ANSI colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  bgBlue: "\x1b[44m",
};

// Logo
const LOGO = `
${c.blue}   ██╗      █████╗ ██████╗ ${c.reset}
${c.blue}   ██║     ██╔══██╗██╔══██╗${c.reset}
${c.blue}   ██║     ███████║██████╔╝${c.reset}
${c.blue}   ██║     ██╔══██║██╔══██╗${c.reset}
${c.blue}   ███████╗██║  ██║██████╔╝${c.reset}
${c.blue}   ╚══════╝╚═╝  ╚═╝╚═════╝ ${c.reset}
`;

// State
const state = {
  model: "deepseek-chat",
  task: null, // { id, desc, status, progress }
  history: [],
  apiKey: process.env.DEEPSEEK_API_KEY || null,
  cwd: process.cwd(),
};

// Protocol markers (parsed by renderer)
const PROTO = {
  task: (id, desc) => `\x1b]lab;task;${id};${desc}\x07`,
  progress: (id, pct, msg) => `\x1b]lab;progress;${id};${pct};${msg}\x07`,
  diff: (id, file, add, del) => `\x1b]lab;diff;${id};${file};${add};${del}\x07`,
  done: (id, summary) => `\x1b]lab;done;${id};${summary}\x07`,
  question: (id, q) => `\x1b]lab;question;${id};${q}\x07`,
  status: (s) => `\x1b]lab;status;${s}\x07`,
};

// Output helpers
function out(text) {
  process.stdout.write(text + "\n");
}

function err(text) {
  process.stdout.write(`${c.red}✗ ${text}${c.reset}\n`);
}

function ok(text) {
  process.stdout.write(`${c.green}✓ ${text}${c.reset}\n`);
}

function info(text) {
  process.stdout.write(`${c.gray}  ${text}${c.reset}\n`);
}

function prompt() {
  return `${c.blue}lab${c.reset}${c.dim}@${c.reset}${c.cyan}${state.model.split("-")[1]}${c.reset} ${c.blue}❯${c.reset} `;
}

// Banner
function banner() {
  out(LOGO);
  out(`  ${c.bold}Lab Coding${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  out(`  ${c.dim}Type /help for commands${c.reset}`);
  out("");
  if (!state.apiKey) {
    err("DEEPSEEK_API_KEY not set");
    info("Set it in Settings → 产品自建 Coding Agent");
    out("");
  }
}

// Commands
const commands = {
  "/help": {
    desc: "Show available commands",
    run: () => {
      out("");
      out(`${c.bold}Available commands:${c.reset}`);
      Object.entries(commands).forEach(([cmd, { desc }]) => {
        out(`  ${c.cyan}${cmd.padEnd(12)}${c.reset} ${desc}`);
      });
      out("");
      out(`${c.dim}Natural language input is sent to ${state.model}${c.reset}`);
      out("");
    },
  },
  "/clear": {
    desc: "Clear terminal",
    run: () => {
      process.stdout.write("\x1b[2J\x1b[0;0H");
      banner();
    },
  },
  "/model": {
    desc: "Show or switch model",
    run: (args) => {
      if (!args[0]) {
        out(`Current model: ${c.cyan}${state.model}${c.reset}`);
        out(`Available: ${MODELS.join(", ")}`);
        return;
      }
      const m = args[0];
      if (MODELS.includes(m)) {
        state.model = m;
        ok(`Switched to ${m}`);
      } else {
        err(`Unknown model: ${m}`);
        info(`Available: ${MODELS.join(", ")}`);
      }
    },
  },
  "/task": {
    desc: "Create new task",
    run: (args) => {
      const desc = args.join(" ") || "Untitled task";
      const id = `task-${Date.now()}`;
      state.task = { id, desc, status: "pending", progress: 0 };
      out("");
      out(`${c.bgBlue}${c.bold} TASK ${c.reset} ${c.bold}${id}${c.reset}`);
      out(`  ${desc}`);
      out("");
      process.stdout.write(PROTO.task(id, desc));
      ok("Task created. Start typing to work on it.");
    },
  },
  "/status": {
    desc: "Show current status",
    run: () => {
      out("");
      out(`${c.bold}Status${c.reset}`);
      out(`  Model:   ${c.cyan}${state.model}${c.reset}`);
      out(`  Task:    ${state.task ? `${state.task.id} (${state.task.status})` : "none"}`);
      out(`  CWD:     ${state.cwd}`);
      out(`  History: ${state.history.length} messages`);
      out("");
    },
  },
  "/diff": {
    desc: "Show pending changes",
    run: () => {
      if (!state.task) {
        err("No active task");
        return;
      }
      // TODO: integrate with git or file watcher
      info("No pending changes (git integration coming)");
    },
  },
  "/run": {
    desc: "Execute shell command",
    run: (args) => {
      if (!args.length) {
        err("Usage: /run <command>");
        return;
      }
      const { exec } = require("child_process");
      const cmd = args.join(" ");
      info(`$ ${cmd}`);
      exec(cmd, { cwd: state.cwd }, (error, stdout, stderr) => {
        if (error) {
          err(`Exit ${error.code}`);
          if (stderr) out(stderr);
          return;
        }
        if (stdout) out(stdout);
        ok("Done");
      });
    },
  },
  "/exit": {
    desc: "Exit Lab Coding",
    run: () => {
      out(`${c.dim}Goodbye.${c.reset}`);
      process.exit(0);
    },
  },
};

// DeepSeek API (streaming)
async function chat(messages, onChunk) {
  if (!state.apiKey) {
    throw new Error("API key not set. Use /model to check configuration.");
  }

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify({
      model: state.model,
      messages,
      stream: true,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

// Handle natural language input
async function handleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // Command
  if (trimmed.startsWith("/")) {
    const [cmd, ...args] = trimmed.split(/\s+/);
    const handler = commands[cmd];
    if (handler) {
      await handler.run(args);
    } else {
      err(`Unknown command: ${cmd}`);
      info("Type /help for available commands");
    }
    return;
  }

  // Natural language → DeepSeek
  if (!state.apiKey) {
    err("API key not set");
    info("Set DEEPSEEK_API_KEY in Settings → 产品自建 Coding Agent");
    return;
  }

  state.history.push({ role: "user", content: trimmed });

  // Build messages
  const messages = [
    {
      role: "system",
      content: `You are Lab Coding, an AI coding assistant. Current working directory: ${state.cwd}. ${
        state.task ? `Active task: ${state.task.id} — ${state.task.desc}` : "No active task."
      }`,
    },
    ...state.history.slice(-20), // keep last 20 for context
  ];

  // Stream response
  let response = "";
  process.stdout.write(`${c.green}●${c.reset} `);

  try {
    await chat(messages, (chunk) => {
      response += chunk;
      process.stdout.write(chunk);
    });
    process.stdout.write("\n\n");
    state.history.push({ role: "assistant", content: response });
  } catch (e) {
    process.stdout.write("\n");
    err(e.message);
  }
}

// Main
async function main() {
  banner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: prompt(),
    terminal: true,
    historySize: 100,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    await handleInput(line);
    rl.setPrompt(prompt());
    rl.prompt();
  });

  rl.on("close", () => {
    out(`${c.dim}Goodbye.${c.reset}`);
    process.exit(0);
  });

  // Handle PTY resize
  process.stdout.on("resize", () => {
    // xterm.js handles this
  });
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
