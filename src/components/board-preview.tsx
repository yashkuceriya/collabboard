"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { BoardElement } from "@/lib/types/database";

const PREVIEW_W = 280;
const PREVIEW_H = 120;
const MAX_ELEMENTS = 40;

export function BoardPreview({ boardId }: { boardId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<BoardElement[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("board_elements")
        .select("id, type, x, y, width, height, color, properties")
        .eq("board_id", boardId)
        .order("created_at", { ascending: true })
        .limit(MAX_ELEMENTS);
      if (cancelled) return;
      setElements((data as BoardElement[]) || []);
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  useEffect(() => {
    const channel = supabase
      .channel(`board-preview-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_elements", filter: `board_id=eq.${boardId}` },
        () => {
          supabase
            .from("board_elements")
            .select("id, type, x, y, width, height, color, properties")
            .eq("board_id", boardId)
            .order("created_at", { ascending: true })
            .limit(MAX_ELEMENTS)
            .then(({ data }) => setElements((data as BoardElement[]) || []));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId]);

  useEffect(() => {
    if (elements.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nonConnector = elements.filter((e) => e.type !== "connector");
    if (nonConnector.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of nonConnector) {
      const x2 = el.x + el.width;
      const y2 = el.y + el.height;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    }
    const rangeX = Math.max(maxX - minX, 100);
    const rangeY = Math.max(maxY - minY, 100);
    const pad = 8;
    const scale = Math.min((PREVIEW_W - pad * 2) / rangeX, (PREVIEW_H - pad * 2) / rangeY);
    const tx = pad - minX * scale;
    const ty = pad - minY * scale;

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
    for (const el of nonConnector) {
      const x = el.x * scale + tx;
      const y = el.y * scale + ty;
      const w = Math.max(2, el.width * scale);
      const h = Math.max(2, el.height * scale);
      if (el.type === "sticky_note" || el.type === "rectangle" || el.type === "circle" || el.type === "text" || el.type === "frame") {
        ctx.fillStyle = el.color + "dd";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1;
        if (el.type === "circle") {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (el.type === "line") {
        const props = el.properties as { x2?: number; y2?: number } | undefined;
        const x2 = x + (props?.x2 ?? el.width) * scale;
        const y2 = y + (props?.y2 ?? el.height) * scale;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }, [elements]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      className="w-full h-[120px] object-cover bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
      style={{ width: "100%", height: 120 }}
    />
  );
}
