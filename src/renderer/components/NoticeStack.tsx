import { CheckCircle, FolderSimple, Info, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ENGINE_BRANDS } from "./EngineBrandMarks";

export type NoticeIcon = "check" | "warning" | "info" | "folder";

export interface NoticeItem {
  id: string;
  title: string;
  /** Optional; omit or empty → title-only card */
  body?: string;
  /** Key into ENGINE_BRANDS (claude / openai / cursor / opencode / lab-coding) */
  brand?: string;
  /** Phosphor glyph when no brand — short tips (e.g. 新对话 + check) */
  icon?: NoticeIcon;
}

interface Props {
  items: NoticeItem[];
  onDismiss: (id: string) => void;
}

function Glyph({ kind }: { kind: NoticeIcon }) {
  const props = { size: 20, weight: "duotone" as const, "aria-hidden": true };
  if (kind === "check") return <CheckCircle {...props} className="text-[var(--lab-green)]" />;
  if (kind === "warning") return <WarningCircle {...props} className="text-[var(--lab-warn)]" />;
  if (kind === "folder") return <FolderSimple {...props} className="text-[var(--lab-ink-2)]" />;
  return <Info {...props} className="text-[var(--lab-ink-2)]" />;
}

function Leading({ item, compact }: { item: NoticeItem; compact: boolean }) {
  let inner: ReactNode;
  if (item.brand && ENGINE_BRANDS[item.brand]) {
    inner = (
      <span className="flex size-5 items-center justify-center [&>img]:size-5 [&>svg]:size-5">
        {ENGINE_BRANDS[item.brand]}
      </span>
    );
  } else if (item.icon) {
    inner = <Glyph kind={item.icon} />;
  } else {
    inner = <Info size={20} weight="duotone" aria-hidden className="text-[var(--lab-ink-3)]" />;
  }
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--lab-hover)] text-[var(--lab-ink)] ${
        compact ? "" : "mt-0.5"
      }`}
    >
      {inner}
    </span>
  );
}

export default function NoticeStack({ items, onDismiss }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="titlebar-no-drag pointer-events-none absolute right-4 top-4 z-50 flex w-[320px] flex-col gap-2">
      <style>{`
        @keyframes lab-notice-in {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {items.map((n) => {
        const body = n.body?.trim() ?? "";
        const compact = !body;
        return (
          <div
            key={n.id}
            className={`pointer-events-auto flex gap-3 rounded-[12px] border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
              compact ? "items-center" : "items-start"
            }`}
            style={{ animation: "lab-notice-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
            role="status"
          >
            <Leading item={n} compact={compact} />
            <div className={`min-w-0 flex-1 ${compact ? "" : "pt-0.5"}`}>
              <div className="truncate text-[13px] font-semibold text-[var(--lab-ink)]">{n.title}</div>
              {body ? (
                <div className="mt-0.5 text-[12px] leading-snug text-[var(--lab-ink-2)]">{body}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] text-[var(--lab-ink-3)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
              onClick={() => onDismiss(n.id)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
