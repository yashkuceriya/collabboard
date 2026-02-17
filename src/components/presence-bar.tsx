"use client";

import type { Peer } from "@/hooks/use-presence";
import type { User } from "@supabase/supabase-js";

const COLORS = [
  "#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316",
];

interface PresenceBarProps {
  peers: Peer[];
  user: User | null;
}

export function PresenceBar({ peers, user }: PresenceBarProps) {
  const onlineCount = peers.length + (user ? 1 : 0);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center -space-x-1.5">
        {/* Current user */}
        {user && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold border-2 border-white dark:border-gray-900 ring-1 ring-gray-200/50 dark:ring-gray-700/50"
            style={{ backgroundColor: "#6366F1" }}
            title={`${user.email} (you)`}
          >
            {user.email?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        {/* Peers */}
        {peers.map((peer, i) => (
          <div
            key={peer.user_id}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold border-2 border-white dark:border-gray-900 ring-1 ring-gray-200/50 dark:ring-gray-700/50"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
            title={peer.user_email || "User"}
          >
            {peer.user_email?.[0]?.toUpperCase() || "?"}
          </div>
        ))}
      </div>
      <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium tabular-nums">{onlineCount}</span>
    </div>
  );
}
