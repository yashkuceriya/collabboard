"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { BoardElement } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";
import { Canvas } from "@/components/canvas";
import { Toolbar } from "@/components/toolbar";
import { PresenceBar } from "@/components/presence-bar";
import { ChatPanel } from "@/components/chat-panel";
import { BoardChatPanel } from "@/components/board-chat-panel";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserMenu } from "@/components/user-menu";
import { ShareBoardModal } from "@/components/share-board-modal";
import { InterviewToolbar } from "@/components/interview-toolbar";
import { VersionHistoryPanel } from "@/components/version-history-panel";
import { useRealtimeElements } from "@/hooks/use-realtime-elements";
import { usePresence } from "@/hooks/use-presence";
import { useBoardChat } from "@/hooks/use-board-chat";
import { sortElementsByOrder } from "@/lib/sort-elements";
import { addRecentBoard } from "@/lib/recent-boards";

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<"select" | "sticky_note" | "rectangle" | "circle" | "line" | "text" | "connector" | "pen" | "eraser" | "frame">("select");
  const [openEditorForId, setOpenEditorForId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [boardName, setBoardName] = useState("Untitled Board");
  const [boardOwnerId, setBoardOwnerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBoardChatPanel, setShowBoardChatPanel] = useState(false);
  const [showVersionHistoryPanel, setShowVersionHistoryPanel] = useState(false);
  const [interviewMode, setInterviewMode] = useState(false); // derived from board.is_interview
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [boardFps, setBoardFps] = useState(0);
  const [initialAiPrompt, setInitialAiPrompt] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const perfMode = searchParams.get("perf") === "1";
  const versionSnapshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TEMPLATE_PROMPTS: Record<string, string> = {
    kanban: "Create a kanban board with To Do, In Progress, and Done columns.",
    swot: "Create a SWOT analysis with four quadrants: Strengths, Weaknesses, Opportunities, Threats.",
    retrospective: "Set up a retrospective board with What went well, What to improve, and Action items.",
    user_journey: "Build a user journey map showing the user experience flow.",
    pros_cons: "Create a pros and cons grid to weigh options side by side.",
  };

  const scheduleVersionSnapshot = useCallback(() => {
    if (versionSnapshotTimeoutRef.current) clearTimeout(versionSnapshotTimeoutRef.current);
    versionSnapshotTimeoutRef.current = setTimeout(() => {
      versionSnapshotTimeoutRef.current = null;
      if (!accessToken) return;
      fetch(`/api/boards/${boardId}/snapshot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }, 4000);
  }, [boardId, accessToken]);

  /** Zoom viewport to fit the given element IDs (or all content if ids empty). Use after AI creates elements or to focus selection. */
  const zoomToElementIds = useCallback((ids: string[]) => {
    const els = ids.length > 0
      ? elements.filter((e) => ids.includes(e.id) && e.type !== "connector")
      : elements.filter((e) => e.type !== "connector");
    if (els.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...els.map((e) => e.x));
    const minY = Math.min(...els.map((e) => e.y));
    const maxX = Math.max(...els.map((e) => e.x + e.width));
    const maxY = Math.max(...els.map((e) => e.y + e.height));
    const bw = maxX - minX || 100;
    const bh = maxY - minY || 100;
    const containerW = typeof window !== "undefined" ? window.innerWidth - 80 : 800;
    const containerH = typeof window !== "undefined" ? window.innerHeight - 120 : 600;
    const zoom = Math.min(containerW / bw, containerH / bh, 2) * 0.9;
    const cx = minX + bw / 2;
    const cy = minY + bh / 2;
    setViewport({ x: containerW / 2 - cx * zoom, y: containerH / 2 - cy * zoom + 50, zoom });
  }, [elements]);

  // When opened from dashboard template, open AI panel and send template prompt once; then clear URL param
  const templateParam = searchParams.get("template");
  useEffect(() => {
    if (!templateParam || !user) return;
    const prompt = TEMPLATE_PROMPTS[templateParam] || `Create a ${templateParam.replace(/_/g, " ")} board.`;
    setInitialAiPrompt(prompt);
    setShowChatPanel(true);
    const u = new URL(window.location.href);
    u.searchParams.delete("template");
    router.replace(u.pathname + u.search, { scroll: false });
  }, [templateParam, user, router]);

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
        .select("name, owner_id, is_interview")
        .eq("id", boardId)
        .single();
      if (boardData) {
        const b = boardData as { name: string; owner_id: string; is_interview?: boolean };
        setBoardName(b.name);
        setBoardOwnerId(b.owner_id);
        setInterviewMode(!!b.is_interview);
        addRecentBoard(boardId);
      } else {
        router.replace("/dashboard");
        return;
      }

      const { data } = await supabase
        .from("board_elements")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: true });

      const fromDb = (data as BoardElement[]) || [];
      setElements((prev) => {
        const idsFromDb = new Set(fromDb.map((e) => e.id));
        const fromRealtime = prev.filter((e) => !idsFromDb.has(e.id));
        return sortElementsByOrder([...fromDb, ...fromRealtime]);
      });
      setLoading(false);
    }
    init();
  }, [boardId, router]);

  // Redeem share link when visiting with ?invite=TOKEN
  const inviteToken = searchParams.get("invite");
  useEffect(() => {
    if (loading || !user || !accessToken || !inviteToken) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/boards/${boardId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken, accessToken }),
      });
      if (cancelled) return;
      if (res.ok) router.replace(`/board/${boardId}`, { scroll: false });
    })();
    return () => { cancelled = true; };
  }, [loading, user, accessToken, inviteToken, boardId, router]);

  async function saveBoardName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) { setEditingName(false); return; }
    setBoardName(trimmed);
    setEditingName(false);
    await supabase.from("boards").update({ name: trimmed } as never).eq("id", boardId);
  }

  // Re-fetch all elements from DB (used after AI tool calls so board reflects server state, e.g. after clear)
  const refreshElements = useCallback(async () => {
    const { data } = await supabase
      .from("board_elements")
      .select("*")
      .eq("board_id", boardId)
      .order("created_at", { ascending: true });
    const fromDb = (data as BoardElement[]) || [];
    setElements(sortElementsByOrder(fromDb));
  }, [boardId]);

  // Real-time element sync (postgres_changes + broadcast fallback for add/delete)
  const { broadcastElement, broadcastElementUpdated, broadcastElementDeleted, syncLatencyRef } = useRealtimeElements(
    boardId,
    setElements
  );

  // Presence (cursors + who's online)
  const { peers, broadcastCursor, cursorLatency: cursorLatencyRef } = usePresence(boardId, user);

  // Board chat (messages between users on this board)
  const { messages: chatMessages, loading: chatLoading, sendMessage } = useBoardChat(boardId, user);

  // Create element. For rectangle/circle, (x,y,width,height) can be passed (draw-by-drag). Otherwise click creates default size.
  const createElement = useCallback(
    async (
      type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "line",
      x: number,
      y: number,
      width?: number,
      height?: number
    ): Promise<string | null> => {
      if (!user) return null;
      const colorMap: Record<string, string> = {
        sticky_note: "#FFEB3B", rectangle: "#42A5F5", circle: "#10B981",
        text: "#3B82F6", frame: "#6366F1", line: "#64748b",
      };
      const color = colorMap[type] ?? "#3B82F6";
      const isLine = type === "line";
      const w = width ?? (type === "sticky_note" ? 200 : type === "text" ? 180 : type === "frame" ? 400 : isLine ? 200 : 120);
      const h = height ?? (type === "sticky_note" ? 200 : type === "text" ? 40 : type === "circle" ? 120 : type === "frame" ? 300 : isLine ? 0 : 100);
      const now = new Date().toISOString();
      const tempId = `temp-${Date.now()}`;
      const elX = width != null ? x : x - (isLine ? 0 : w / 2);
      const elY = height != null ? y : y - (isLine ? 0 : h / 2);
      const lineProps = isLine ? { x2: w, y2: h } : {};
      const storeW = isLine ? Math.abs(w) || 1 : w;
      const storeH = isLine ? Math.abs(h) || 1 : h;

      const tempEl: BoardElement = {
        id: tempId,
        board_id: boardId,
        type,
        x: elX,
        y: elY,
        width: storeW,
        height: storeH,
        color,
        text: type === "sticky_note" ? "New note" : type === "frame" ? "New frame" : "",
        properties: type === "sticky_note" ? { rotation: (Math.random() - 0.5) * 6 } : lineProps,
        created_by: user.id,
        updated_at: now,
        created_at: now,
      };

      setElements((prev) => sortElementsByOrder([...prev, tempEl]));

      const { data, error } = await supabase
        .from("board_elements")
        .insert({
          board_id: boardId,
          type,
          x: tempEl.x,
          y: tempEl.y,
          width: storeW,
          height: storeH,
          color,
          text: tempEl.text,
          properties: tempEl.properties ?? {},
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
        setElements((prev) => sortElementsByOrder(prev.map((e) => (e.id === tempId ? row : e))));
        broadcastElement(row);
        scheduleVersionSnapshot();
        return row.id;
      }

      setElements((prev) => prev.filter((e) => e.id !== tempId));
      return null;
    },
    [boardId, user, broadcastElement, scheduleVersionSnapshot]
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
      setElements((prev) => sortElementsByOrder([...prev, tempEl]));
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
        setElements((prev) => sortElementsByOrder(prev.map((e) => (e.id === tempId ? row : e))));
        broadcastElement(row);
        scheduleVersionSnapshot();
        return row.id;
      }
      setElements((prev) => prev.filter((e) => e.id !== tempId));
      return null;
    },
    [boardId, user, broadcastElement, scheduleVersionSnapshot]
  );

  // Create freehand stroke (pen tool) — store points in local coords (relative to bbox min) so moving el.x, el.y moves the stroke
  const createFreehand = useCallback(
    async (points: { x: number; y: number }[], strokeColor = "#1a1a1a"): Promise<string | null> => {
      if (!user || points.length < 2) return null;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const width = Math.max(maxX - minX, 2);
      const height = Math.max(maxY - minY, 2);
      const localPoints = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const tempEl: BoardElement = {
        id: tempId,
        board_id: boardId,
        type: "freehand",
        x: minX,
        y: minY,
        width,
        height,
        color: strokeColor,
        text: "",
        properties: { points: localPoints } as BoardElement["properties"],
        created_by: user.id,
        updated_at: now,
        created_at: now,
      };
      setElements((prev) => sortElementsByOrder([...prev, tempEl]));
      const { data, error } = await supabase
        .from("board_elements")
        .insert({
          board_id: boardId,
          type: "freehand",
          x: minX,
          y: minY,
          width,
          height,
          color: strokeColor,
          text: "",
          properties: { points: localPoints },
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
        setElements((prev) => sortElementsByOrder(prev.map((e) => (e.id === tempId ? row : e))));
        broadcastElement(row);
        scheduleVersionSnapshot();
        return row.id;
      }
      setElements((prev) => prev.filter((e) => e.id !== tempId));
      return null;
    },
    [boardId, user, broadcastElement, scheduleVersionSnapshot]
  );

  // Update element (persists to Supabase + broadcasts to peers)
  const updateElement = useCallback(
    async (id: string, updates: Partial<BoardElement>) => {
      setElements((prev) =>
        sortElementsByOrder(prev.map((e) => (e.id === id ? { ...e, ...updates } : e)))
      );
      broadcastElementUpdated(id, updates);
      await supabase
        .from("board_elements")
        .update(updates as never)
        .eq("id", id);
      scheduleVersionSnapshot();
    },
    [broadcastElementUpdated, scheduleVersionSnapshot]
  );

  // Insert large code block (for coding interview)
  const insertCodeBlock = useCallback(async () => {
    if (!user) return null;
    const w = 720;
    const h = 420;
    const centerWorldX = typeof window !== "undefined" ? (window.innerWidth / 2 - viewport.x) / viewport.zoom : 400;
    const centerWorldY = typeof window !== "undefined" ? (window.innerHeight / 2 - viewport.y) / viewport.zoom - 80 : 300;
    const cx = centerWorldX - w / 2;
    const cy = centerWorldY - h / 2;
    const id = await createElement("text", cx, cy, w, h);
    if (id) {
      await updateElement(id, {
        text: "// Your code here\n\nfunction solution() {\n  \n}",
        color: "#1e293b",
        properties: { fontFamily: "mono", fontSize: "large", textColor: "#e2e8f0" } as BoardElement["properties"],
      });
      setOpenEditorForId(id);
    }
    return id;
  }, [user, viewport, createElement, updateElement]);

  // Duplicate selected element (offset by 20,20). Non-connector only.
  const duplicateElement = useCallback(
    async (id: string): Promise<string | null> => {
      const el = elements.find((e) => e.id === id);
      if (!el || !user || el.type === "connector") return null;
      const offset = 20;
      const { data, error } = await supabase
        .from("board_elements")
        .insert({
          board_id: boardId,
          type: el.type,
          x: el.x + offset,
          y: el.y + offset,
          width: el.width,
          height: el.height,
          color: el.color,
          text: el.text,
          properties: el.properties ?? {},
          created_by: user.id,
        } as never)
        .select("*")
        .single();
      if (error) return null;
      const row = data as BoardElement;
      setElements((prev) => sortElementsByOrder([...prev, row]));
      broadcastElement(row);
      scheduleVersionSnapshot();
      return row.id;
    },
    [boardId, user, elements, broadcastElement, scheduleVersionSnapshot]
  );

  // Bring element to front (increase z_index in properties)
  const bringToFront = useCallback(
    (id: string) => {
      setElements((prev) => {
        const el = prev.find((e) => e.id === id);
        if (!el) return prev;
        const maxZ = Math.max(...prev.map((e) => (e.properties as Record<string, number>)?.z_index ?? 0), 0);
        const newZ = maxZ + 1;
        const props = (el.properties as Record<string, unknown>) ?? {};
        const newProps = { ...props, z_index: newZ } as BoardElement["properties"];
        broadcastElementUpdated(id, { properties: newProps });
        supabase.from("board_elements").update({ properties: newProps } as never).eq("id", id);
        return sortElementsByOrder(prev.map((e) => (e.id === id ? { ...e, properties: newProps } : e)));
      });
      scheduleVersionSnapshot();
    },
    [broadcastElementUpdated, scheduleVersionSnapshot]
  );

  // Send element to back (decrease z_index in properties)
  const sendToBack = useCallback(
    (id: string) => {
      setElements((prev) => {
        const el = prev.find((e) => e.id === id);
        if (!el) return prev;
        const minZ = Math.min(...prev.map((e) => (e.properties as Record<string, number>)?.z_index ?? 0), 0);
        const newZ = minZ - 1;
        const props = (el.properties as Record<string, unknown>) ?? {};
        const newProps = { ...props, z_index: newZ } as BoardElement["properties"];
        broadcastElementUpdated(id, { properties: newProps });
        supabase.from("board_elements").update({ properties: newProps } as never).eq("id", id);
        return sortElementsByOrder(prev.map((e) => (e.id === id ? { ...e, properties: newProps } : e)));
      });
      scheduleVersionSnapshot();
    },
    [broadcastElementUpdated, scheduleVersionSnapshot]
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
      scheduleVersionSnapshot();
    },
    [broadcastElementDeleted, elements, scheduleVersionSnapshot]
  );

  const insertTemplate = useCallback(
    async (template: "system_design" | "algorithm") => {
      if (!user) return;
      const items: { type: "rectangle" | "text"; x: number; y: number; w: number; h: number; text: string; color: string }[] =
        template === "system_design"
          ? [
              { type: "text", x: 300, y: 50, w: 300, h: 40, text: "System Design", color: "#3B82F6" },
              { type: "rectangle", x: 50, y: 150, w: 160, h: 80, text: "Client", color: "#60A5FA" },
              { type: "rectangle", x: 300, y: 150, w: 160, h: 80, text: "Load Balancer", color: "#F59E0B" },
              { type: "rectangle", x: 550, y: 100, w: 160, h: 80, text: "Server 1", color: "#10B981" },
              { type: "rectangle", x: 550, y: 220, w: 160, h: 80, text: "Server 2", color: "#10B981" },
              { type: "rectangle", x: 800, y: 100, w: 160, h: 80, text: "Database", color: "#8B5CF6" },
              { type: "rectangle", x: 800, y: 220, w: 160, h: 80, text: "Cache", color: "#EF4444" },
            ]
          : [
              { type: "text", x: 250, y: 50, w: 300, h: 40, text: "Algorithm / Problem", color: "#3B82F6" },
              { type: "rectangle", x: 50, y: 150, w: 200, h: 100, text: "Input\n\n", color: "#60A5FA" },
              { type: "rectangle", x: 320, y: 150, w: 200, h: 180, text: "Processing\n\n\n", color: "#F59E0B" },
              { type: "rectangle", x: 590, y: 150, w: 200, h: 100, text: "Output\n\n", color: "#10B981" },
              { type: "rectangle", x: 50, y: 380, w: 740, h: 120, text: "Notes / Complexity\n\nTime:    Space:", color: "#8B5CF6" },
            ];

      const createdIds: (string | null)[] = [];
      for (const item of items) {
        const id = await createElement(item.type as "rectangle" | "text", item.x, item.y, item.w, item.h);
        createdIds.push(id ?? null);
        if (id) await updateElement(id, { text: item.text, color: item.color });
      }

      if (template === "system_design" && createConnector) {
        const [, client, lb, s1, s2, db, cache] = createdIds;
        if (client && lb) await createConnector(client, lb);
        if (lb && s1) await createConnector(lb, s1);
        if (lb && s2) await createConnector(lb, s2);
        if (s1 && db) await createConnector(s1, db);
        if (s1 && cache) await createConnector(s1, cache);
        if (s2 && db) await createConnector(s2, db);
        if (s2 && cache) await createConnector(s2, cache);
      }
    },
    [user, createElement, updateElement, createConnector]
  );

  const clearBoard = useCallback(async () => {
    for (const el of elements) broadcastElementDeleted(el.id);
    setElements([]);
    await supabase.from("board_elements").delete().eq("board_id", boardId);
    scheduleVersionSnapshot();
  }, [elements, broadcastElementDeleted, boardId, scheduleVersionSnapshot]);

  const clearBoardWithConfirm = useCallback(() => {
    if (elements.length === 0) return;
    if (typeof window !== "undefined" && !window.confirm("Clear entire board? This cannot be undone.")) return;
    void clearBoard();
  }, [elements.length, clearBoard]);

  // Stress test: bulk-generate N sticky notes for performance testing
  const stressTest = useCallback(async (count: number) => {
    if (!user) return;
    const colors = ["#FFEB3B", "#FF9800", "#F48FB1", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#E8F5E9"];
    const facts = [
      "The speed of light is 299,792,458 m/s",
      "Honey never spoils",
      "Octopuses have three hearts",
      "A day on Venus is longer than a year",
      "Bananas are berries but strawberries aren't",
      "Water can boil and freeze at the same time",
      "The Eiffel Tower grows 6 inches in summer",
      "A group of flamingos is called a flamboyance",
      "Humans share 60% of DNA with bananas",
      "The moon has moonquakes",
      "Sharks are older than trees",
      "A jiffy is an actual unit of time",
      "Wombat poop is cube-shaped",
      "The inventor of Pringles is buried in a Pringles can",
      "Hot water freezes faster than cold water",
      "A cloud can weigh over a million pounds",
      "There are more stars than grains of sand",
      "Cows have best friends",
      "Sea otters hold hands while sleeping",
      "The human nose can detect over 1 trillion scents",
    ];
    const cols = Math.ceil(Math.sqrt(count));
    const gap = 20;
    const cellW = 210;
    const cellH = 210;
    const batchSize = 50;
    const batches: Array<Record<string, unknown>>[] = [];
    let batch: Record<string, unknown>[] = [];

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bg = colors[i % colors.length];
      batch.push({
        board_id: boardId,
        type: "sticky_note",
        x: 50 + col * (cellW + gap),
        y: 50 + row * (cellH + gap),
        width: cellW,
        height: cellH,
        color: bg,
        text: `#${i + 1}: ${facts[i % facts.length]}`,
        properties: { textColor: "#1a1a1a", textAlign: "left" },
        created_by: user.id,
      });
      if (batch.length >= batchSize) {
        batches.push(batch);
        batch = [];
      }
    }
    if (batch.length) batches.push(batch);

    for (const b of batches) {
      await supabase.from("board_elements").insert(b as never);
    }
    await refreshElements();
  }, [user, boardId, refreshElements]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg animate-pulse">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950 flex flex-col relative">
      {/* Share modal */}
      {showShareModal && user && (
        <ShareBoardModal
          boardId={boardId}
          boardName={boardName}
          currentUser={user}
          accessToken={accessToken}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* AI Chat panel */}
      {showChatPanel && (
        <ChatPanel
          boardId={boardId}
          user={user}
          accessToken={accessToken}
          onClose={() => setShowChatPanel(false)}
          interviewMode={interviewMode}
          onAiFinished={refreshElements}
          initialPrompt={initialAiPrompt}
          onClearInitialPrompt={() => setInitialAiPrompt(null)}
        />
      )}

      {/* Top bar: single row — board name, Share, Chat, Theme */}
      <div className="min-h-12 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors rounded-lg px-2 py-1 -ml-1 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
            Boards
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
          {!interviewMode && elements.length >= 1 && (
            <button
              type="button"
              onClick={clearBoardWithConfirm}
              title="Clear entire board"
              className="text-sm px-3 py-1.5 rounded-lg font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              </svg>
              Clear board
            </button>
          )}
          {user && boardOwnerId === user.id && (
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              title="Share this board"
              className="text-sm px-3 py-1.5 rounded-lg font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share
            </button>
          )}
          {interviewMode && (
            <span className="text-sm px-3 py-1.5 rounded-lg font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/25 flex items-center gap-1.5" title="This is an interview board (set when created)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Interview
            </span>
          )}
          <ThemeSwitcher />
          <button
            type="button"
            onClick={() => setShowChatPanel((v) => !v)}
            title="AI assistant"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 ${showChatPanel ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm shadow-violet-500/25" : "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800/50"}`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z" />
              <path d="M12 10l.75 1.75L14.5 12.5l-1.75.75L12 15l-.75-1.75L9.5 12.5l1.75-.75L12 10z" />
            </svg>
            AI
          </button>
          <button
            type="button"
            onClick={() => setShowBoardChatPanel((v) => !v)}
            title="Chat with collaborators on this board"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 ${showBoardChatPanel ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-sm shadow-sky-500/25" : "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 border border-sky-200 dark:border-sky-800/50"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            Chat
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <button
            type="button"
            onClick={() => setShowVersionHistoryPanel((v) => !v)}
            title="Version history"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${showVersionHistoryPanel ? "bg-amber-500 text-white" : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            History
          </button>
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" aria-hidden />
            Online
          </span>
          <PresenceBar peers={peers} user={user} />
          <UserMenu user={user} onSignOut={async () => { await supabase.auth.signOut(); router.push("/auth"); }} />
        </div>
      </div>

      {/* Version History panel */}
      {showVersionHistoryPanel && (
        <div className="absolute top-0 bottom-0 z-30" style={{ right: showChatPanel ? 340 : showBoardChatPanel ? 320 : 0 }}>
          <VersionHistoryPanel
            boardId={boardId}
            accessToken={accessToken}
            onClose={() => setShowVersionHistoryPanel(false)}
            onRestore={refreshElements}
          />
        </div>
      )}

      {/* Board chat panel — to the left of AI panel when both open */}
      {showBoardChatPanel && (
        <div className="absolute top-0 bottom-0 z-30" style={{ right: showChatPanel ? 340 : 0 }}>
          <BoardChatPanel
            boardId={boardId}
            user={user}
            messages={chatMessages}
            loading={chatLoading}
            onSend={sendMessage}
            onClose={() => setShowBoardChatPanel(false)}
            peerCount={peers.length}
          />
        </div>
      )}

      {/* Interview toolbar */}
      {interviewMode && (
        <InterviewToolbar
          tool={tool}
          onToolChange={setTool}
          onInsertTemplate={insertTemplate}
          onInsertCodeBlock={insertCodeBlock}
          onClearBoard={clearBoardWithConfirm}
        />
      )}

      {/* Bottom toolbar — hidden in interview mode (interview toolbar replaces it) */}
      {!interviewMode && <Toolbar tool={tool} onToolChange={setTool} />}

      {/* FPS badge (normal UI; when ?perf=1 full perf panel is shown instead) */}
      {!perfMode && (
        <div className="absolute bottom-6 left-6 z-20 px-2.5 py-1.5 rounded-lg bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow border border-gray-200/50 dark:border-gray-700/50 text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300 tabular-nums">
          {boardFps} FPS
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-6 right-6 z-20 flex items-center gap-1 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 px-1.5 py-1">
        <button
          type="button"
          onClick={() => setViewport(v => ({ ...v, zoom: Math.max(0.1, v.zoom - 0.25) }))}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Zoom out"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h10" /></svg>
        </button>
        <button
          type="button"
          onClick={() => setViewport(v => ({ ...v, zoom: 1, x: 0, y: 0 }))}
          className="px-2 py-1 text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors min-w-[44px] text-center"
          title="Reset to 100%"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setViewport(v => ({ ...v, zoom: Math.min(5, v.zoom + 0.25) }))}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Zoom in"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h10M8 3v10" /></svg>
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <button
          type="button"
          onClick={() => zoomToElementIds(selectionIds)}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={selectionIds.length > 0 ? "Focus on selection" : "Fit all to screen"}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="4" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2" /></svg>
        </button>
        <button
          type="button"
          onClick={() => zoomToElementIds([])}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Fit to screen"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" /></svg>
        </button>
      </div>

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
        onCreateFreehand={createFreehand}
        onUpdate={updateElement}
        onDelete={deleteElement}
        onDuplicate={duplicateElement}
        onBringToFront={bringToFront}
        onSendToBack={sendToBack}
        onCursorMove={broadcastCursor}
        peers={peers}
        onLocalUpdate={localUpdateElement}
        currentUserId={user?.id ?? null}
        openEditorForId={openEditorForId}
        onOpenEditorFulfilled={() => setOpenEditorForId(null)}
        perfMode={perfMode}
        interviewMode={interviewMode}
        onInsertCodeBlock={interviewMode ? () => { void insertCodeBlock(); } : undefined}
        cursorLatencyRef={cursorLatencyRef}
        syncLatencyRef={syncLatencyRef}
        onStressTest={perfMode ? stressTest : undefined}
        onClearBoard={perfMode ? clearBoardWithConfirm : undefined}
        onSelectionChange={(selectedId, selectedIds) => {
          const ids = selectedId ? [selectedId, ...selectedIds].filter((id, i, arr) => arr.indexOf(id) === i) : [...selectedIds];
          setSelectionIds(ids);
        }}
        onFpsReport={setBoardFps}
      />
    </div>
  );
}
