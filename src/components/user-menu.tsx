"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { getAvatarDisplay } from "@/lib/display-name";

const DEFAULT_AVATAR_COLOR = "#6366F1";

interface UserMenuProps {
  user: User | null;
  onSignOut: () => void;
  /** Optional: align dropdown to the right of the avatar (default true) */
  alignRight?: boolean;
}

export function UserMenu({ user, onSignOut, alignRight = true }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const avatarColor = (meta.avatar_color as string) ?? DEFAULT_AVATAR_COLOR;
  const avatarDisplay = getAvatarDisplay(user);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0"
          style={{ backgroundColor: avatarColor }}
        >
          {avatarDisplay}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 dark:text-gray-400 shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1.5 py-1 min-w-[140px] rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg z-50 ${alignRight ? "right-0" : "left-0"}`}
        >
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
