const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AGENT_WATCHDOG_LIMITS,
  getAgentWatchdogStopReason,
} = require("../dist/shared/agentWatchdog.js");
const {
  avatarMotionForTurn,
  isAgentTurnWorking,
} = require("../dist/shared/agentPresentation.js");
const {
  canonicalModelId,
  dedupeModelsById,
  modelMatchesQuery,
} = require("../dist/shared/modelCatalog.js");
const { summarizeApiError } = require("../dist/shared/apiErrors.js");
const { withoutApiKey } = require("../dist/shared/credentialMetadata.js");
const { findEngineRoot } = require("../dist/main/enginePaths.js");
const { DESKTOP_AGENT_GUIDANCE } = require("../dist/shared/desktopAgentGuidance.js");
const {
  DESKTOP_RUNTIME_MARKER,
  isLikelyToolFailure,
  sanitizeDesktopDiagnostic,
} = require("../dist/shared/desktopRuntime.js");
const {
  CHAT_FOLLOW_RESUME_DELAY_MS,
  chatBottomInset,
  isIntentionalChatBrowse,
  isNearChatBottom,
} = require("../dist/shared/chatScroll.js");
const {
  cacheHitPercent,
  contextTokensUsed,
  addUsageToSectionTotals,
  parseTokenUsageSnapshot,
  peakContextUsage,
  reportedTurnTokens,
  resolveModelContextLimit,
} = require("../dist/shared/modelContext.js");

const minute = 60_000;

function watchdogSnapshot(overrides = {}) {
  return {
    turnBusy: true,
    permissionPending: false,
    runningTool: false,
    runningShell: false,
    now: 0,
    lastActivityAt: 0,
    turnStartedAt: 0,
    ...overrides,
  };
}

test("permission waits are not mistaken for generic engine silence", () => {
  assert.equal(
    getAgentWatchdogStopReason(
      watchdogSnapshot({ now: AGENT_WATCHDOG_LIMITS.hardTurnMs - 1, permissionPending: true }),
    ),
    null,
  );
});

test("a quiet shell is allowed past the old 90-second cutoff, then bounded", () => {
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({
      now: 90_000,
      runningTool: true,
      runningShell: true,
    })),
    null,
  );
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({
      now: AGENT_WATCHDOG_LIMITS.shellNoOutputMs,
      runningTool: true,
      runningShell: true,
    })),
    "shell-idle",
  );
});

test("generic and non-shell tool silence use explicit, distinct limits", () => {
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({ now: AGENT_WATCHDOG_LIMITS.noOutputMs - 1 })),
    null,
  );
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({ now: AGENT_WATCHDOG_LIMITS.noOutputMs })),
    "idle",
  );
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({
      now: AGENT_WATCHDOG_LIMITS.toolNoOutputMs,
      runningTool: true,
    })),
    "tool-idle",
  );
});

test("the hard turn limit remains effective even during a permission wait", () => {
  assert.equal(
    getAgentWatchdogStopReason(watchdogSnapshot({
      now: AGENT_WATCHDOG_LIMITS.hardTurnMs,
      permissionPending: true,
    })),
    "hard-limit",
  );
});

test("avatar leaves work animation as soon as the agent turn is complete", () => {
  assert.equal(avatarMotionForTurn(true), "full");
  assert.equal(avatarMotionForTurn(false), "breathe");
  assert.equal(isAgentTurnWorking({
    status: "thinking",
    streamComplete: true,
    hasStreamingMessage: true,
    hasRunningTool: true,
    hasPermission: false,
  }), false);
  assert.equal(isAgentTurnWorking({
    status: "waiting",
    streamComplete: false,
    hasStreamingMessage: false,
    hasRunningTool: false,
    hasPermission: true,
  }), true);
  assert.equal(isAgentTurnWorking({
    status: "thinking",
    streamComplete: false,
    hasStreamingMessage: false,
    hasRunningTool: false,
    hasPermission: false,
  }), true);
});

