/**
 * Small inline SVG glyphs used by the app shell (title bar buttons).
 * Moved verbatim out of App.tsx so the shell file stays focused on wiring.
 */

export function SidebarToggleGlyph({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      {collapsed ? <path d="M13 10l2.5 2-2.5 2" /> : <path d="M16 10l-2.5 2 2.5 2" />}
    </svg>
  );
}

export function NewChatGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}
