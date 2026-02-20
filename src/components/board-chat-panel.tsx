"use client";

import { useState, useRef, useEffect } from "react";
import type { BoardChatMessage } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";

interface BoardChatPanelProps {
  boardId: string;
  user: User | null;
  messages: BoardChatMessage[];
  loading: boolean;
  onSend: (body: string) => Promise<void>;
  onClose: () => void;
  peerCount: number;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function BoardChatPanel({ user, messages, loading, onSend, onClose, peerCount }: BoardChatPanelProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending || !user) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setInput("");
    } finally {
      setSending(false);
    }
  };

  const displayName = (email: string) => (email && email !== "Anonymous" ? email.split("@")[0] : "Someone");

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[320px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-l border-gray-200/50 dark:border-gray-800/50 shadow-2xl flex flex-col z-30">
      <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Board chat</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{peerCount > 0 ? `${peerCount} online` : "Only you here"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0"
        onScroll={() => {
          const el = listRef.current;
          if (el) wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {loading ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No messages yet. Say hi to collaborators when they join.</p>
        ) : (
          messages.map((m) => {
            const isMe = user && m.user_id === user.id;
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isMe ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-br-md" : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md"}`}>
                  {!isMe && (
                    <p className="text-[10px] font-medium text-sky-600 dark:text-sky-400 mb-0.5">{displayName(m.user_email)}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-0.5 ${isMe ? "text-sky-100" : "text-gray-400 dark:text-gray-500"}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200/50 dark:border-gray-800/50 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message collaborators…"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:pointer-events-none text-white transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
