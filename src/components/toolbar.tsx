"use client";

export type ToolId = "select" | "sticky_note" | "rectangle" | "circle" | "text" | "connector";

interface ToolbarProps {
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
}

/* Tiny inline SVGs – 16×16, strokeWidth 1.5 */
function IconSelect() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2l4 12 2-5 5-2L3 2z" />
    </svg>
  );
}
function IconStickyNote() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4z" />
      <path d="M10 1v4h4" />
    </svg>
  );
}
function IconRectangle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  );
}
function IconCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h8" />
      <path d="M8 3v10" />
      <path d="M6 13h4" />
    </svg>
  );
}
function IconConnector() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h8" />
      <path d="M8 5l3 3-3 3" />
    </svg>
  );
}

const tools: { id: ToolId; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "select", label: "Select", Icon: IconSelect },
  { id: "sticky_note", label: "Sticky Note", Icon: IconStickyNote },
  { id: "rectangle", label: "Rectangle", Icon: IconRectangle },
  { id: "circle", label: "Circle", Icon: IconCircle },
  { id: "text", label: "Text", Icon: IconText },
  { id: "connector", label: "Arrow", Icon: IconConnector },
];

export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20 flex gap-0.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/60 dark:border-gray-700/60 px-2 py-1.5">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => onToolChange(t.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 ${
            tool === t.id
              ? "bg-blue-500 text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
          title={t.label}
        >
          <t.Icon />
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
