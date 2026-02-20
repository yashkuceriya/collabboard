"use client";

export type ToolId = "select" | "sticky_note" | "rectangle" | "circle" | "line" | "text" | "connector" | "pen" | "eraser";

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
function IconLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13L13 3" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14l3-1L13.5 4.5a1.4 1.4 0 00-2-2L3 11l-1 3z" />
    </svg>
  );
}
function IconEraser() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14h8" />
      <path d="M3.5 10.5L10 4l3 3-6.5 6.5a1 1 0 01-.7.3H4.5a1 1 0 01-.7-.3L2.3 12a1 1 0 010-1.4l1.2-1z" />
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

const tools: { id: ToolId; label: string; shortcut: string; tooltip: string; Icon: () => React.JSX.Element }[] = [
  { id: "select", label: "Select", shortcut: "V", tooltip: "Select and pan (drag empty space)", Icon: IconSelect },
  { id: "sticky_note", label: "Sticky Note", shortcut: "N", tooltip: "Add a sticky note", Icon: IconStickyNote },
  { id: "rectangle", label: "Rectangle", shortcut: "R", tooltip: "Draw a rectangle", Icon: IconRectangle },
  { id: "circle", label: "Circle", shortcut: "O", tooltip: "Draw a circle", Icon: IconCircle },
  { id: "line", label: "Line", shortcut: "L", tooltip: "Draw a line", Icon: IconLine },
  { id: "text", label: "Text", shortcut: "T", tooltip: "Add text", Icon: IconText },
  { id: "connector", label: "Connect", shortcut: "A", tooltip: "Click two shapes to connect them with an arrow", Icon: IconConnector },
  { id: "pen", label: "Draw", shortcut: "P", tooltip: "Freehand draw", Icon: IconPen },
  { id: "eraser", label: "Eraser", shortcut: "E", tooltip: "Click an element to delete it", Icon: IconEraser },
];

export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20 flex gap-0.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 px-2 py-1.5">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => onToolChange(t.id)}
          className={`group flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 relative focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
            tool === t.id
              ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm shadow-blue-500/25"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
          title={`${t.tooltip} [${t.shortcut}]`}
        >
          <t.Icon />
          <span className="hidden sm:inline">{t.label}</span>
          <kbd className={`hidden sm:inline text-[10px] ml-0.5 px-1 py-0.5 rounded font-mono ${
            tool === t.id
              ? "bg-white/20 text-white/80"
              : "bg-gray-200/80 dark:bg-gray-700/80 text-gray-400 dark:text-gray-500"
          }`}>{t.shortcut}</kbd>
        </button>
      ))}
    </div>
  );
}
