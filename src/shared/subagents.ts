import type { AgentToolTrace, SubagentTrace } from './protocol'

/**
 * Claude Code exposes sub-agents through one tool: `Agent` (current wire name)
 * with `Task` kept as the legacy alias. Both spawn a child agent, so the UI
 * treats them as sub-agents rather than ordinary tool rows.
 */
export function isSubagentTool(name: string): boolean {
  const n = (name || '').trim().toLowerCase()
  return n === 'agent' || n === 'task'
}

function toolStatusToSubagent(state: AgentToolTrace['state']): SubagentTrace['status'] {
  if (state === 'running') return 'running'
  if (state === 'error') return 'failed'
  return 'completed'
}

/**
 * Build the sub-agent list the drawer renders.
 *
 * The engine's `task_started` / `task_progress` / `task_notification` events are
 * the primary source (`subagents`), but older engine builds (or a dropped
 * event) only leave an `Agent`/`Task` row in the tool trace. Fall back to those
 * tool rows so a sub-agent is never invisible — it just lacks live usage.
 *
 * `subagents` wins on conflict; a tool row is only used when no task id matches
 * (by task id or by the Agent tool_use id).
 */
export function mergeSubagentTraces(
  tools: AgentToolTrace[],
  subagents: SubagentTrace[],
): SubagentTrace[] {
  const out: SubagentTrace[] = [...subagents]
  const seenTaskIds = new Set(out.map((s) => s.id))
  const seenToolUseIds = new Set(out.map((s) => s.toolUseId).filter(Boolean) as string[])

  for (const t of tools) {
    if (!isSubagentTool(t.name)) continue
    if (seenTaskIds.has(t.id) || seenToolUseIds.has(t.id)) continue
    seenTaskIds.add(t.id)
    out.push({
      id: t.id,
      toolUseId: t.id,
      description: t.summary || t.name,
      status: toolStatusToSubagent(t.state),
      summary: t.state === 'error' ? t.summary : undefined,
      ts: t.ts,
    })
  }

  // Newest first, but keep running agents pinned to the top so the drawer shows
  // live work before finished runs.
  return out.sort((a, b) => {
    const ar = a.status === 'running' ? 0 : 1
    const br = b.status === 'running' ? 0 : 1
    if (ar !== br) return ar - br
    return b.ts - a.ts
  })
}
