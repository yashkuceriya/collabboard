"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

interface ShareBoardModalProps {
  boardId: string;
  boardName: string;
  currentUser: User;
  accessToken: string | null;
  onClose: () => void;
}

type Member = { user_id: string; role: string; email?: string };

export function ShareBoardModal({ boardId, boardName, currentUser, accessToken, onClose }: ShareBoardModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [linkRole, setLinkRole] = useState<"editor" | "viewer">("editor");
  const [shareLinkUrl, setShareLinkUrl] = useState<string | null>(null);
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchMembers() {
      const res = await fetch(`/api/boards/${boardId}/members`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) {
        if (!cancelled) setError("Could not load members");
        return;
      }
      const data = await res.json();
      if (!cancelled) {
        setOwnerId(data.owner_id ?? null);
        setMembers(data.members ?? []);
      }
    }
    fetchMembers().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [boardId, accessToken]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError("");
    setSharing(true);
    const res = await fetch(`/api/boards/${boardId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, role, accessToken }),
    });
    const data = await res.json().catch(() => ({}));
    setSharing(false);
    if (!res.ok) {
      setError(data.error || "Failed to invite");
      return;
    }
    setMembers((prev) => [...prev, { user_id: data.user_id, role }]);
    setEmail("");
  }

  async function handleCreateLink() {
    setLinkError("");
    setShareLinkLoading(true);
    const res = await fetch(`/api/boards/${boardId}/share-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole, accessToken }),
    });
    const data = await res.json().catch(() => ({}));
    setShareLinkLoading(false);
    if (!res.ok) {
      setLinkError(data.error || "Failed to create link");
      return;
    }
    setShareLinkUrl(data.url ?? null);
  }

  async function copyLink() {
    if (!shareLinkUrl) return;
    try {
      await navigator.clipboard.writeText(shareLinkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLinkError("Could not copy");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Share &quot;{boardName}&quot;</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2" title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">People with access</p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Owner (you)
                </li>
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    {m.user_id === currentUser.id ? "You" : (m.email ?? `User ${m.user_id.slice(0, 6)}…`)}
                    <span className="text-xs text-gray-400">({m.role})</span>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleInvite} className="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Invite by email</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="colleague@example.com"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Reader</option>
                    </select>
                  </div>
                  {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={!email.trim() || sharing}
                  className="px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  {sharing ? "Inviting…" : "Invite"}
                </button>
              </form>
              <p className="text-xs text-gray-400 dark:text-gray-500">They must have a CollabBoard account with this email.</p>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Share by link</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Anyone with the link can open the board. Choose access level:</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value as "editor" | "viewer")}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Reader</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateLink}
                    disabled={shareLinkLoading}
                    className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium disabled:opacity-50"
                  >
                    {shareLinkLoading ? "Creating…" : "Create link"}
                  </button>
                </div>
                {linkError && <p className="text-sm text-red-600 dark:text-red-400">{linkError}</p>}
                {shareLinkUrl && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      readOnly
                      value={shareLinkUrl}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="shrink-0 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
