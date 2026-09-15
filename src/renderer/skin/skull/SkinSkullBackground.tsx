/**
 * 璃 / Glass · night — fluid X-ray skull.
 * Adapted from https://github.com/cullenwebber/three-skull (MIT)
 */

import { useEffect, useRef, useState } from "react";
import Three from "./core/Three";

type Props = {
  active?: boolean;
  onReady?: () => void;
};

export default function SkinSkullBackground({ active = true, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<InstanceType<typeof Three> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let three: InstanceType<typeof Three> | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        three = new Three(host);
        threeRef.current = three;
        await three.run();
        if (cancelled) {
          three.dispose();
          threeRef.current = null;
          return;
        }
        await three.scene?.ready;
        if (cancelled) {
          three.dispose();
          threeRef.current = null;
          return;
        }
        three.setActive(active);
        ro = new ResizeObserver(() => {
          window.dispatchEvent(new Event("resize"));
        });
        ro.observe(host);
        onReady?.();
      } catch (err) {
        console.error("[skin/skull]", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "WebGPU unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      three?.dispose();
      threeRef.current = null;
    };
    // mount once for warm keep-alive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    threeRef.current?.setActive(active);
  }, [active]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      {error ? (
        <div className="flex h-full items-center justify-center bg-[#0a0a0c] px-6 text-center text-[12px] text-white/45">
          璃 · 黑夜需要 WebGPU（{error}）
        </div>
      ) : null}
    </div>
  );
}
