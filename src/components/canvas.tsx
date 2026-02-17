"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { ColorPicker } from "@/components/color-picker";
import type { BoardElement } from "@/lib/types/database";
import type { Peer } from "@/hooks/use-presence";

interface CanvasProps {
  elements: BoardElement[];
  viewport: { x: number; y: number; zoom: number };
  onViewportChange: (v: { x: number; y: number; zoom: number }) => void;
  tool: "select" | "sticky_note" | "rectangle" | "circle" | "text";
  onToolChange: (t: "select" | "sticky_note" | "rectangle" | "circle" | "text") => void;
  onCreate: (type: "sticky_note" | "rectangle" | "circle" | "text", x: number, y: number) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<BoardElement>) => void;
  onDelete: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
  peers: Peer[];
  onLocalUpdate?: (id: string, updates: Partial<BoardElement>) => void;
  /** Current user id — only they can delete elements they created */
  currentUserId?: string | null;
  /** When set, open inline editor for this element id once it appears in elements */
  openEditorForId?: string | null;
  onOpenEditorFulfilled?: () => void;
}

// Color name labels for cursors
const CURSOR_COLORS = [
  "#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316",
];

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
const HANDLE_SIZE_WORLD = 10;
const MIN_SIZE = 24;

function getResizeHandles(el: BoardElement): { handle: ResizeHandle; x: number; y: number }[] {
  const { x, y, width, height } = el;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    { handle: "nw", x, y },
    { handle: "n", x: cx, y },
    { handle: "ne", x: x + width, y },
    { handle: "e", x: x + width, y: cy },
    { handle: "se", x: x + width, y: y + height },
    { handle: "s", x: cx, y: y + height },
    { handle: "sw", x, y: y + height },
    { handle: "w", x, y: cy },
  ];
}

function hitTestHandle(
  worldX: number,
  worldY: number,
  handles: { handle: ResizeHandle; x: number; y: number }[]
): ResizeHandle | null {
  for (const { handle, x, y } of handles) {
    if (
      worldX >= x - HANDLE_SIZE_WORLD &&
      worldX <= x + HANDLE_SIZE_WORLD &&
      worldY >= y - HANDLE_SIZE_WORLD &&
      worldY <= y + HANDLE_SIZE_WORLD
    )
      return handle;
  }
  return null;
}

function clampSize(v: number) {
  return Math.max(MIN_SIZE, v);
}