test("model IDs deduplicate exactly without collapsing same-name variants", () => {
  const models = dedupeModelsById([
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4.1 Flash" },
    { id: "deepseek-flash", name: "DeepSeek V4.1 Flash" },
    { id: "deepseek-v4-flash", name: "duplicate row" },
  ]);
  assert.deepEqual(models.map((model) => model.id), [
    "deepseek-v4.1-flash",
    "deepseek-v4-flash",
    "deepseek-flash",
  ]);
  assert.equal(modelMatchesQuery({ id: "deepseek-v4-flash", name: "DeepSeek V4.1 Flash" }, "v4-flash"), true);
  assert.equal(modelMatchesQuery({ id: "deepseek-v4-flash", name: "DeepSeek V4.1 Flash" }, "missing"), false);
});

test("known DeepSeek legacy aliases resolve to current model IDs", () => {
  assert.equal(canonicalModelId("deepseek", "deepseek-v4-flash"), "deepseek-flash");
  assert.equal(canonicalModelId("deepseek", "deepseek-v4.1-flash"), "deepseek-flash");
  assert.equal(canonicalModelId("deepseek", "deepseek-pro"), "deepseek-v4-pro");
  assert.equal(canonicalModelId("unknown", "deepseek-v4-flash"), "deepseek-v4-flash");
  const collapsed = dedupeModelsById([
    { id: canonicalModelId("deepseek", "deepseek-flash") },
    { id: canonicalModelId("deepseek", "deepseek-v4-flash") },
    { id: canonicalModelId("deepseek", "deepseek-v4.1-flash") },
  ]);
  assert.deepEqual(collapsed.map((model) => model.id), ["deepseek-flash"]);
});

test("engine resolution requires the executable and falls back to the platform bundle", () => {
  const roots = ["/repo/agents/lab-coding", "/repo/packaging/engine/darwin-arm64"];
  const selected = findEngineRoot(roots, "darwin", (file) => file.endsWith("/packaging/engine/darwin-arm64/cli-dev"));
  assert.equal(selected, roots[1]);
  assert.equal(findEngineRoot(roots, "darwin", () => false), roots[0]);
});

