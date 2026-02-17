"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { BoardElement } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";
import { Canvas } from "@/components/canvas";
import { Toolbar } from "@/components/toolbar";
import { PresenceBar } from "@/components/presence-bar";
import { ChatPanel } from "@/components/chat-panel";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useRealtimeElements } from "@/hooks/use-realtime-elements";
import { usePresence } from "@/hooks/use-presence";

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<"select" | "sticky_note" | "rectangle" | "circle" | "text">("select");
  const [openEditorForId, setOpenEditorForId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Load user, session, and initial elements (merge with any realtime updates that arrived first)
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        router.push("/auth");
        return;
      }
      setUser(user);
      setAccessToken(session?.access_token ?? null);

      const { data } = await supabase
        .from("board_elements")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: true });

      const fromDb = (data as BoardElement[]) || [];
      setElements((prev) => {
        const idsFromDb = new Set(fromDb.map((e) => e.id));
        const fromRealtime = prev.filter((e) => !idsFromDb.has(e.id));
        const merged = [...fromDb, ...fromRealtime];
        merged.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return merged;
      });
      setLoading(false);
    }
    init();
  }, [boardId, router]);

  // Real-time element sync (postgres_changes + broadcast fallback for add/delete)
  const { broadcastElement, broadcastElementUpdated, broadcastElementDeleted } = useRealtimeElements(
    boardId,
    setElements
  );

  // Presence (cursors + who's online)
  const { peers, broadcastCursor } = usePresence(boardId, user);

  // Create element (centered on click position). Optimistic: show immediately, then replace with server row.
  const createElement = useCallback(
    async (
      type: "sticky_note" | "rectangle" | "circle" | "text",
      x: number,
      y: number
    ): Promise<string | null> => {
      if (!user) return null;
      const color =
        type === "sticky_note"
          ? "#FFEB3B"
          : type === "rectangle"
            ? "#42A5F5"
            : type === "circle"
              ? "#10B981"
              : "#f3f4f6";
      const width = type === "sticky_note" ? 200 : type === "text" ? 180 : 120;
      const height = type === "sticky_note" ? 200 : type === "text" ? 40 : type === "circle" ? 120 : 100;
      const now = new Date().toISOString();
      const tempId = `temp-${Date.now()}`;

      const tempEl: BoardElement = {
        id: tempId,
        board_id: boardId,
        type,
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        color,
        text: type === "sticky_note" ? "New note" : "",
        properties: {},
        created_by: user.id,
        updated_at: now,
        created_at: now,
      };

      setElements((prev) =>
        [...prev, tempEl].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      );

      const { data, error } = await supabase
        .from("board_elements")
        .insert({
          board_id: boardId,
          type,
          x: tempEl.x,
          y: tempEl.y,
          width,
          height,
          color,
          text: tempEl.text,
          created_by: user.id,
        } as never)
        .select("*")
        .single();

      if (error) {
        setElements((prev) => prev.filter((e) => e.id !== tempId));
        return null;
      }

      const row = data as BoardElement | null;
      if (row) {
        setElements((prev) =>
          prev
            .map((e) => (e.id === tempId ? row : e))
            .sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        );
        broadcastElement(row);
        return row.id;
      }

      setElements((prev) => prev.filter((e) => e.id !== tempId));
      return null;
    },
    [boardId, user, broadcastElement]
  );

  // Update element (persists to Supabase + broadcasts to peers)
  const updateElement = useCallback(
    async (id: string, updates: Partial<BoardElement>) => {
      // Also update local state immediately for responsiveness
      setElements((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
      // Broadcast so other clients see the update immediately
      broadcastElementUpdated(id, updates);
      await supabase
        .from("board_elements")
        .update(updates as never)
        .eq("id", id);
    },
    [broadcastElementUpdated]
  );

  // Optimistic local-only update (no DB round-trip) — used during drag
  const localUpdateElement = useCallback(
    (id: string, updates: Partial<BoardElement>) => {
      setElements((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
    },
    []
  );

  // Delete element (broadcast so other clients update in real time)
  const deleteElement = useCallback(
    async (id: string) => {
      broadcastElementDeleted(id);
      setElements((prev) => prev.filter((e) => e.id !== id));
      await supabase.from("board_elements").delete().eq("id", id);
    },
    [broadcastElementDeleted]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400">Loading board...</p>
      </div>
    );
  }

  const enableAi = process.env.NEXT_PUBLIC_ENABLE_AI === "true";

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-950 flex flex-col relative">
      {/* AI Chat panel (full app only; not MVP) */}
      {enableAi && showChatPanel && (
        <ChatPanel
          boardId={boardId}
          user={user}
          accessToken={accessToken}
          onClose={() => setShowChatPanel(false)}
        />
      )}

      {/* Top bar */}
      <div className="h-12 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800/60 flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            ← Boards
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-tight">CollabBoard</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          {enableAi && (
            <button
              type="button"
              onClick={() => setShowChatPanel((v) => !v)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${showChatPanel ? "bg-blue-500 text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
            >
              AI
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <PresenceBar peers={peers} user={user} />
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar tool={tool} onToolChange={setTool} />

      {/* Canvas */}
      <Canvas
        elements={elements}
        viewport={viewport}
        onViewportChange={setViewport}
        tool={tool}
        onToolChange={setTool}
        onCreate={async (type, x, y) => {
          const id = await createElement(type, x, y);
          if (type === "text" && id) setOpenEditorForId(id);
        }}
        onUpdate={updateElement}
        onDelete={deleteElement}
        onCursorMove={broadcastCursor}
        peers={peers}
        onLocalUpdate={localUpdateElement}
        currentUserId={user?.id ?? null}
        openEditorForId={openEditorForId}
        onOpenEditorFulfilled={() => setOpenEditorForId(null)}
      />
    </div>
  );
}
