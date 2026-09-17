import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  mode: "normal" | "supervisor";
  /** The supervisor workspace is intentionally gated until it is ready. */
  onToggle: () => void;
};

/** Product switcher styled as a compact dropdown, with supervisor kept preview-only. */
export default function ShellModeToggle({ mode, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 52 });
  const isNormal = mode === "normal";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = menuRef.current?.getBoundingClientRect().width ?? 232;
      const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 180;
      const margin = 12;
      const gap = 8;
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin));
      const preferredTop = rect.bottom + gap;
      const top =
        preferredTop + menuHeight <= window.innerHeight - margin
          ? preferredTop
          : rect.top - gap - menuHeight >= margin
            ? rect.top - gap - menuHeight
            : Math.max(margin, window.innerHeight - menuHeight - margin);

      setMenuPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePosition) : null;
    if (rootRef.current) observer?.observe(rootRef.current);
    if (menuRef.current) observer?.observe(menuRef.current);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer?.disconnect();
    };
  }, [open]);

  return (
    <>
      <div ref={rootRef} className="titlebar-no-drag relative min-w-0">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) setMenuPosition({ left: Math.max(12, rect.left), top: rect.bottom + 8 });
            setOpen(true);
          }}
          className={`lab-product-switch flex min-w-0 items-center gap-1.5 rounded-[11px] px-2 py-1.5 text-left transition-colors ${
            open ? "bg-[var(--lab-hover)]" : "hover:bg-[var(--lab-hover)]"
          }`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="选择产品模式"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--lab-ink)]">
              Lab Agent
            </span>
            <span className="block truncate text-[10px] leading-tight text-[var(--lab-ink-3)]">
              {isNormal ? "Lab Coding" : "监工态 · 预览"}
            </span>
          </span>
          <ChevronDown open={open} />
        </button>
      </div>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="titlebar-no-drag fixed z-[1000] w-[232px] rounded-[14px] border border-[var(--lab-border)] bg-[var(--lab-surface-solid)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.2)]"
              style={{ left: menuPosition.left, top: menuPosition.top }}
              role="menu"
              aria-label="产品模式"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-[var(--lab-hover)]"
              >
                <ModeGlyph kind="coding" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-[var(--lab-ink)]">Lab Coding</span>
                  <span className="block text-[10.5px] text-[var(--lab-ink-3)]">对话、构建与调试</span>
                </span>
                {isNormal ? <Check /> : null}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onToggle();
                }}
                className="mt-0.5 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-[var(--lab-hover)]"
              >
                <ModeGlyph kind="supervisor" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-[var(--lab-ink)]">监工版</span>
                  <span className="block text-[10.5px] text-[var(--lab-ink-3)]">双 Agent 工作台 · 即将上线</span>
                </span>
                <span className="shrink-0 rounded-full bg-[var(--lab-warn-soft)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--lab-warn)]">
                  即将上线
                </span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[var(--lab-ink-3)] transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ModeGlyph({ kind }: { kind: "coding" | "supervisor" }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--lab-hover)] text-[var(--lab-ink-2)]">
      {kind === "coding" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="7.5" cy="8" r="3" />
          <circle cx="16.5" cy="16" r="3" />
          <path d="m10 10 4 4" />
        </svg>
      )}
    </span>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lab-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="当前模式">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
