/**
 * Word-stream reply — visual language from beautiful-ui/streaming-text.tsx
 * (stream-in keyframes + caret), driven by real agent text.
 */
import { useEffect, useMemo, useState } from "react";

const WORD_MS = 28;

export default function LabStreamingReply({
  text,
  onDone,
}: {
  text: string;
  onDone?: () => void;
}) {
  const tokens = useMemo(
    () => text.split(/(\s+)/).filter((t) => t.length > 0),
    [text],
  );
  const [count, setCount] = useState(0);
  const done = count >= tokens.length;

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    if (done) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [count, done, onDone, tokens.length]);

  return (
    <p className="text-[13px] leading-relaxed text-ink">
      {tokens.slice(0, count).map((token, i) => (
        <span
          key={`${i}-${token}`}
          className="inline [will-change:filter,opacity]"
          style={{ animation: "stream-in 420ms cubic-bezier(0.22,0.61,0.25,1) both" }}
        >
          {token}
        </span>
      ))}
      {!done && (
        <span
          className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink"
          style={{ animation: "fade-in 150ms ease-out both" }}
        />
      )}
    </p>
  );
}
