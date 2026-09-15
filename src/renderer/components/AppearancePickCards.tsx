import {
  APPEARANCE_PACKS,
  type AppearancePackId,
  type AppearanceState,
} from "../lib/appearance";

type Props = {
  appearance: AppearanceState;
  onChange: (next: AppearanceState) => void;
};

/** Default pack — solid Lab day / night */
const DEFAULT_DAY = {
  background: "#ffffff",
} as const;

const DEFAULT_NIGHT = {
  background: "#0a0a0a",
} as const;

/** 璃 day — soft fluid-ish pink bloom on paper */
const GLASS_DAY = {
  background: `
    radial-gradient(ellipse 55% 50% at 42% 48%, rgba(255, 70, 160, 0.42), transparent 62%),
    radial-gradient(ellipse 40% 45% at 68% 38%, rgba(255, 120, 190, 0.22), transparent 55%),
    linear-gradient(165deg, #f8f6f2 0%, #efeae3 100%)
  `,
} as const;

/** 璃 night — cold skull glow on black */
const GLASS_NIGHT = {
  background: `
    radial-gradient(ellipse 48% 52% at 48% 52%, rgba(140, 190, 220, 0.28), transparent 58%),
    radial-gradient(ellipse 30% 28% at 52% 42%, rgba(200, 220, 235, 0.18), transparent 50%),
    radial-gradient(ellipse 80% 70% at 50% 60%, #0c1218, #030406 75%)
  `,
} as const;

/**
 * Empty-hero / settings: pick appearance pack only.
 * Day/night stays on the sidebar toggle.
 */
export default function AppearancePickCards({ appearance, onChange }: Props) {
  const pick = (pack: AppearancePackId) => {
    onChange({ ...appearance, pack });
  };

  return (
    <div className="mb-5 grid w-full max-w-[640px] grid-cols-1 gap-2 sm:grid-cols-2">
      {APPEARANCE_PACKS.map((pack) => {
        const selected = appearance.pack === pack.id;
        const isGlass = pack.id === "skin";
        return (
          <button
            key={pack.id}
            type="button"
            onClick={() => pick(pack.id)}
            className={`lab-pick-card rounded-[14px] border px-3.5 py-3 text-left transition-colors ${
              selected
                ? "border-[var(--lab-ink)]/35 bg-[var(--lab-surface-solid)] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                : "border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)]/60 hover:bg-[var(--lab-hover)]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="block text-[13px] font-semibold text-[var(--lab-ink)]">
                  {pack.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--lab-ink-3)]">
                  {pack.desc}
                </span>
              </div>
              {selected ? (
                <span className="shrink-0 rounded-full bg-[var(--lab-ink)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--lab-ink-2)]">
                  使用中
                </span>
              ) : null}
            </div>

            <div
              className="mt-3 grid h-[80px] grid-cols-2 overflow-hidden rounded-[10px] border border-[var(--lab-border-soft)]"
              aria-hidden
            >
              <div className="relative" style={isGlass ? GLASS_DAY : DEFAULT_DAY}>
                {!isGlass ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-[0.04em] text-black/25">
                    Lab
                  </span>
                ) : null}
              </div>
              <div className="relative" style={isGlass ? GLASS_NIGHT : DEFAULT_NIGHT}>
                {!isGlass ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-[0.04em] text-white/25">
                    Lab
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
