"use client";

import { useTheme } from "@/components/theme-provider";

function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 3.4l1-1" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8.5a5.5 5.5 0 11-6-6 4 4 0 006 6z" />
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M5.5 14h5M8 11v3" />
    </svg>
  );
}

const options = [
  { value: "light" as const, Icon: IconSun, label: "Light" },
  { value: "dark" as const, Icon: IconMoon, label: "Dark" },
  { value: "system" as const, Icon: IconMonitor, label: "System" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-gray-100 dark:bg-gray-800 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={`p-1.5 rounded-md transition-all duration-150 ${
            theme === opt.value
              ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
              : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          }`}
          title={opt.label}
        >
          <opt.Icon />
        </button>
      ))}
    </div>
  );
}
