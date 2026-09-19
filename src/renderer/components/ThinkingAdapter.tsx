import { useEffect, useState, type ReactNode } from "react";
import Thinking, { type ThinkingRow } from "../harness/beautiful-ui/Thinking";

interface Props {
  label?: string;
  doneLabel?: string;
  variant?: "Steps" | "Reasoning" | "Search" | "Coding";
  rows?: ThinkingRow[];
  /** Drive shimmer/checks from real agent progress */
  controlled?: boolean;
  working?: boolean;
  onSettled?: () => void;
  footer?: ReactNode;
  onFileOpen?: (file: string) => void;
  className?: string;
}

/**
 * Adapter: Beautiful UI Thinking → Lab Agent.
 * With `controlled` + `rows`, no demo STAGES / pistachio defaults.
 * Working → expanded; settled → collapsed (user can reopen).
 */
export default function ThinkingAdapter({
  label,
  doneLabel,
  variant = "Coding",
  rows,
  controlled = false,
  working,
  onSettled,
  footer,
  onFileOpen,
  className,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-8 animate-pulse rounded bg-[var(--lab-surface)]" />;

  return (
    <div className="beautiful-ui-thinking">
      <Thinking
        variant={variant}
        rows={rows}
        active={label}
        done={doneLabel ?? (label ? `${label} — done` : undefined)}
        controlled={controlled}
        working={working}
        onSettled={onSettled}
        footer={footer}
        onFileOpen={onFileOpen}
        className={className}
      />
    </div>
  );
}
