"use client";

import { useState, useRef, useEffect } from "react";
import type { Peer } from "@/hooks/use-presence";
import type { User } from "@supabase/supabase-js";
import { getDisplayName, getInitials, getAvatarDisplay } from "@/lib/display-name";

const COLORS = [
  "#EF4444",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

function peerDisplayName(email: string | null | undefined, isYou = false): string {
  if (isYou) return "You";
  return getDisplayName({ email });
}

interface PresenceBarProps {
  peers: Peer[];
  user: User | null;
}

export function PresenceBar({ peers, user }: PresenceBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onlineCount = peers.length + (user ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const onlineList: { id: string; email: string; isYou: boolean; color: string }[] = [];
  if (user) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const avatarColor = (meta?.avatar_color as string) ?? "#6366F1";
    onlineList.push({
      id: user.id,
      email: user.email ?? "",
      isYou: true,
      color: avatarColor,
    });
  }
  peers.forEach((p, i) => {
    onlineList.push({
      id: p.user_id,
      email: p.user_email ?? "",
      isYou: false,
      color: COLORS[i % COLORS.length],
    });
  });

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg pl-1 pr-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${onlineCount} online. Click to see who's here.`}
      >
        <div className="flex items-center -space-x-1.5">
          {onlineList.slice(0, 4).map((u) => (
            <div
              key={u.id}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold border-2 border-white dark:border-gray-900 ring-1 ring-gray-200/50 dark:ring-gray-700/50"
              style={{ backgroundColor: u.color }}
              title={u.isYou ? `${u.email} (you)` : u.email || "User"}
            >
              {u.isYou && user ? getAvatarDisplay(user) : getInitials(peerDisplayName(u.email, u.isYou))}
            </div>
          ))}
          {onlineList.length > 4 && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900">
              +{onlineList.length - 4}
            </div>
          )}
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums">
          {onlineCount} online
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50"
          role="dialog"
          aria-label="Online now"
        >
          <div className="px-3 pb-1.5 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Online now
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {onlineList.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 border-2 border-white dark:border-gray-900 shadow-sm"
                  style={{ backgroundColor: u.color }}
                >
                  {u.isYou && user ? getAvatarDisplay(user) : getInitials(peerDisplayName(u.email, u.isYou))}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 block truncate">
                    {peerDisplayName(u.email, u.isYou)}
                  </span>
                  {u.email && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 block truncate">
                      {u.isYou ? "You're viewing this board" : u.email}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
