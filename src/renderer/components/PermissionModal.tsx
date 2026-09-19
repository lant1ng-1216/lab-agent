import { useEffect, useState } from "react";
import type { AgentPermissionPrompt } from "@shared/protocol";

export type PermissionAction =
  | { type: "deny" }
  | { type: "cancel" }
  | { type: "trust_workspace" }
  | { type: "answer"; answers: Record<string, string> };

type Props = {
  permission: AgentPermissionPrompt;
  onAction: (action: PermissionAction) => void;
  onCollapse?: () => void;
};

type StatusChipProps = {
  permission: AgentPermissionPrompt;
  onClick: () => void;
};

/** Compact pending-state control shown beside the workspace picker. */
export function PermissionStatusChip({ permission, onClick }: StatusChipProps) {
  const isAsk = Boolean(permission.questions?.length);
  const questionCount = permission.questions?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border border-[var(--lab-warn-border)] bg-[var(--lab-surface-solid)] px-2 py-1 text-left text-[11px] text-[var(--lab-ink-2)] shadow-sm transition-colors hover:bg-[var(--lab-hover)]"
      aria-label={isAsk ? "展开待回答问题" : "展开待审批操作"}
      title={isAsk ? "展开待回答问题" : "展开待审批操作"}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--lab-warn)]" />
      <span className="min-w-0 truncate">
        {isAsk ? `需要回答${questionCount > 1 ? ` · ${questionCount}题` : ""}` : "需要审批"}
      </span>
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/** Inline approval / follow-up card that keeps the conversation scrollable. */
export default function PermissionModal({ permission, onAction, onCollapse }: Props) {
  const questions = permission.questions;
  const isAsk = Boolean(questions?.length);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [qIndex, setQIndex] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    setSelected({});
    setFreeText({});
    setQIndex(0);
    setCustomOpen(false);
  }, [permission.requestId]);

  const current = questions?.[qIndex];
  const showCustomInput = Boolean(
    current && (customOpen || freeText[current.question]?.trim()),
  );
  const answerFor = (question: string) => {
    const choices = selected[question] ?? [];
    const custom = freeText[question]?.trim() ?? "";
    return [choices.length ? choices.join(", ") : "", custom].filter(Boolean).join("\n");
  };
  const canContinue = Boolean(current && answerFor(current.question).trim());

  const pickOption = (label: string) => {
    if (!current) return;
    setSelected((previous) => {
      const choices = previous[current.question] ?? [];
      const next = current.multiSelect
        ? choices.includes(label)
          ? choices.filter((choice) => choice !== label)
          : [...choices, label]
        : [label];
      return { ...previous, [current.question]: next };
    });
  };

  const continueQuestion = () => {
    if (!questions || !current || !canContinue) return;
    if (qIndex < questions.length - 1) {
      setQIndex((index) => index + 1);
      setCustomOpen(false);
      return;
    }
    const answers = Object.fromEntries(
      questions.map((question) => [question.question, answerFor(question.question)]),
    );
    onAction({ type: "answer", answers });
  };

  return (
    <section
      aria-label={isAsk ? "需要你回答" : "需要你审批"}
      className="flex min-w-0 max-h-[min(48vh,420px)] w-full max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--lab-warn-border)] bg-[var(--lab-surface-solid)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--lab-border-soft)] px-4 py-2 text-[12px] text-[var(--lab-ink)]">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--lab-warn)]" />
        <span className="font-medium">{isAsk ? "需要你回答" : "需要你审批"}</span>
        <span className="ml-auto text-[11px] text-[var(--lab-ink-3)]">等待你的决定 · 不会自动超时</span>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--lab-ink-3)] transition-colors hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            aria-label={isAsk ? "收起回答面板" : "收起审批面板"}
            title="收起"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9h12M6 15h12" />
            </svg>
          </button>
        ) : null}
      </div>

      {isAsk && current ? (
        <>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2.5">
            {current.header || (questions && questions.length > 1) ? (
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--lab-ink-3)]">
                <span className="min-w-0 truncate">{current.header}</span>
                {questions && questions.length > 1 ? (
                  <span className="ml-auto shrink-0 tabular-nums">{qIndex + 1}/{questions.length}</span>
                ) : null}
              </div>
            ) : null}
            <div className="text-[13px] font-medium leading-[1.35] text-[var(--lab-ink)]">{current.question}</div>
            <div className="space-y-1 pr-1">
              {current.options.map((option) => {
                const active = (selected[current.question] ?? []).includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickOption(option.label)}
                    className={`w-full rounded-[9px] border px-2.5 py-1 text-left transition-colors ${
                      active
                        ? "border-[var(--lab-ink)] bg-[var(--lab-hover)]"
                        : "border-[var(--lab-border-soft)] hover:bg-[var(--lab-hover)]"
                    }`}
                  >
                    <span className="block text-[12px] font-medium leading-4 text-[var(--lab-ink)]">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block line-clamp-1 text-[10.5px] leading-[1.35] text-[var(--lab-ink-3)]">
                        {option.description}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div>
              <button
                type="button"
                aria-expanded={showCustomInput}
                onClick={() => setCustomOpen((open) => !open)}
                className="rounded-md py-0.5 text-[11px] text-[var(--lab-ink-3)] hover:text-[var(--lab-ink)]"
              >
                {showCustomInput ? "收起自行输入" : "其他 / 自行输入"}
              </button>
              {showCustomInput ? (
                <textarea
                  aria-label="其他 / 自行输入"
                  value={freeText[current.question] ?? ""}
                  onChange={(event) =>
                    setFreeText((previous) => ({ ...previous, [current.question]: event.target.value }))
                  }
                  rows={1}
                  maxLength={4000}
                  placeholder="写下你自己的回答…"
                  className="mt-1 block max-h-20 w-full resize-y rounded-[8px] border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-2.5 py-1.5 text-[11.5px] leading-4 text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] focus:border-[var(--lab-border)]"
                />
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--lab-border-soft)] px-4 py-2">
            <button
              type="button"
              onClick={() => onAction({ type: "cancel" })}
              className="rounded-lg px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            >
              取消任务
            </button>
            <div className="flex items-center gap-2">
              {qIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQIndex((index) => Math.max(0, index - 1));
                    setCustomOpen(false);
                  }}
                  className="rounded-lg border border-[var(--lab-border)] px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                >
                  上一题
                </button>
              ) : null}
              <button
                type="button"
                disabled={!canContinue}
                onClick={continueQuestion}
                className="rounded-lg bg-[var(--lab-ink)] px-3 py-1 text-[11.5px] font-medium text-[var(--lab-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {questions && qIndex < questions.length - 1 ? "下一题" : "提交回答并继续"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pt-2.5">
            <div className="text-[13.5px] font-medium leading-5 text-[var(--lab-ink)]">{permission.toolName}</div>
            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-[var(--lab-mono)] text-[11px] leading-4 text-[var(--lab-ink-3)]">
              {[
                permission.description,
                permission.file ? `文件：${permission.file}` : "",
                permission.inputPreview || "",
              ]
                .filter(Boolean)
                .join("\n\n")}
            </pre>
            <p className="text-[11.5px] text-[var(--lab-ink-3)]">
              工作区内的读写默认已自动放行；仅高风险操作会请求确认。你可以继续查看上方过程。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--lab-border-soft)] px-4 py-2">
            <button
              type="button"
              onClick={() => onAction({ type: "cancel" })}
              className="mr-auto rounded-lg px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            >
              取消任务
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "deny" })}
              className="rounded-lg border border-[var(--lab-border)] px-2.5 py-1 text-[11.5px] text-[var(--lab-ink-2)] hover:bg-[#ee5c6122] hover:text-[var(--lab-red)]"
            >
              仅拒绝此操作
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "trust_workspace" })}
              className="rounded-lg bg-[var(--lab-ink)] px-3 py-1 text-[11.5px] font-medium text-[var(--lab-bg)]"
            >
              允许并信任本工作区
            </button>
          </div>
        </>
      )}
    </section>
  );
}
