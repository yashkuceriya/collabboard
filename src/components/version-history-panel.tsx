"use client";

import { useEffect, useState, useCallback } from "react";

type SnapshotRow = { id: string; created_at: string; user_id: string | null };

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByTime(snapshots: SnapshotRow[]): { label: string; items: SnapshotRow[] }[] {
  const groups: { label: string; items: SnapshotRow[] }[] = [];
  let currentLabel = "";
  let currentItems: SnapshotRow[] = [];
  for (const s of snapshots) {
    const label = formatRelativeTime(s.created_at);
    if (label !== currentLabel) {
      if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });
      currentLabel = label;
      currentItems = [s];
    } else {
      currentItems.push(s);
    }
  }
  if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });
  return groups;
}

interface VersionHistoryPanelProps {
  boardId: string;
  accessToken: string | null;
  onClose: () => void;
  onRestore: () => void;
}

export function VersionHistoryPanel({ boardId, accessToken, onClose, onRestore }: VersionHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/snapshot`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const { snapshots: data } = (await res.json()) as { snapshots: SnapshotRow[] };
        setSnapshots(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = useCallback(
    async (snapshotId: string) => {
      if (!accessToken || restoringId) return;
      if (typeof window !== "undefined" && !window.confirm("Restore will replace current board for everyone. Continue?")) return;
      setRestoringId(snapshotId);
      try {
        const res = await fetch(`/api/boards/${boardId}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ snapshotId }),
        });
        if (res.ok) {
          onRestore();
          onClose();
        } else {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          alert(err.error ?? "Restore failed");
        }
      } finally {
        setRestoringId(null);
      }
    },
    [boardId, accessToken, onRestore, onClose, restoringId]
  );

  const groups = groupByTime(snapshots);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[320px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-l border-gray-200/50 dark:border-gray-800/50 shadow-xl flex flex-col z-30">
      <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Version History</h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            All users&apos; changes. Restore syncs to the board for everyone.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No version history yet. Edits will create snapshots.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                  {g.label} · {g.items.length} {g.items.length === 1 ? "change" : "changes"}
                </p>
                <ul className="space-y-1">
                  {g.items.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                        Snapshot at {new Date(s.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestore(s.id)}
                        disabled={restoringId !== null}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 shrink-0"
                      >
                        {restoringId === s.id ? "Restoring..." : "< Restore"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
