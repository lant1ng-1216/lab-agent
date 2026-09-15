/**
 * 璃 / Glass · daytime — CodePen fluid (no letterforms in the sim).
 * Source: https://codepen.io/ksenia-k/pen/MWMObrY (Ksenia Kondrashova)
 */

import { useEffect, useRef, useState } from "react";
import { startFluidText, type FluidTextHandle } from "./fluidTextEngine";

type Props = {
  active?: boolean;
  /** @deprecated text centering unused — fluid has no letters */
  getMainRect?: () => DOMRect | null;
  layoutKey?: string;
};

export default function SkinFluidTextBackground({ active = true, layoutKey = "" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FluidTextHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let handle: FluidTextHandle | null = null;
    try {
      handle = startFluidText(host);
      handle.setActive(active);
      handleRef.current = handle;
    } catch (err) {
      console.error("[skin/fluid]", err);
      setError(err instanceof Error ? err.message : "WebGL unavailable");
    }

    return () => {
      handle?.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    handleRef.current?.resize();
  }, [layoutKey]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 overflow-hidden bg-white"
      aria-hidden
    >
      {error ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-black/40">
          璃 · 白昼需要 WebGL（{error}）
        </div>
      ) : null}
    </div>
  );
}
