/**
 * 璃 / Glass atmosphere: keep day + night warm, crossfade on mode switch.
 */

import { lazy, Suspense, useCallback, useEffect, useState, type RefObject } from "react";
import SkinErrorBoundary from "./SkinErrorBoundary";

const SkinFluidTextBackground = lazy(() => import("./fluid/SkinFluidTextBackground"));
const SkinSkullBackground = lazy(() => import("./skull/SkinSkullBackground"));

const BASE = import.meta.env.BASE_URL || "./";

type Props = {
  mode: "light" | "dark";
  mainRef: RefObject<HTMLElement | null>;
  /** Changes when chrome layout shifts so fluid text recenters */
  layoutKey?: string;
};

function preloadSkullAssets() {
  void import("./skull/SkinSkullBackground");
  void import("./fluid/SkinFluidTextBackground");
  for (const name of ["man_comp-transformed.glb", "skeleton_comp-transformed.glb"]) {
    void fetch(`${BASE}skin/skull/${name}`).catch(() => {});
  }
}

export default function SkinAtmosphere({ mode, mainRef, layoutKey = "" }: Props) {
  const [skullReady, setSkullReady] = useState(false);
  const [chunkReady, setChunkReady] = useState(false);

  useEffect(() => {
    preloadSkullAssets();
    let cancelled = false;
    Promise.all([
      import("./skull/SkinSkullBackground"),
      import("./fluid/SkinFluidTextBackground"),
    ]).then(() => {
      if (!cancelled) setChunkReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getMainRect = useCallback(() => mainRef.current?.getBoundingClientRect() ?? null, [mainRef]);

  const wantNight = mode === "dark";
  const showDay = !wantNight || !skullReady;
  const showNight = wantNight && skullReady;

  if (!chunkReady) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: wantNight ? "#000" : "#f3f1ec" }}
        aria-hidden
      />
    );
  }

  return (
    <SkinErrorBoundary mode={mode}>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            opacity: showDay ? 1 : 0,
            zIndex: showDay ? 1 : 0,
          }}
        >
          <Suspense fallback={null}>
            <SkinFluidTextBackground
              active={mode === "light"}
              getMainRect={getMainRect}
              layoutKey={layoutKey}
            />
          </Suspense>
        </div>
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            opacity: showNight ? 1 : 0,
            zIndex: showNight ? 2 : 0,
          }}
        >
          <Suspense fallback={null}>
            <SkinSkullBackground active={mode === "dark"} onReady={() => setSkullReady(true)} />
          </Suspense>
        </div>
      </div>
    </SkinErrorBoundary>
  );
}
