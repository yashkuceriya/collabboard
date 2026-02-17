"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Peer {
  user_id: string;
  user_email: string;
  cursor_x: number | null;
  cursor_y: number | null;
}

type PresencePayload = {
  user_id: string;
  user_email: string;
};

type CursorPayload = {
  user_id: string;
  user_email: string;
  x: number;
  y: number;
};

function buildPresenceList(
  channel: RealtimeChannel,
  currentUserId: string
): Omit<Peer, "cursor_x" | "cursor_y">[] {
  const state = channel.presenceState<PresencePayload>();
  const list: Omit<Peer, "cursor_x" | "cursor_y">[] = [];
  for (const [key, presences] of Object.entries(state)) {
    if (key === currentUserId) continue;
    const raw = Array.isArray(presences) ? presences[0] : (presences as unknown as PresencePayload[])?.[0];
    if (raw?.user_id) {
      list.push({
        user_id: raw.user_id,
        user_email: raw.user_email ?? "Anonymous",
      });
    }
  }
  return list;
}

function mergePeers(
  presenceList: Omit<Peer, "cursor_x" | "cursor_y">[],
  cursorMap: Record<string, { x: number; y: number }>
): Peer[] {
  return presenceList.map((p) => ({
    ...p,
    cursor_x: cursorMap[p.user_id]?.x ?? null,
    cursor_y: cursorMap[p.user_id]?.y ?? null,
  }));
}

export function usePresence(boardId: string, user: User | null) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; });
  const presenceListRef = useRef<Omit<Peer, "cursor_x" | "cursor_y">[]>([]);
  const cursorMapRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (!boardId || typeof boardId !== "string" || boardId === "undefined" || !user) {
      return;
    }

    subscribedRef.current = false;
    channelRef.current = null;
    presenceListRef.current = [];
    cursorMapRef.current = {};
    const channelName = `board-${boardId}`;
    let cancelled = false;

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase.channel(channelName, {
        config: {
          presence: { key: user.id },
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;

      const flushPeers = () => {
        setPeers(mergePeers(presenceListRef.current, cursorMapRef.current));
      };

      const updatePresence = () => {
        const u = userRef.current;
        if (u) {
          presenceListRef.current = buildPresenceList(channel, u.id);
          flushPeers();
        }
      };

      channel
        .on("presence", { event: "sync" }, updatePresence)
        .on("presence", { event: "join" }, updatePresence)
        .on("presence", { event: "leave" }, updatePresence)
        .on("broadcast", { event: "cursor" }, (payload: unknown) => {
          const p = (payload && typeof payload === "object" && "payload" in payload
            ? (payload as { payload: CursorPayload }).payload
            : payload) as CursorPayload;
          if (p?.user_id != null && typeof p.x === "number" && typeof p.y === "number") {
            cursorMapRef.current = {
              ...cursorMapRef.current,
              [p.user_id]: { x: p.x, y: p.y },
            };
            flushPeers();
          }
        })
        .subscribe(async (status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            subscribedRef.current = true;
            await channel.track({
              user_id: user.id,
              user_email: user.email ?? "Anonymous",
            });
            updatePresence();
          } else {
            subscribedRef.current = false;
          }
        });
    })();

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      presenceListRef.current = [];
      cursorMapRef.current = {};
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) ch.unsubscribe();
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, user?.id]);

  const lastSend = useRef(0);
  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      if (!subscribedRef.current || !channelRef.current || !user) return;
      const now = Date.now();
      if (now - lastSend.current < 35) return;
      lastSend.current = now;

      channelRef.current.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          user_id: user.id,
          user_email: user.email ?? "Anonymous",
          x,
          y,
        },
      });
    },
    [user]
  );

  return { peers, broadcastCursor };
}
