"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useMemo, useCallback, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { UIMessage } from "ai";

interface ChatPanelProps {
  boardId: string;
  user: User | null;
  accessToken: string | null;
  onClose: () => void;
}

function getMessageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function ChatPanel({ boardId, user, accessToken, onClose }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: {
          boardId,
          userId: user?.id ?? "",
          accessToken,
        },
      }),
    [boardId, user?.id, accessToken]
  );

  const { messages, sendMessage, status } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input });
      setInput("");
    },
    [input, isLoading, sendMessage]
  );

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-lg flex flex-col z-30">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">AI Board Agent</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ask to add sticky notes, shapes, or move things. e.g. &quot;Add a yellow sticky note that says Hello&quot;
          </p>
        )}
        {messages.map((m: UIMessage) => {
          const text = getMessageText(m);
          if (!text) return null;
          return (
            <div
              key={m.id}
              className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}
            >
              <span className="text-gray-500 dark:text-gray-400 text-xs">{m.role === "user" ? "You" : "AI"}</span>
              <div
                className={
                  m.role === "user"
                    ? "inline-block mt-0.5 px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200"
                    : "mt-0.5 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }
              >
                {text}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Thinking…</p>
        )}
      </div>
      <form onSubmit={onSubmit} className="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI to add or edit..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || !user}
        />
      </form>
    </div>
  );
}
