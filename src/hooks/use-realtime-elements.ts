"use client";

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { BoardElement } from "@/lib/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

type SetElements = React.Dispatch<React.SetStateAction<BoardElement[]>>;

function normalizeRow(row: Record<string, unknown>): BoardElement {
  return {
    id: row.id as string,
    board_id: row.board_id as string,
    type: row.type as BoardElement["type"],
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    color: (row.color as string) ?? "#FFEB3B",
    text: (row.text as string) ?? "",
    properties: (row.properties as BoardElement["properties"]) ?? {},
    created_by: row.created_by as string,
    updated_at: row.updated_at as string,
    created_at: row.created_at as string,
  };
}

export function useRealtimeElements(boardId: string, setElements: SetElements) {
  const setElementsRef = useRef(setElements);
  useEffect(() => { setElementsRef.current = setElements; });
  const channelRef = useRef<RealtimeChannel | null>(null);

  const addToState = useCallback((newEl: BoardElement) => {
    setElementsRef.current((prev) => {
      if (prev.some((e) => e.id === newEl.id)) return prev;
      return [...prev, newEl].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, []);

  const removeFromState = useCallback((id: string) => {
    setElementsRef.current((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    if (!boardId || typeof boardId !== "string") return;

    const channelName = `board-elements:${boardId}`;

    const channel = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "board_elements",
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const newEl = normalizeRow((payload.new as Record<string, unknown>) ?? {});
          addToState(newEl);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "board_elements",
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const updated = normalizeRow((payload.new as Record<string, unknown>) ?? {});
          setElementsRef.current((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "board_elements",
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) removeFromState(deletedId);
        }
      )
      .on("broadcast", { event: "element_added" }, (payload: unknown) => {
        const raw = (payload && typeof payload === "object" && "payload" in payload
          ? (payload as { payload: Record<string, unknown> }).payload
          : payload) as Record<string, unknown>;
        if (raw?.id) {
          if (typeof raw._ts === "number" && typeof window !== "undefined" && window.location.search.includes("perf=1")) {
            console.log("[perf] object sync latency (ms):", Date.now() - raw._ts);
          }
          const { _ts: _, ...rest } = raw;
          addToState(normalizeRow(rest));
        }
      })
      .on("broadcast", { event: "element_updated" }, (payload: unknown) => {
        const raw = (payload && typeof payload === "object" && "payload" in payload
          ? (payload as { payload: Record<string, unknown> }).payload
          : payload) as Record<string, unknown>;
        if (raw?.id) {
          if (typeof raw._ts === "number" && typeof window !== "undefined" && window.location.search.includes("perf=1")) {
            console.log("[perf] object sync (update) latency (ms):", Date.now() - raw._ts);
          }
          const { _ts: __, ...rest } = raw;
          const updated = normalizeRow(rest);
          setElementsRef.current((prev) =>
            prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
          );
        }
      })
      .on("broadcast", { event: "element_deleted" }, (payload: unknown) => {
        const raw = (payload && typeof payload === "object" && "payload" in payload
          ? (payload as { payload: { id?: string } }).payload
          : payload) as { id?: string };
        if (raw?.id) removeFromState(raw.id);
      });

    channelRef.current = channel;

    channel.subscribe();
    void supabase.realtime.setAuth();

    return () => {
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) ch.unsubscribe();
    };
  }, [boardId, addToState, removeFromState]);

  const broadcastElement = useCallback(
    (element: BoardElement) => {
      const ch = channelRef.current;
      if (!ch) return;
      ch.send({
        type: "broadcast",
        event: "element_added",
        payload: { ...element, _ts: Date.now() } as Record<string, unknown>,
      });
    },
    []
  );

  const broadcastElementDeleted = useCallback((id: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({
      type: "broadcast",
      event: "element_deleted",
      payload: { id },
    });
  }, []);

  const broadcastElementUpdated = useCallback(
    (id: string, updates: Partial<BoardElement>) => {
      const ch = channelRef.current;
      if (!ch) return;
      setElementsRef.current((prev) => {
        const el = prev.find((e) => e.id === id);
        if (el) {
          ch.send({
            type: "broadcast",
            event: "element_updated",
            payload: { ...el, ...updates, _ts: Date.now() } as Record<string, unknown>,
          });
        }
        return prev;
      });
    },
    []
  );

  return { broadcastElement, broadcastElementUpdated, broadcastElementDeleted };
}