export function Canvas({
  elements,
  viewport,
  onViewportChange,
  tool,
  onToolChange,
  onCreate,
  onUpdate,
  onDelete,
  onCursorMove,
  peers,
  onLocalUpdate,
  currentUserId,
  openEditorForId,
  onOpenEditorFulfilled,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effective: themeMode } = useTheme();
  const isDark = themeMode === "dark";
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    handle: ResizeHandle;
    startEl: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // When board asks to open editor for a newly created text element, do it once it appears
  useEffect(() => {
    if (!openEditorForId || !onOpenEditorFulfilled) return;
    const el = elements.find((e) => e.id === openEditorForId);
    if (el) {
      setEditingId(openEditorForId); // eslint-disable-line react-hooks/set-state-in-effect -- intentional prop→state sync
      setEditText(el.text ?? "");
      onOpenEditorFulfilled();
    }
  }, [openEditorForId, onOpenEditorFulfilled, elements]);

  // Screen coords → world coords
  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / viewport.zoom,
    }),
    [viewport]
  );

  // World coords → screen coords
  const worldToScreen = useCallback(
    (wx: number, wy: number) => ({
      x: wx * viewport.zoom + viewport.x,
      y: wy * viewport.zoom + viewport.y,
    }),
    [viewport]
  );

  // Hit test: find element at screen position
  const hitTest = useCallback(
    (sx: number, sy: number) => {
      const { x, y } = screenToWorld(sx, sy);
      // Reverse order so topmost (latest) elements are checked first
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
          return el;
        }
      }
      return null;
    },
    [elements, screenToWorld]
  );

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (isDark) {
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Draw grid
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    const gridSize = 40;
    const startX = Math.floor(-viewport.x / viewport.zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-viewport.y / viewport.zoom / gridSize) * gridSize - gridSize;
    const endX = startX + (rect.width / viewport.zoom) + gridSize * 2;
    const endY = startY + (rect.height / viewport.zoom) + gridSize * 2;

    if (isDark) {
      // Dark mode: subtle dot grid at intersections
      ctx.fillStyle = "#4b5563";
      const dotRadius = 1.2 / viewport.zoom;
      for (let x = startX; x < endX; x += gridSize) {
        for (let y = startY; y < endY; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Light mode: soft lines
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1 / viewport.zoom;
      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
    }

    // Draw elements
    for (const el of elements) {
      const bounds =
        resizing && el.id === resizing.id && resizeDraft
          ? resizeDraft
          : { x: el.x, y: el.y, width: el.width, height: el.height };
      const { x, y, width, height } = bounds;

      ctx.save();

      if (el.type === "sticky_note") {
        ctx.shadowColor = isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 6);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.fillStyle = isDark ? "#f3f4f6" : "#1a1a1a";
        ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
        const lines = wrapText(ctx, el.text, width - 16);
        lines.forEach((line, i) => {
          ctx.fillText(line, x + 8, y + 24 + i * 18);
        });
      } else if (el.type === "rectangle") {
        ctx.fillStyle = el.color + "33";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2 / viewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 4);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          ctx.fillStyle = isDark ? "#f3f4f6" : "#1a1a1a";
          ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
          const lines = wrapText(ctx, el.text, width - 12);
          lines.forEach((line, i) => {
            ctx.fillText(line, x + 6, y + 16 + i * 14);
          });
        }
      } else if (el.type === "circle") {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rx = width / 2;
        const ry = height / 2;
        ctx.fillStyle = el.color + "33";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2 / viewport.zoom;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          ctx.fillStyle = isDark ? "#f3f4f6" : "#1a1a1a";
          ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
          const lines = wrapText(ctx, el.text, width - 12);
          const lineHeight = 14;
          const startY = cy - (lines.length * lineHeight) / 2 + lineHeight / 2;
          lines.forEach((line, i) => {
            const tw = ctx.measureText(line).width;
            ctx.fillText(line, cx - tw / 2, startY + i * lineHeight);
          });
        }
      } else if (el.type === "text") {
        ctx.fillStyle = el.color;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1 / viewport.zoom;
        const r = 4;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, r);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isDark ? "#f3f4f6" : "#1a1a1a";
        ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
        const lines = wrapText(ctx, el.text || "Type here…", width - 12);
        lines.forEach((line, i) => {
          ctx.fillText(line, x + 6, y + 18 + i * 16);
        });
      }

      // Selection outline
      if (el.id === selectedId) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5 / viewport.zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.roundRect(x - 3, y - 3, width + 6, height + 6, 6);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Resize handles (when selected and not resizing)
    if (selectedId && !resizing) {
      const el = elements.find((e) => e.id === selectedId);
      if (el) {
        const handles = getResizeHandles(el);
        ctx.fillStyle = "#3b82f6";
        ctx.strokeStyle = isDark ? "#1f2937" : "#fff";
        ctx.lineWidth = 2 / viewport.zoom;
        for (const { x: hx, y: hy } of handles) {
          const r = HANDLE_SIZE_WORLD / 2;
          ctx.beginPath();
          ctx.arc(hx, hy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // Draw peer cursors (in screen space)
    peers.forEach((peer, i) => {
      if (peer.cursor_x == null || peer.cursor_y == null) return;
      const screen = worldToScreen(peer.cursor_x, peer.cursor_y);
      const color = CURSOR_COLORS[i % CURSOR_COLORS.length];

      ctx.save();
      // Cursor arrow
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x + 2, screen.y + 16);
      ctx.lineTo(screen.x + 8, screen.y + 12);
      ctx.closePath();
      ctx.fill();

      // Name label
      const name = peer.user_email?.split("@")[0] || "User";
      ctx.font = "11px -apple-system, sans-serif";
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(screen.x + 10, screen.y + 12, tw + 8, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(name, screen.x + 14, screen.y + 25);
      ctx.restore();
    });
  }, [elements, viewport, selectedId, resizing, resizeDraft, peers, worldToScreen, isDark]);

  // Redraw when state changes (no continuous rAF loop)
  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Mouse handlers
  function handleMouseDown(e: React.MouseEvent) {
    containerRef.current?.focus({ preventScroll: true });
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (tool === "select") {
      const world = screenToWorld(sx, sy);

      // Resize handle has priority when something is selected
      if (selectedId) {
        const el = elements.find((e) => e.id === selectedId);
        if (el) {
          const handle = hitTestHandle(world.x, world.y, getResizeHandles(el));
          if (handle) {
            setResizing({
              id: el.id,
              handle,
              startEl: { x: el.x, y: el.y, width: el.width, height: el.height },
            });
            setResizeDraft({ x: el.x, y: el.y, width: el.width, height: el.height });
            return;
          }
        }
      }

      const hit = hitTest(sx, sy);
      if (hit) {
        setSelectedId(hit.id);
        setDragging({ id: hit.id, offsetX: world.x - hit.x, offsetY: world.y - hit.y });
      } else {
        setSelectedId(null);
        setPanning(true);
        panStartRef.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      }
    } else if (
      tool === "sticky_note" ||
      tool === "rectangle" ||
      tool === "circle" ||
      tool === "text"
    ) {
      const world = screenToWorld(sx, sy);
      void onCreate(tool, world.x, world.y);
      onToolChange("select");
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Broadcast cursor position in world coords
    const world = screenToWorld(sx, sy);
    onCursorMove(world.x, world.y);

    // Hover detection for cursor feedback
    if (!dragging && !panning && !resizing && tool === "select") {
      const hit = hitTest(sx, sy);
      setHoveredId(hit?.id ?? null);
    }

    if (panning) {
      onViewportChange({
        ...viewport,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }

    if (dragging) {
      const world = screenToWorld(sx, sy);
      if (onLocalUpdate) {
        onLocalUpdate(dragging.id, {
          x: world.x - dragging.offsetX,
          y: world.y - dragging.offsetY,
        });
      } else {
        onUpdate(dragging.id, {
          x: world.x - dragging.offsetX,
          y: world.y - dragging.offsetY,
        });
      }
    }

    if (resizing) {
      const { startEl, handle } = resizing;
      let x: number, y: number, width: number, height: number;
      switch (handle) {
        case "se":
          x = startEl.x;
          y = startEl.y;
          width = clampSize(world.x - startEl.x);
          height = clampSize(world.y - startEl.y);
          break;
        case "s":
          x = startEl.x;
          y = startEl.y;
          width = startEl.width;
          height = clampSize(world.y - startEl.y);
          break;
        case "e":
          x = startEl.x;
          y = startEl.y;
          width = clampSize(world.x - startEl.x);
          height = startEl.height;
          break;
        case "sw":
          x = world.x;
          y = startEl.y;
          width = clampSize(startEl.x + startEl.width - world.x);
          height = clampSize(world.y - startEl.y);
          break;
        case "w":
          x = world.x;
          y = startEl.y;
          width = clampSize(startEl.x + startEl.width - world.x);
          height = startEl.height;
          break;
        case "nw":
          x = world.x;
          y = world.y;
          width = clampSize(startEl.x + startEl.width - world.x);
          height = clampSize(startEl.y + startEl.height - world.y);
          break;
        case "n":
          x = startEl.x;
          y = world.y;
          width = startEl.width;
          height = clampSize(startEl.y + startEl.height - world.y);
          break;
        case "ne":
          x = startEl.x;
          y = world.y;
          width = clampSize(world.x - startEl.x);
          height = clampSize(startEl.y + startEl.height - world.y);
          break;
      }
      setResizeDraft({ x, y, width, height });
    }
  }

  function handleMouseUp() {
    if (resizing && resizeDraft) {
      onUpdate(resizing.id, resizeDraft);
      setResizing(null);
      setResizeDraft(null);
    }
    if (dragging) {
      const el = elements.find((e) => e.id === dragging.id);
      if (el) {
        onUpdate(dragging.id, { x: el.x, y: el.y });
      }
    }
    setDragging(null);
    setPanning(false);
  }

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(viewport.zoom * delta, 0.1), 5);
      const ratio = newZoom / viewport.zoom;
      onViewportChange({
        zoom: newZoom,
        x: sx - (sx - viewport.x) * ratio,
        y: sy - (sy - viewport.y) * ratio,
      });
    },
    [viewport, onViewportChange]
  );

  // Attach wheel with { passive: false } so preventDefault() works (zoom without page scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    if (
      hit &&
      (hit.type === "sticky_note" ||
        hit.type === "rectangle" ||
        hit.type === "circle" ||
        hit.type === "text")
    ) {
      setSelectedId(hit.id);
      setEditingId(hit.id);
      setEditText(hit.text ?? "");
    }
  }

  const selectedElement = selectedId ? elements.find((e) => e.id === selectedId) : null;
  const canDeleteSelected =
    selectedId &&
    !editingId &&
    currentUserId &&
    selectedElement &&
    selectedElement.created_by === currentUserId;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (canDeleteSelected) {
        onDelete(selectedId!);
        setSelectedId(null);
      }
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setEditingId(null);
    }
  }

  // Compute cursor style
  const cursorStyle = (() => {
    if (tool !== "select") return "crosshair";
    if (resizing) {
      const map: Record<ResizeHandle, string> = {
        n: "n-resize",
        s: "s-resize",
        e: "e-resize",
        w: "w-resize",
        ne: "ne-resize",
        nw: "nw-resize",
        se: "se-resize",
        sw: "sw-resize",
      };
      return map[resizing.handle];
    }
    if (dragging) return "grabbing";
    if (panning) return "grabbing";
    if (hoveredId) return "pointer";
    return "default";
  })();

  return (
    <div ref={containerRef} className="flex-1 relative" tabIndex={0} onKeyDown={handleKeyDown}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Empty board hint */}
      {elements.length === 0 && !dragging && !panning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center space-y-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md rounded-2xl px-10 py-8 border border-gray-200/60 dark:border-gray-700/60 shadow-xl shadow-gray-200/30 dark:shadow-black/20">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500 dark:text-blue-400" strokeLinecap="round">
                <path d="M10 4v12M4 10h12" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-200">Your board is empty</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-[220px]">Pick a tool from the toolbar below and click anywhere to start creating</p>
          </div>
        </div>
      )}

      {/* Delete button — only for elements you created */}
      {canDeleteSelected && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete(selectedId!);
              setSelectedId(null);
            }}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 rounded-lg shadow border border-red-200 dark:border-red-800"
          >
            Delete
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">or press Delete key</span>
        </div>
      )}
      {selectedId && !editingId && !canDeleteSelected && selectedElement && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">Only the creator can delete this</span>
        </div>
      )}

      {/* Color picker — floating above selected element */}
      {selectedId && !editingId && selectedElement && (() => {
        const el = selectedElement;
        const screen = worldToScreen(el.x + el.width / 2, el.y);
        return (
          <div
            className="absolute z-30"
            style={{
              left: screen.x,
              top: screen.y - 44,
              transform: "translateX(-50%)",
            }}
          >
            <ColorPicker
              currentColor={el.color}
              elementType={el.type as "sticky_note" | "rectangle" | "circle" | "text"}
              onColorChange={(color) => onUpdate(el.id, { color })}
            />
          </div>
        );
      })()}

      {/* Inline text editor — sized and styled to match each shape */}
      {editingId && (() => {
        const el = elements.find((e) => e.id === editingId);
        if (!el) return null;
        const screen = worldToScreen(el.x, el.y);
        const saveAndClose = () => {
          onUpdate(editingId, { text: editText });
          setEditingId(null);
        };
        const zoom = viewport.zoom;
        const isSticky = el.type === "sticky_note";
        const isCircle = el.type === "circle";
        const isText = el.type === "text";
        const padding = isSticky ? 8 : 6;
        const paddingPx = padding * zoom;
        const fontSize = (isSticky || isText ? 14 : 12) * zoom;
        const lineHeight = isSticky ? 18 : isText ? 16 : 14;
        const lineHeightPx = lineHeight * zoom;
        const w = Math.max(60, el.width * zoom);
        const h = Math.max(lineHeightPx + paddingPx * 2, el.height * zoom);
        return (
          <textarea
            autoFocus
            tabIndex={0}
            aria-label="Edit text"
            className="absolute border-2 border-blue-500 resize-none outline-none z-[100] focus:ring-2 focus:ring-blue-400 box-border"
            style={{
              left: screen.x,
              top: screen.y,
              width: w,
              height: h,
              padding: paddingPx,
              fontSize,
              lineHeight: lineHeightPx,
              textAlign: isCircle ? "center" : "left",
              borderRadius: 4,
              backgroundColor: isSticky ? el.color : `${el.color}22`,
              color: isDark ? "#f3f4f6" : "#1a1a1a",
              pointerEvents: "auto",
            }}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveAndClose}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") saveAndClose();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveAndClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        );
      })()}
    </div>
  );
}

// Helper: wrap text into lines
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [""];
}
