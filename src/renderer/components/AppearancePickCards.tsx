import {
  APPEARANCE_PACKS,
  type AppearancePackId,
  type AppearanceState,
} from "../lib/appearance";

type Props = {
  appearance: AppearanceState;
  onChange: (next: AppearanceState) => void;
};

const DEFAULT_PREVIEW = {
  background: "linear-gradient(145deg, #fbfbfa 0%, #e9e9e7 100%)",
} as const;

const GLASS_PREVIEW = {
  background: `
    radial-gradient(ellipse 54% 100% at 18% 20%, rgba(255, 168, 211, 0.52), transparent 62%),
    radial-gradient(ellipse 70% 90% at 86% 76%, rgba(158, 205, 235, 0.38), transparent 64%),
    linear-gradient(145deg, #f8f5f0 0%, #e9e6e2 100%)
  `,
} as const;

function MiniShellPreview({ glass }: { glass: boolean }) {
  return (
    <div
      className={`lab-appearance-preview relative h-[76px] overflow-hidden rounded-[10px] border ${
        glass ? "lab-appearance-preview--glass" : "lab-appearance-preview--default"
      }`}
      style={glass ? GLASS_PREVIEW : DEFAULT_PREVIEW}
      aria-hidden
    >
      <div className="absolute inset-y-0 left-0 w-[27%] border-r border-black/10 bg-white/35" />
      <div className="absolute left-[9%] top-[17%] flex gap-1">
        <span className="size-1.5 rounded-full bg-black/20" />
        <span className="size-1.5 rounded-full bg-black/10" />
      </div>
      <div className="absolute left-[37%] right-[8%] top-[18%] h-1.5 rounded-full bg-black/10" />
      <div className="absolute left-[37%] right-[20%] top-[31%] h-1 rounded-full bg-black/10 opacity-70" />
      <div className="absolute bottom-[16%] left-[37%] right-[9%] h-[17px] rounded-[7px] border border-black/10 bg-white/50 shadow-[0_3px_10px_rgba(0,0,0,0.08)]" />
      {glass ? <div className="absolute inset-0 rounded-[10px] bg-white/12 ring-1 ring-inset ring-white/65" /> : null}
    </div>
  );
}

/**
 * Empty-hero / settings: pick appearance pack only.
 * Day/night stays on the sidebar toggle.
 */
export default function AppearancePickCards({ appearance, onChange }: Props) {
  const pick = (pack: AppearancePackId) => {
    onChange({ ...appearance, pack });
  };

  return (
    <div
      className="lab-appearance-picker mb-5 grid w-full max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-2"
      role="radiogroup"
      aria-label="选择外观材质"
    >
      {APPEARANCE_PACKS.map((pack) => {
        const selected = appearance.pack === pack.id;
        const isGlass = pack.id === "skin";
        return (
          <button
            key={pack.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => pick(pack.id)}
            className={`lab-pick-card group rounded-[15px] border p-2 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ${
              selected
                ? "lab-pick-card--selected border-[var(--lab-accent)]/55 bg-[var(--lab-surface-solid)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                : "border-[var(--lab-border-soft)] bg-[var(--lab-surface-solid)]/50 hover:-translate-y-px hover:border-[var(--lab-border)] hover:bg-[var(--lab-hover)]"
            }`}
          >
            <div className="flex items-center gap-2 px-1 py-1">
              <span
                className={`size-2.5 shrink-0 rounded-full border border-white/60 shadow-[0_1px_4px_rgba(0,0,0,0.18)] ${
                  isGlass
                    ? "bg-[linear-gradient(135deg,#f6a7d1,#99cbe7)]"
                    : "bg-[linear-gradient(135deg,#f8f8f7,#252525)]"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[var(--lab-ink)]">
                  {pack.title}
                </span>
                <span className="block truncate text-[10.5px] text-[var(--lab-ink-3)]">
                  {isGlass ? "磨砂玻璃 · 流体氛围" : "哑光实色 · 清晰高效"}
                </span>
              </span>
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition-opacity ${
                  selected
                    ? "border-[var(--lab-accent)]/60 bg-[var(--lab-accent-soft)] text-[var(--lab-accent)] opacity-100"
                    : "border-[var(--lab-border-soft)] text-transparent opacity-0 group-hover:opacity-60"
                }`}
                aria-hidden
              >
                ✓
              </span>
            </div>
            <MiniShellPreview glass={isGlass} />
          </button>
        );
      })}
    </div>
  );
}
