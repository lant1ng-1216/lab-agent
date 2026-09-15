import type { CSSProperties, ReactNode } from "react";

/**
 * Three-column shell — morphology of DeepSeek Harness AppFrame:
 * sidebar | conversation (center) | rightbar track.
 */
export default function AppFrame({
  sidebar,
  conversation,
  rightbar,
  rightbarOpen = false,
  sidebarWidth = 220,
  rightbarWidth = 320,
  header,
}: {
  sidebar?: ReactNode;
  conversation: ReactNode;
  rightbar?: ReactNode;
  rightbarOpen?: boolean;
  sidebarWidth?: number;
  rightbarWidth?: number;
  header?: ReactNode;
}) {
  const cols: CSSProperties = {
    gridTemplateColumns: rightbarOpen
      ? `${sidebarWidth}px minmax(0, 1fr) ${rightbarWidth}px`
      : `${sidebarWidth}px minmax(0, 1fr) 0px`,
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--lab-bg)]">
      {header}
      <div
        className="grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[var(--lab-ease)]"
        style={cols}
      >
        <aside className="min-w-0 overflow-hidden border-r border-[var(--lab-border-soft)] bg-[var(--lab-sidebar)]">
          {sidebar}
        </aside>
        <main className="flex min-w-0 flex-col overflow-hidden">{conversation}</main>
        <aside
          className="relative min-w-0 overflow-hidden border-l border-[var(--lab-border-soft)] bg-[var(--lab-bg-raised)]"
          data-rightbar={rightbarOpen ? "open" : "closed"}
        >
          {rightbarOpen ? rightbar : null}
        </aside>
      </div>
    </div>
  );
}
