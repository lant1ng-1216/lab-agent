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
};

/** Inline approval / follow-up card that keeps the conversation scrollable. */
export default function PermissionModal({ permission, onAction }: Props) {
  const questions = permission.questions;
  const isAsk = Boolean(questions?.length);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [qIndex, setQIndex] = useState(0);

  useEffect(() => {
    setSelected({});
    setFreeText({});
    setQIndex(0);
  }, [permission.requestId]);

  const current = questions?.[qIndex];
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
      className="w-full max-w-[760px] rounded-[14px] border border-[var(--lab-warn-border)] bg-[var(--lab-surface-solid)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--lab-border-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--lab-ink)]">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--lab-warn)]" />
        <span className="font-medium">{isAsk ? "需要你回答" : "需要你审批"}</span>
        <span className="ml-auto text-[11.5px] text-[var(--lab-ink-3)]">等待你的决定 · 不会自动超时</span>
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
            {current.options.map((option) => {
              const active = (selected[current.question] ?? []).includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickOption(option.label)}
                  className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-[var(--lab-ink)] bg-[var(--lab-hover)]"
                      : "border-[var(--lab-border-soft)] hover:bg-[var(--lab-hover)]"
                  }`}
                >
                  <span className="block text-[13.5px] font-medium text-[var(--lab-ink)]">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-[12px] text-[var(--lab-ink-3)]">{option.description}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <label className="block text-[12px] font-medium text-[var(--lab-ink-2)]">
            其他 / 自行输入
            <textarea
              value={freeText[current.question] ?? ""}
              onChange={(event) =>
                setFreeText((previous) => ({ ...previous, [current.question]: event.target.value }))
              }
              rows={2}
              maxLength={4000}
              placeholder="也可以不选上面的选项，直接写下你的回答…"
              className="mt-1.5 block w-full resize-y rounded-[9px] border border-[var(--lab-border-soft)] bg-[var(--lab-inset)] px-3 py-2 text-[13px] leading-5 text-[var(--lab-ink)] outline-none placeholder:text-[var(--lab-ink-3)] focus:border-[var(--lab-border)]"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onAction({ type: "cancel" })}
              className="rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            >
              取消任务
            </button>
            <div className="flex items-center gap-2">
              {qIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => setQIndex((index) => Math.max(0, index - 1))}
                  className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)]"
                >
                  上一题
                </button>
              ) : null}
              <button
                type="button"
                disabled={!canContinue}
                onClick={continueQuestion}
                className="rounded-lg bg-[var(--lab-ink)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--lab-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {questions && qIndex < questions.length - 1 ? "下一题" : "提交回答并继续"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 px-3.5 pt-3">
            <div className="text-[14.5px] font-medium leading-6 text-[var(--lab-ink)]">{permission.toolName}</div>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-[var(--lab-mono)] text-[12px] leading-5 text-[var(--lab-ink-3)]">
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
          <div className="flex flex-wrap justify-end gap-2 px-3.5 py-3.5">
            <button
              type="button"
              onClick={() => onAction({ type: "cancel" })}
              className="mr-auto rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
            >
              取消任务
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "deny" })}
              className="rounded-lg border border-[var(--lab-border)] px-3 py-1.5 text-[12.5px] text-[var(--lab-ink-2)] hover:bg-[#ee5c6122] hover:text-[var(--lab-red)]"
            >
              仅拒绝此操作
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
    </section>
  );
}
