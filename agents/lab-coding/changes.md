# Codex API Support: Feature Parity & UI Overhaul

## Summary
This pull request introduces full feature parity and explicit UI support for the OpenAI Codex backend (`chatgpt.com/backend-api/codex/responses`). The codebase is now entirely backend-agnostic and smoothly transitions between Anthropic Claude and OpenAI Codex schemas based on current authentication, without losing features like reasoning animations, token billing, or multi-modal visual inputs.

## Key Changes

### 1. Codex API Gateway Adapter (`codex-fetch-adapter.ts`)
- **Native Vision Translation**: Anthropic `base64` image schemas now map precisely to the Codex expected `input_image` payloads.
- **Strict Payload Mapping**: Refactored the internal mapping logic to translate `msg.content` items precisely into `input_text`, sidestepping OpenAI's strict `v1/responses` validation rules (`Invalid value: 'text'`).
- **Tool Logic Fixes**: Properly routed `tool_result` items into top-level `function_call_output` objects to guarantee that local CLI tool executions (File Reads, Bash loops) cleanly feed back into Codex logic without throwing "No tool output found" errors.
- **Cache Stripping**: Cleanly stripped Anthropic-only `cache_control` annotations from tool bindings and prompts prior to transmission so the Codex API doesn't reject malformed JSON.

### 2. Deep UI & Routing Integration
- **Model Cleanups (`model.ts`)**: Updated `getPublicModelDisplayName` and `getClaudeAiUserDefaultModelDescription` to recognize Codex GPT strings. Models like `gpt-5.1-codex-max` now beautifully map to `Codex 5.1 Max` in the CLI visual outputs instead of passing the raw proxy IDs.
- **Default Reroutes**: Made `getDefaultMainLoopModelSetting` aware of `isCodexSubscriber()`, automatically defaulting to `gpt-5.2-codex` instead of `sonnet46`.
- **Billing Visuals (`logoV2Utils.ts`)**: Refactored `formatModelAndBilling` logic to render `Codex API Billing` proudly inside the terminal header when authenticated.

### 3. Reasoning & Metrics Support
- **Thinking Animations**: `codex-fetch-adapter` now intentionally intercepts the proprietary `response.reasoning.delta` SSE frames emitted by `codex-max` models. It wraps them into Anthropic `<thinking>` events, ensuring the standard CLI "Thinking..." spinner continues to function flawlessly for OpenAI reasoning.
- **Token Accuracy**: Bound logic to track `response.completed` completion events, fetching `usage.input_tokens` and `output_tokens`. These are injected natively into the final `message_stop` token handler, meaning Codex queries correctly trigger the terminal's Token/Price tracker summary logic.

### 4. Git Housekeeping
- Configured `.gitignore` to securely and durably exclude the `openclaw/` gateway directory from staging commits.