test("API failure summaries do not label a rejected request as globally invalid credentials", () => {
  const summary = summarizeApiError(
    "auth",
    'HTTP 401 @ https://api.deepseek.com/models: {"error":{"message":"Authentication Fails, Your api key: sk-1234567890secret is invalid"}}',
  );
  assert.match(summary, /本次认证/);
  assert.match(summary, /HTTP 401/);
  assert.doesNotMatch(summary, /sk-1234567890secret|\{"error"/);
  assert.ok(summary.length < 300);
});

test("API credentials are excluded from renderer metadata persistence", () => {
  const metadata = withoutApiKey({ baseUrl: "https://api.deepseek.com", apiKey: "sk-secret", models: [] });
  assert.equal(Object.hasOwn(metadata, "apiKey"), false);
  assert.doesNotMatch(JSON.stringify(metadata), /sk-secret/);
});

test("GitHub inspection guidance keeps clone steps visible and separate", () => {
  assert.match(DESKTOP_AGENT_GUIDANCE, /check whether the repository is already present/i);
  assert.match(DESKTOP_AGENT_GUIDANCE, /do not clone it again or create a nested copy/i);
  assert.match(DESKTOP_AGENT_GUIDANCE, /Do not pipe long-running network commands through head or tail/i);
  assert.match(DESKTOP_AGENT_GUIDANCE, /Keep authentication checks separate from fetches/i);
});

test("runtime diagnostics identify the source build and sanitize secrets", () => {
  assert.equal(DESKTOP_RUNTIME_MARKER, "desktop-diagnostics-v1");
  const line = sanitizeDesktopDiagnostic(
    "git clone https://user:pass@github.com/org/repo?token=query-secret /Users/alice/work token=ghp_1234567890secret",
    "/Users/alice",
  );
  assert.match(line, /https:\/\/github\.com\/org\/repo/);
  assert.match(line, /~\/work/);
  assert.doesNotMatch(line, /pass|query-secret|ghp_1234567890secret/);
});

test("Git failures are recognized even when the runtime omits its is_error flag", () => {
  assert.equal(isLikelyToolFailure(false, "fatal: destination path 'repo' already exists"), true);
  assert.equal(isLikelyToolFailure(false, "Cloning into 'repo'... done."), false);
});

test("chat auto-follow threshold leaves manual reading in control", () => {
  assert.equal(isNearChatBottom({ scrollHeight: 1_000, scrollTop: 868, clientHeight: 100 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1_000, scrollTop: 850, clientHeight: 100 }), false);
  assert.equal(isNearChatBottom({ scrollHeight: 1_000, scrollTop: 700, clientHeight: 100 }), false);
  assert.equal(chatBottomInset(112), 144);
  assert.equal(chatBottomInset(184), 216);
});

test("chat auto-follow resumes after a short pause but keeps intentional history browsing detached", () => {
  assert.equal(CHAT_FOLLOW_RESUME_DELAY_MS, 2_500);
  const viewport = { scrollHeight: 2_000, scrollTop: 1_400, clientHeight: 500 };
  assert.equal(isIntentionalChatBrowse(viewport, -120), false);
  assert.equal(isIntentionalChatBrowse({ ...viewport, scrollTop: 1_200 }, -200), true);
  assert.equal(isIntentionalChatBrowse({ ...viewport, scrollTop: 800 }), true);
});

test("Anthropic usage adds cache breakdown exactly once for a single request", () => {
  const usage = parseTokenUsageSnapshot({
    input_tokens: 41_000,
    output_tokens: 8_400,
    cache_read_input_tokens: 369_000,
  });
  assert.ok(usage);
  const context = contextTokensUsed(usage);
  const window = resolveModelContextLimit("deepseek-flash").contextWindow;
  assert.equal(reportedTurnTokens(usage), 418_400);
  assert.equal(context, 410_000);
  assert.equal(Math.round((context / window) * 100), 41);
  assert.equal(cacheHitPercent(usage), 90);
});

test("DeepSeek OpenAI prompt_tokens already includes cached tokens", () => {
  const usage = parseTokenUsageSnapshot({
    prompt_tokens: 20_000,
    completion_tokens: 500,
    prompt_tokens_details: { cached_tokens: 18_000 },
    prompt_cache_hit_tokens: 18_000,
    prompt_cache_miss_tokens: 2_000,
  });
  assert.ok(usage);
  assert.equal(contextTokensUsed(usage), 20_000);
  assert.equal(reportedTurnTokens(usage), 20_500);
  assert.equal(cacheHitPercent(usage), 90);
});

test("OpenAI Responses input_tokens already includes its cached_tokens breakdown", () => {
  const usage = parseTokenUsageSnapshot({
    input_tokens: 20_000,
    output_tokens: 500,
    input_tokens_details: { cached_tokens: 18_000 },
  });
  assert.ok(usage);
  assert.equal(contextTokensUsed(usage), 20_000);
  assert.equal(reportedTurnTokens(usage), 20_500);
  assert.equal(cacheHitPercent(usage), 90);
});

test("missing or malformed usage fields stay unknown instead of becoming a false zero", () => {
  assert.equal(parseTokenUsageSnapshot({ input_tokens: null, output_tokens: "unknown" }), undefined);
  assert.equal(parseTokenUsageSnapshot({ prompt_tokens: null, completion_tokens: 500 }), undefined);
  assert.equal(parseTokenUsageSnapshot({ prompt_cache_hit_tokens: 18_000 }), undefined);
  assert.equal(parseTokenUsageSnapshot({ input_tokens: 0, output_tokens: 0 }).inputTokens, 0);
});

test("agentic task totals do not masquerade as a single-request context peak", () => {
  const requests = Array.from({ length: 23 }, () => ({
    inputTokens: 2_000,
    outputTokens: 100,
    cacheReadTokens: 18_000,
    inputIncludesCache: false,
    usageFormat: "anthropic",
  }));
  const peak = requests.reduce((current, request) => peakContextUsage(current, request), undefined);
  const totals = requests.reduce((current, request) => addUsageToSectionTotals(current, request), undefined);

  assert.equal(contextTokensUsed(peak), 20_000);
  assert.equal(totals.totalInputTokens, 460_000);
  assert.equal(reportedTurnTokens(totals), 462_300);
  assert.equal(Math.round((contextTokensUsed(peak) / 1_000_000) * 100), 2);
  assert.equal(Math.round((totals.totalInputTokens / 1_000_000) * 100), 46);
});
