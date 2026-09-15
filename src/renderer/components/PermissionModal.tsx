import { useEffect, useMemo, useState } from "react";
import type { AgentPermissionPrompt } from "@shared/protocol";
import { AGENT_PERMISSION_TIMEOUT_MS } from "@shared/protocol";

export type PermissionAction =
  | { type: "deny" }
  | { type: "trust_workspace" }
  | { type: "answer"; answers: Record<string, string> };

type Props = {
  permission: AgentPermissionPrompt;
  onAction: (action: PermissionAction) => void;
};

/**
 * Tool permission / AskUserQuestion modal.
 * Tool prompts: deny | trust workspace (2 actions).
 * AskUserQuestion: pick options, then continue.
 */
export default function PermissionModal({ permission, onAction }: Props) {
  const timeoutMs = permission.timeoutMs ?? AGENT_PERMISSION_TIMEOUT_MS;
  const expiresAt = permission.expiresAt ?? Date.now() + timeoutMs;
  const [now, setNow] = useState(() => Date.now());
  const questions = permission.questions;
  const isAsk = Boolean(questions?.length);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qIndex, setQIndex] = useState(0);

  useEffect(() => {
    setAnswers({});
    setQIndex(0);
  }, [permission.requestId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [permission.requestId]);

  const remaining = Math.max(0, expiresAt - now);
  const frac = Math.min(1, remaining / timeoutMs);
  const secs = Math.ceil(remaining / 1000);

  const current = questions?.[qIndex];
  const allAnswered = useMemo(() => {
    if (!questions?.length) return false;
    return questions.every((q) => Boolean(answers[q.question]?.trim()));
  }, [questions, answers]);

  const pickOption = (label: string) => {
    if (!current) return;
    if (current.multiSelect) {
      const prev = answers[current.question]
        ? answers[current.question]!.split(", ").filter(Boolean)
        : [];
      const next = prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label];
      setAnswers((a) => ({ ...a, [current.question]: next.join(", ") }));
      return;
    }
    const nextAnswers = { ...answers, [current.question]: label };
    setAnswers(nextAnswers);
    if (questions && qIndex < questions.length - 1) {
      setQIndex((i) => i + 1);
      return;
    }
    onAction({ type: "answer", answers: nextAnswers });
  };

  return (
    <div className="titlebar-no-drag absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div
        className="w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] shadow-[0_12px_40px_#00000022]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--lab-border-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--lab-ink)]">
          <span className="size-1.5 rounded-full bg-[var(--lab-warn)]" />
          {isAsk ? "需要你选择" : "需要确认"}
          <span className="ml-auto font-[var(--lab-mono)] text-[11px] tabular-nums text-[var(--lab-ink-3)]">
            {secs}s
          </span>
        </div>

        <div className="h-0.5 w-full bg-[var(--lab-inset)]">
          <div
            className="h-full bg-[var(--lab-warn)] transition-[width] duration-200 ease-linear"
            style={{ width: `${frac * 100}%` }}
          />
        </div>

        {isAsk && current ? (
          <div className="space-y-3 px-3.5 py-3.5">
            {current.header ? (
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--lab-ink-3)]">
                {current.header}
                {questions && questions.length > 1 ? ` · ${qIndex + 1}/${questions.length}` : ""}
              </div>
            ) : null}
            <div className="text-[14.5px] font-medium leading-6 text-[var(--lab-ink)]">{current.question}</div>
            <div className="flex flex-col gap-1.5">
              {current.options.map((opt) => {
                const selected = current.multiSelect
                  ? (answers[current.question] || "").split(", ").includes(opt.label)
                  : answers[current.question] === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => pickOption(opt.label)}
                    className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-[var(--lab-ink)] bg-[var(--lab-hover)]"
                        : "border-[var(--lab-border-soft)] hover:bg-[var(--lab-hover)]"
                    }`}
                  >
                    <span className="block text-[13.5px] font-medium text-[var(--lab-ink)]">{opt.label}</span>
                    {opt.description ? (
                      <span className="mt-0.5 block text-[12px] text-[var(--lab-ink-3)]">{opt.description}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {current.multiSelect ? (
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onAction({ type: "deny" })}
                  className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-2)]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!allAnswered && qIndex >= (questions?.length ?? 1) - 1}
                  onClick={() => {
                    if (questions && qIndex < questions.length - 1) {
                      setQIndex((i) => i + 1);
                      return;
                    }
                    if (allAnswered) onAction({ type: "answer", answers });
                  }}
                  className="rounded-lg bg-[var(--lab-ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--lab-bg)] disabled:opacity-40"
                >
                  {questions && qIndex < questions.length - 1 ? "下一题" : "确认"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAction({ type: "deny" })}
                className="text-[12px] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
              >
                取消
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-1.5 px-3.5 pt-3">
              <div className="text-[14.5px] font-medium leading-6 text-[var(--lab-ink)]">
                {permission.toolName}
              </div>
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-[var(--lab-mono)] text-[12px] leading-5 text-[var(--lab-ink-3)]">
                {[
                  permission.description,
                  permission.file ? `文件：${permission.file}` : "",
                  permission.inputPreview ? permission.inputPreview : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              </pre>
              <p className="text-[11.5px] text-[var(--lab-ink-3)]">
                工作区内的读写默认已自动放行；仅高风险操作会问你。
              </p>
            </div>
            <div className="flex justify-end gap-2 px-3.5 py-3.5">
              <button
                type="button"
                onClick={() => onAction({ type: "deny" })}
                className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-2)] hover:bg-[#ee5c6122] hover:text-[var(--lab-red)]"
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={() => onAction({ type: "trust_workspace" })}
                className="rounded-lg bg-[var(--lab-ink)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--lab-bg)]"
              >
                允许并信任本工作区
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
