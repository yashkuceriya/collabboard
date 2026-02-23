"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import type { UIMessage } from "ai";

interface ChatPanelProps {
  boardId: string;
  user: User | null;
  accessToken: string | null;
  onClose: () => void;
  interviewMode?: boolean;
  /** Called after AI finishes streaming so the board can re-fetch elements created by tools */
  onAiFinished?: () => void;
  /** When set, send this message once (e.g. "Create a SWOT analysis") and then clear via onClearInitialPrompt */
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
}

function getMessageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Strip markdown/code so AI replies show as normal plain text (no **, `, code blocks). */
function plainText(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

function dbToUIMessage(row: { id: string; role: string; content: string }): UIMessage {
  return {
    id: row.id,
    role: row.role as "user" | "assistant" | "system",
    parts: [{ type: "text", text: row.content }],
  };
}

export function ChatPanel({ boardId, user, accessToken, onClose, interviewMode, onAiFinished, initialPrompt, onClearInitialPrompt }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const lastSavedCountRef = useRef(0);
  const initialPromptSentRef = useRef(false);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: {
          boardId,
          userId: user?.id ?? "",
          accessToken,
          interviewMode: !!interviewMode,
        },
      }),
    [boardId, user?.id, accessToken, interviewMode]
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // When initialPrompt is set (e.g. from dashboard template), send it once when ready
  useEffect(() => {
    if (!initialPrompt?.trim() || initialPromptSentRef.current || status !== "ready" || !user) return;
    initialPromptSentRef.current = true;
    sendMessage({ text: initialPrompt.trim() });
    onClearInitialPrompt?.();
  }, [initialPrompt, status, sendMessage, user, onClearInitialPrompt]);

  // Load AI chat history (last 24h) on mount
  useEffect(() => {
    if (!boardId || !accessToken) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/boards/${boardId}/ai-messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (cancelled || !res.ok) return;
      const { messages: rows } = (await res.json()) as { messages: { id: string; role: string; content: string }[] };
      const loaded = (rows ?? []).map(dbToUIMessage);
      if (cancelled) return;
      setMessages(loaded);
      lastSavedCountRef.current = loaded.length;
    })();
    return () => { cancelled = true; };
  }, [boardId, accessToken, setMessages]);

  // When AI finishes streaming, refresh board elements and persist new messages (24h history)
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
    const nowReady = status === "ready";
    prevStatusRef.current = status;
    if (wasStreaming && nowReady) {
      if (onAiFinished) setTimeout(() => onAiFinished(), 150);
      const lastSaved = lastSavedCountRef.current;
      if (messages.length > lastSaved && accessToken) {
        const toSave = messages.slice(lastSaved).map((m) => ({
          role: m.role,
          content: getMessageText(m),
        })).filter((m) => m.role === "user" || m.role === "assistant");
        if (toSave.length > 0) {
          lastSavedCountRef.current = messages.length;
          fetch(`/api/boards/${boardId}/ai-messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ messages: toSave }),
          }).catch(() => {});
        }
      }
    }
  }, [status, onAiFinished, messages, boardId, accessToken]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input });
      setInput("");
    },
    [input, isLoading, sendMessage]
  );

  const suggestions = interviewMode
    ? [
        "Help me design this system",
        "Review my approach",
        "What am I missing?",
        "Analyze time and space complexity",
        "Suggest edge cases to consider",
        "Add components for a typical web app",
        "Tell me a fun fact",
        "Tell me a joke",
      ]
    : [
        "Brainstorm ideas about...",
        "Summarize this board",
        "Organize the board neatly",
        "Add 3 sticky notes about...",
        "Create a flowchart for...",
        "Design a system architecture",
        "Add a pros/cons list",
        "Add a title and subtitle",
        "Tell me a fun fact",
        "Tell me a joke",
      ];

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[340px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-l border-gray-200/50 dark:border-gray-800/50 shadow-2xl flex flex-col z-30">
      <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">AI Assistant</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Powered by GPT-4o-mini</p>
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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-center py-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">How can I help?</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {interviewMode
                  ? "I can help with system design, coding practice, complexity analysis, and interview tips. Ask for components, edge cases, or a quick review."
                  : "I can brainstorm ideas, add elements, organize your board, and more."}
              </p>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s);
                  }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-300 border border-gray-100 dark:border-gray-800 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m: UIMessage) => {
          let text = getMessageText(m);
          if (m.role === "assistant") text = plainText(text);
          if (!text) return null;
          return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[85%]">
                <div
                  className={`text-sm px-3 py-2 rounded-2xl ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-br-md"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md"
                  }`}
                >
                  {text}
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-200/50 dark:border-gray-800/50 shrink-0 space-y-2">
        {interviewMode && messages.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Complexity", prompt: "Analyze the time and space complexity of my current approach" },
              { label: "Edge cases", prompt: "What edge cases should I consider for this problem?" },
              { label: "Improve", prompt: "How can I improve my current solution?" },
              { label: "Draw arch", prompt: "Help me draw the architecture diagram on the board" },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => { sendMessage({ text: a.prompt }); }}
                className="px-2 py-1 text-[10px] font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800/50 transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={interviewMode ? "Ask about your design..." : "Ask AI anything..."}
            className="flex-1 px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors"
            disabled={isLoading || !user}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !user}
            className="px-3 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl disabled:opacity-40 transition-all hover:from-violet-600 hover:to-purple-600 shadow-sm shadow-violet-500/25"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2L7 9" />
              <path d="M14 2l-5 12-2-5-5-2 12-5z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
