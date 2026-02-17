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
  const [tool, setTool] = useState<"select" | "sticky_note" | "rectangle" | "circle" | "text" | "connector">("select");
  const [openEditorForId, setOpenEditorForId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [boardName, setBoardName] = useState("Untitled Board");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

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

      const { data: boardData } = await supabase
        .from("boards")
        .select("name")
        .eq("id", boardId)
        .single();
      if (boardData) setBoardName((boardData as { name: string }).name);

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

  async function saveBoardName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) { setEditingName(false); return; }
    setBoardName(trimmed);
    setEditingName(false);
    await supabase.from("boards").update({ name: trimmed } as never).eq("id", boardId);
  }

  // Real-time element sync (postgres_changes + broadcast fallback for add/delete)
  const { broadcastElement, broadcastElementUpdated, broadcastElementDeleted } = useRealtimeElements(
    boardId,
    setElements
  );

  // Presence (cursors + who's online)
  const { peers, broadcastCursor } = usePresence(boardId, user);

  // Create element. For rectangle/circle, (x,y,width,height) can be passed (draw-by-drag). Otherwise click creates default size.
  const createElement = useCallback(
    async (
      type: "sticky_note" | "rectangle" | "circle" | "text",
      x: number,
      y: number,
      width?: number,
      height?: number
    ): Promise<string | null> => {
      if (!user) return null;
      const color =
        type === "sticky_note"
          ? "#FFEB3B"
          : type === "rectangle"
            ? "#42A5F5"
            : type === "circle"
              ? "#10B981"
              : "#3B82F6";
      const w = width ?? (type === "sticky_note" ? 200 : type === "text" ? 180 : 120);
      const h = height ?? (type === "sticky_note" ? 200 : type === "text" ? 40 : type === "circle" ? 120 : 100);
      const now = new Date().toISOString();
      const tempId = `temp-${Date.now()}`;
      const elX = width != null ? x : x - w / 2;
      const elY = height != null ? y : y - h / 2;

      const tempEl: BoardElement = {
        id: tempId,
        board_id: boardId,
        type,
        x: elX,
        y: elY,
        width: w,
        height: h,
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
          width: w,
          height: h,
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

  // Create connector (arrow) between two elements. Arrows move with shapes automatically.
  const createConnector = useCallback(
    async (fromId: string, toId: string): Promise<string | null> => {
      if (!user) return null;
      const tempId = `temp-${Date.now()}`;
      const tempEl: BoardElement = {
        id: tempId,
        board_id: boardId,
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        color: "#64748b",
        text: "",
        properties: { fromId, toId } as BoardElement["properties"],
        created_by: user.id,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
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
          type: "connector",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          color: "#64748b",
          text: "",
          properties: { fromId, toId },
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

  // Delete element and any connectors attached to it
  const deleteElement = useCallback(
    async (id: string) => {
      const attachedConnectors = elements.filter(
        (e) =>
          e.type === "connector" &&
          ((e.properties as Record<string, string>)?.fromId === id ||
            (e.properties as Record<string, string>)?.toId === id)
      );
      for (const connector of attachedConnectors) {
        broadcastElementDeleted(connector.id);
        setElements((prev) => prev.filter((e) => e.id !== connector.id));
        await supabase.from("board_elements").delete().eq("id", connector.id);
      }
      broadcastElementDeleted(id);
      setElements((prev) => prev.filter((e) => e.id !== id));
      await supabase.from("board_elements").delete().eq("id", id);
    },
    [broadcastElementDeleted, elements]
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
    <div className="h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950 flex flex-col relative">
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
      <div className="h-12 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors rounded-lg px-2 py-1 -ml-1"
          >
            ← Boards
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => saveBoardName(nameInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveBoardName(nameInput);
                if (e.key === "Escape") setEditingName(false);
              }}
              className="text-sm font-semibold text-gray-800 dark:text-gray-200 bg-transparent border-b-2 border-blue-500 outline-none px-1 py-0.5 max-w-[200px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditingName(true); setNameInput(boardName); }}
              className="text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 group"
              title="Click to rename"
            >
              {boardName}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 dark:text-gray-600 group-hover:text-blue-400">
                <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
              </svg>
            </button>
          )}
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
        onCreate={async (type, x, y, width?, height?) => {
          const id = await createElement(type, x, y, width, height);
          if (type === "text" && id) setOpenEditorForId(id);
        }}
        onCreateConnector={createConnector}
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
