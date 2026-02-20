"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { BoardChatMessage } from "@/lib/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

const PAGE_SIZE = 50;

export function useBoardChat(boardId: string | null, user: { id: string; email?: string | null } | null) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!boardId || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when board/user unmounts
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("board_chat_messages")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;
      if (!error) setMessages(((data as BoardChatMessage[]) ?? []).reverse());
      setLoading(false);
    })();

    const channel = supabase
      .channel(`board-chat-${boardId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_chat_messages", filter: `board_id=eq.${boardId}` },
        (payload) => {
          const row = payload.new as BoardChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [boardId, user]);

  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !boardId || !user) return;
      await supabase.from("board_chat_messages").insert({
        board_id: boardId,
        user_id: user.id,
        user_email: user.email ?? "Anonymous",
        body: trimmed,
      } as never);
    },
    [boardId, user]
  );

  return { messages, loading, sendMessage };
}
