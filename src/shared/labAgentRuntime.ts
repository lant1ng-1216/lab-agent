const EXTERNAL_MEMORY_ENV_VARS = [
  "CLAUDE_CODE_REMOTE_MEMORY_DIR",
  "CLAUDE_COWORK_MEMORY_PATH_OVERRIDE",
  "CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES",
  "CLAUDE_CODE_REMOTE",
  "CLAUDE_CODE_USE_COWORK_PLUGINS",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
  "CLAUDE_CODE_SIMPLE",
] as const;

/** Force the engine's compatibility config variables onto Lab Agent's profile. */
export function labAgentRuntimeEnv(
  inherited: Record<string, string | undefined>,
  labAgentHome: string,
): Record<string, string | undefined> {
  const env = { ...inherited };
  for (const key of EXTERNAL_MEMORY_ENV_VARS) delete env[key];
  env.LAB_AGENT_HOME = labAgentHome;
  env.CLAUDE_CONFIG_DIR = labAgentHome;
  return env;
}

/** Settings passed to the engine so file and shell tools deny Claude's global profile. */
export function labAgentMemoryGuardSettings(): string {
  return JSON.stringify({
    permissions: {
      deny: [
        "Read(~/.claude)",
        "Read(~/.claude/**)",
        "Grep(~/.claude)",
        "Grep(~/.claude/**)",
        "Glob(~/.claude)",
        "Glob(~/.claude/**)",
        "Bash(*.claude*)",
        "PowerShell(*.claude*)",
      ],
    },
    sandbox: { filesystem: { denyRead: ["~/.claude"] } },
  });
}
