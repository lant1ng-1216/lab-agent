import type { ReactNode } from "react";

export default function SidebarRail({
  brand,
  sections,
}: {
  brand: ReactNode;
  sections: { title: string; body: ReactNode }[];
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--lab-border-soft)] px-3 py-2.5">{brand}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sections.map((s) => (
          <div key={s.title} className="mb-3">
            <div className="mb-1 px-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--lab-ink-3)]">
              {s.title}
            </div>
            {s.body}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidebarItem({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12.5px] ${
        active
          ? "bg-[var(--lab-hover)] text-[var(--lab-ink)]"
          : "text-[var(--lab-ink-2)] hover:bg-[var(--lab-hover)] hover:text-[var(--lab-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
