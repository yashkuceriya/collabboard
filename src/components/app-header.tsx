"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserMenu } from "@/components/user-menu";

const LOGO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 8h6M8 12h8M9 16h6" />
  </svg>
);

export interface AppHeaderProps {
  variant: "dashboard" | "profile";
  user: User | null;
  onSignOut: () => void;
}

export function AppHeader({ variant, user, onSignOut }: AppHeaderProps) {
  const baseClass =
    "bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3.5 flex items-center justify-between sticky top-0 z-10";

  return (
    <header className={baseClass}>
      {variant === "dashboard" ? (
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg -m-1 p-1 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-blue-500/20">
            {LOGO}
          </div>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">CollabBoard</span>
        </Link>
      ) : (
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg -m-1 px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Boards
        </Link>
      )}
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
