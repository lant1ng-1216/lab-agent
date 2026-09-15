import { useEffect, useRef, useState } from "react";

type Props = {
  mode: "normal" | "supervisor";
  onToggle: () => void;
};

/** Icon toggle: neutral chrome; brief pulse only on mode change. */
export default function ShellModeToggle({ mode, onToggle }: Props) {
  const isNormal = mode === "normal";
  const [pulse, setPulse] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [mode]);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`titlebar-no-drag lab-mode-toggle flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--lab-border-soft)] text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)] ${
        pulse ? "lab-mode-toggle--pulse text-[var(--lab-accent)]" : ""
      }`}
      title={isNormal ? "切换到监工态（概念预览）" : "切换到常规态（Lab Agent）"}
      aria-label={isNormal ? "当前常规态，点击切到监工态" : "当前监工态，点击切到常规态"}
    >
      {isNormal ? <IconNormal /> : <IconSupervisor />}
    </button>
  );
}

function IconNormal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-3.5 3.2V15H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 8.5h7M8.5 11.5h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSupervisor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="7.5" cy="8" r="3.15" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="16" r="3.15" stroke="currentColor" strokeWidth="2" />
      <path d="M10.2 9.8 13.8 14.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
