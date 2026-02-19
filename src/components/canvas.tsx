"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { ColorPicker } from "@/components/color-picker";
import { FormatPanel } from "@/components/format-panel";
import type { BoardElement } from "@/lib/types/database";
import type { Peer } from "@/hooks/use-presence";

type ToolId = "select" | "sticky_note" | "rectangle" | "circle" | "text" | "connector" | "pen" | "eraser";

interface CanvasProps {
  elements: BoardElement[];
  viewport: { x: number; y: number; zoom: number };
  onViewportChange: (v: { x: number; y: number; zoom: number }) => void;
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
  onCreate: (type: "sticky_note" | "rectangle" | "circle" | "text", x: number, y: number, width?: number, height?: number) => void | Promise<void>;
  onCreateConnector?: (fromId: string, toId: string) => void | Promise<void | string | null>;
  onCreateFreehand?: (points: { x: number; y: number }[], strokeColor?: string) => void | Promise<string | null>;
  onUpdate: (id: string, updates: Partial<BoardElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void | Promise<string | null>;
  onBringToFront?: (id: string) => void;
  onSendToBack?: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
  peers: Peer[];
  onLocalUpdate?: (id: string, updates: Partial<BoardElement>) => void;
  /** Current user id — only they can delete elements they created */
  currentUserId?: string | null;
  /** When set, open inline editor for this element id once it appears in elements */
  openEditorForId?: string | null;
  onOpenEditorFulfilled?: () => void;
  /** Show FPS meter (for ?perf=1) */
  perfMode?: boolean;
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

const MIN_DRAW_SIZE = 24;

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function clipToRectEdge(
  cx: number, cy: number, w: number, h: number, tx: number, ty: number
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = w / 2;
  const hh = h / 2;
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function clipToEllipseEdge(
  cx: number, cy: number, rx: number, ry: number, tx: number, ty: number
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx + rx, y: cy };
  const angle = Math.atan2(dy, dx);
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function clipToShapeEdge(el: BoardElement, targetX: number, targetY: number): { x: number; y: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  if (el.type === "circle") {
    return clipToEllipseEdge(cx, cy, el.width / 2, el.height / 2, targetX, targetY);
  }
  return clipToRectEdge(cx, cy, el.width, el.height, targetX, targetY);
}

function getConnectorEndpoints(
  el: BoardElement,
  elements: BoardElement[]
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (el.type !== "connector") return null;
  const props = el.properties as Record<string, string> | undefined;
  const fromId = props?.fromId;
  const toId = props?.toId;
  if (!fromId || !toId) return null;
  const fromEl = elements.find((e) => e.id === fromId && e.type !== "connector");
  const toEl = elements.find((e) => e.id === toId && e.type !== "connector");
  if (!fromEl || !toEl) return null;
  const fromCenter = { x: fromEl.x + fromEl.width / 2, y: fromEl.y + fromEl.height / 2 };
  const toCenter = { x: toEl.x + toEl.width / 2, y: toEl.y + toEl.height / 2 };
  const start = clipToShapeEdge(fromEl, toCenter.x, toCenter.y);
  const end = clipToShapeEdge(toEl, fromCenter.x, fromCenter.y);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastTextColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.4 ? "#1a1a1a" : "#f3f4f6";
}

function getElementTextColor(el: BoardElement, isDark: boolean): string {
  const props = el.properties as Record<string, string> | undefined;
  if (props?.textColor) return props.textColor;
  if (el.type === "sticky_note") return getContrastTextColor(el.color);
  if (el.type === "text") return getContrastTextColor(el.color);
  return isDark ? "#f3f4f6" : "#1a1a1a";
}

type FontSizeKey = "small" | "medium" | "large" | "xl";
const FONT_SIZE_MAP: Record<FontSizeKey, { canvas: number; lineHeight: number }> = {
  small: { canvas: 12, lineHeight: 16 },
  medium: { canvas: 14, lineHeight: 20 },
  large: { canvas: 18, lineHeight: 24 },
  xl: { canvas: 22, lineHeight: 28 },
};

function getElementFontSize(el: BoardElement): { canvas: number; lineHeight: number } {
  const props = el.properties as Record<string, string> | undefined;
  const key = (props?.fontSize || "medium") as FontSizeKey;
  return FONT_SIZE_MAP[key] || FONT_SIZE_MAP.medium;
}

type FontFamilyKey = "sans" | "serif" | "mono" | "hand";
const FONT_FAMILY_MAP: Record<FontFamilyKey, { canvas: string; css: string }> = {
  sans: { canvas: "-apple-system, BlinkMacSystemFont, sans-serif", css: "-apple-system, BlinkMacSystemFont, sans-serif" },
  serif: { canvas: "Georgia, 'Times New Roman', serif", css: "Georgia, 'Times New Roman', serif" },
  mono: { canvas: "'Courier New', Courier, monospace", css: "'Courier New', Courier, monospace" },
  hand: { canvas: "'Segoe Script', 'Comic Sans MS', cursive", css: "'Segoe Script', 'Comic Sans MS', cursive" },
};

function getElementFontFamily(el: BoardElement): { canvas: string; css: string } {
  const props = el.properties as Record<string, string> | undefined;
  const key = (props?.fontFamily || "sans") as FontFamilyKey;
  return FONT_FAMILY_MAP[key] || FONT_FAMILY_MAP.sans;
}

type FontWeightKey = "normal" | "bold";
function getElementFontWeight(el: BoardElement): FontWeightKey {
  const props = el.properties as Record<string, string> | undefined;
  const v = props?.fontWeight as string | undefined;
  return v === "bold" ? "bold" : "normal";
}

type FontStyleKey = "normal" | "italic";
function getElementFontStyle(el: BoardElement): FontStyleKey {
  const props = el.properties as Record<string, string> | undefined;
  const v = props?.fontStyle as string | undefined;
  return v === "italic" ? "italic" : "normal";
}

type TextAlignKey = "left" | "center" | "right";
function getElementTextAlign(el: BoardElement): TextAlignKey {
  const props = el.properties as Record<string, string> | undefined;
  const v = props?.textAlign as string | undefined;
  if (v === "center" || v === "right") return v;
  return "left";
}

function buildCanvasFont(el: BoardElement): string {
  const size = getElementFontSize(el);
  const family = getElementFontFamily(el);
  const weight = getElementFontWeight(el);
  const style = getElementFontStyle(el);
  return `${style} ${weight} ${size.canvas}px ${family.canvas}`;
}

export function Canvas({
  elements,
  viewport,
  onViewportChange,
  tool,
  onToolChange,
  onCreate,
  onCreateConnector,
  onCreateFreehand,
  onUpdate,
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onCursorMove,
  peers,
  onLocalUpdate,
  currentUserId,
  openEditorForId,
  onOpenEditorFulfilled,
  perfMode = false,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawCountRef = useRef(0);
  const [fps, setFps] = useState(0);
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
  const [drawDraft, setDrawDraft] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [connectorFromId, setConnectorFromId] = useState<string | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<{ x: number; y: number } | null>(null);
  const [formatPanelOpen, setFormatPanelOpen] = useState(false);
  const [strokePoints, setStrokePoints] = useState<{ x: number; y: number }[]>([]);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Place cursor at start (top) when opening text editor
  useEffect(() => {
    if (!editingId) return;
    const ta = editTextareaRef.current;
    if (ta) {
      let id2: number | undefined;
      const run = () => {
        ta.focus();
        ta.setSelectionRange(0, 0);
        ta.scrollTop = 0;
      };
      const id1 = requestAnimationFrame(() => {
        run();
        id2 = requestAnimationFrame(run); // after layout so view stays at top
      });
      return () => {
        cancelAnimationFrame(id1);
        if (id2 !== undefined) cancelAnimationFrame(id2);
      };
    }
  }, [editingId]);

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

  // Hit test: find element at screen position (shapes first, then connectors by distance to line)
  const hitTest = useCallback(
    (sx: number, sy: number) => {
      const { x, y } = screenToWorld(sx, sy);
      const threshold = 12 / viewport.zoom;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === "connector") {
          const pts = getConnectorEndpoints(el, elements);
          if (pts && distanceToSegment(x, y, pts.x1, pts.y1, pts.x2, pts.y2) <= threshold) return el;
        } else if (el.type === "freehand") {
          const pts = (el.properties as { points?: { x: number; y: number }[] })?.points;
          if (pts && pts.length >= 2) {
            for (let j = 0; j < pts.length - 1; j++) {
              if (distanceToSegment(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) <= threshold) return el;
            }
          }
        } else if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
          return el;
        }
      }
      return null;
    },
    [elements, screenToWorld, viewport.zoom]
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
    ctx.fillStyle = isDark ? "#030712" : "#fafafa";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    const gridSize = 40;
    const startX = Math.floor(-viewport.x / viewport.zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-viewport.y / viewport.zoom / gridSize) * gridSize - gridSize;
    const endX = startX + (rect.width / viewport.zoom) + gridSize * 2;
    const endY = startY + (rect.height / viewport.zoom) + gridSize * 2;

    {
      ctx.fillStyle = isDark ? "#374151" : "#d1d5db";
      const dotRadius = (isDark ? 1.2 : 1) / viewport.zoom;
      for (let gx = startX; gx < endX; gx += gridSize) {
        for (let gy = startY; gy < endY; gy += gridSize) {
          ctx.beginPath();
          ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Viewport culling: only draw elements that intersect the visible area (helps 500+ objects)
    const vw = rect.width / viewport.zoom;
    const vh = rect.height / viewport.zoom;
    const vx = -viewport.x / viewport.zoom;
    const vy = -viewport.y / viewport.zoom;
    const inView = (ex: number, ey: number, ew: number, eh: number) =>
      ex + ew >= vx && ex <= vx + vw && ey + eh >= vy && ey <= vy + vh;

    // Draw elements (skip connectors; they are drawn after)
    for (const el of elements) {
      if (el.type === "connector") continue;
      const bounds =
        resizing && el.id === resizing.id && resizeDraft
          ? resizeDraft
          : { x: el.x, y: el.y, width: el.width, height: el.height };
      const { x, y, width, height } = bounds;
      if (!inView(x, y, width, height)) continue;

      ctx.save();

      const rotation = (el.properties as { rotation?: number } | undefined)?.rotation ?? 0;
      if (rotation && (el.type === "sticky_note" || el.type === "rectangle" || el.type === "circle" || el.type === "text")) {
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }

      if (el.type === "sticky_note") {
        ctx.shadowColor = isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.10)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 8);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = isDark ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1 / viewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 8);
        ctx.stroke();

        const stickyFont = getElementFontSize(el);
        ctx.fillStyle = getElementTextColor(el, isDark);
        ctx.font = buildCanvasFont(el);
        const lines = wrapText(ctx, el.text, width - 20);
        const stickyAlign = getElementTextAlign(el);
        const pad = 10;
        lines.forEach((line, i) => {
          const lineY = y + pad + stickyFont.canvas + i * stickyFont.lineHeight;
          const tw = ctx.measureText(line).width;
          const lineX = stickyAlign === "center" ? x + width / 2 - tw / 2 : stickyAlign === "right" ? x + width - pad - tw : x + pad;
          ctx.fillText(line, lineX, lineY);
        });
      } else if (el.type === "rectangle") {
        ctx.fillStyle = el.color + "22";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2 / viewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 6);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          const rectFont = getElementFontSize(el);
          ctx.fillStyle = getElementTextColor(el, isDark);
          ctx.font = buildCanvasFont(el);
          const lines = wrapText(ctx, el.text, width - 14);
          const rectAlign = getElementTextAlign(el);
          const rPad = 7;
          lines.forEach((line, i) => {
            const lineY = y + 8 + rectFont.canvas + i * rectFont.lineHeight;
            const tw = ctx.measureText(line).width;
            const lineX = rectAlign === "center" ? x + width / 2 - tw / 2 : rectAlign === "right" ? x + width - rPad - tw : x + rPad;
            ctx.fillText(line, lineX, lineY);
          });
        }
      } else if (el.type === "circle") {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rx = width / 2;
        const ry = height / 2;
        ctx.fillStyle = el.color + "22";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2 / viewport.zoom;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          const circFont = getElementFontSize(el);
          ctx.fillStyle = getElementTextColor(el, isDark);
          ctx.font = buildCanvasFont(el);
          const lines = wrapText(ctx, el.text, width - 12);
          const startY = cy - (lines.length * circFont.lineHeight) / 2 + circFont.lineHeight / 2;
          lines.forEach((line, i) => {
            const tw = ctx.measureText(line).width;
            ctx.fillText(line, cx - tw / 2, startY + i * circFont.lineHeight);
          });
        }
      } else if (el.type === "text") {
        ctx.fillStyle = el.color + "22";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1.5 / viewport.zoom;
        const r = 6;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, r);
        ctx.fill();
        ctx.stroke();
        const textFont = getElementFontSize(el);
        ctx.fillStyle = getElementTextColor(el, isDark);
        ctx.font = buildCanvasFont(el);
        const lines = wrapText(ctx, el.text || "Type here…", width - 12);
        const textAlign = getElementTextAlign(el);
        const tPad = 6;
        lines.forEach((line, i) => {
          const lineY = y + 8 + textFont.canvas + i * textFont.lineHeight;
          const tw = ctx.measureText(line).width;
          const lineX = textAlign === "center" ? x + width / 2 - tw / 2 : textAlign === "right" ? x + width - tPad - tw : x + tPad;
          ctx.fillText(line, lineX, lineY);
        });
      } else if (el.type === "freehand") {
        const pts = (el.properties as { points?: { x: number; y: number }[] })?.points;
        if (pts && pts.length >= 2) {
          ctx.strokeStyle = el.color;
          ctx.lineWidth = Math.max(2 / viewport.zoom, 2);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
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

    // Draw connectors (arrows) — cull if line bbox is out of view
    const strokeColor = isDark ? "#94a3b8" : "#64748b";
    const arrowLen = 14 / viewport.zoom;
    for (const el of elements) {
      if (el.type !== "connector") continue;
      const pts = getConnectorEndpoints(el, elements);
      if (!pts) continue;
      const cx = Math.min(pts.x1, pts.x2);
      const cy = Math.min(pts.y1, pts.y2);
      const cw = Math.abs(pts.x2 - pts.x1);
      const ch = Math.abs(pts.y2 - pts.y1);
      if (!inView(cx, cy, cw || 1, ch || 1)) continue;
      ctx.save();
      ctx.strokeStyle = el.id === selectedId ? "#3b82f6" : strokeColor;
      ctx.lineWidth = (el.id === selectedId ? 2.5 : 2) / viewport.zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts.x1, pts.y1);
      ctx.lineTo(pts.x2, pts.y2);
      ctx.stroke();
      const angle = Math.atan2(pts.y2 - pts.y1, pts.x2 - pts.x1);
      ctx.fillStyle = el.id === selectedId ? "#3b82f6" : strokeColor;
      ctx.beginPath();
      ctx.moveTo(pts.x2, pts.y2);
      ctx.lineTo(pts.x2 - arrowLen * Math.cos(angle - 0.4), pts.y2 - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(pts.x2 - arrowLen * Math.cos(angle + 0.4), pts.y2 - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw-by-drag preview (rectangle / circle)
    if (drawDraft && (tool === "rectangle" || tool === "circle")) {
      const x = Math.min(drawDraft.startX, drawDraft.currentX);
      const y = Math.min(drawDraft.startY, drawDraft.currentY);
      const w = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentX - drawDraft.startX));
      const h = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentY - drawDraft.startY));
      ctx.save();
      ctx.strokeStyle = tool === "rectangle" ? "#42A5F5" : "#10B981";
      ctx.lineWidth = 2 / viewport.zoom;
      ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
      if (tool === "rectangle") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Connector drag preview (edge to cursor)
    if (connectorFromId && connectorPreview) {
      const fromEl = elements.find((e) => e.id === connectorFromId && e.type !== "connector");
      if (fromEl) {
        const edgePt = clipToShapeEdge(fromEl, connectorPreview.x, connectorPreview.y);
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2 / viewport.zoom;
        ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
        ctx.beginPath();
        ctx.moveTo(edgePt.x, edgePt.y);
        ctx.lineTo(connectorPreview.x, connectorPreview.y);
        ctx.stroke();
        const angle = Math.atan2(connectorPreview.y - edgePt.y, connectorPreview.x - edgePt.x);
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.moveTo(connectorPreview.x, connectorPreview.y);
        ctx.lineTo(
          connectorPreview.x - arrowLen * Math.cos(angle - 0.4),
          connectorPreview.y - arrowLen * Math.sin(angle - 0.4)
        );
        ctx.lineTo(
          connectorPreview.x - arrowLen * Math.cos(angle + 0.4),
          connectorPreview.y - arrowLen * Math.sin(angle + 0.4)
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Pen stroke preview
    if (tool === "pen" && strokePoints.length >= 2) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(2 / viewport.zoom, 2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(strokePoints[0].x, strokePoints[0].y);
      for (let i = 1; i < strokePoints.length; i++) ctx.lineTo(strokePoints[i].x, strokePoints[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // Resize handles (when selected and not resizing; only for non-connector, non-freehand elements)
    if (selectedId && !resizing) {
      const el = elements.find((e) => e.id === selectedId);
      if (el && el.type !== "connector" && el.type !== "freehand") {
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
    if (perfMode) drawCountRef.current++;
  }, [elements, viewport, selectedId, resizing, resizeDraft, peers, worldToScreen, isDark, drawDraft, tool, connectorFromId, connectorPreview, strokePoints, perfMode]);

  // FPS sampling when perf mode is on
  useEffect(() => {
    if (!perfMode) return;
    const id = setInterval(() => {
      setFps(drawCountRef.current);
      drawCountRef.current = 0;
    }, 1000);
    return () => clearInterval(id);
  }, [perfMode]);

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
    const world = screenToWorld(sx, sy);

    if (tool === "pen") {
      setStrokePoints([{ x: world.x, y: world.y }]);
      return;
    }
    if (tool === "eraser") {
      const hit = hitTest(sx, sy);
      if (hit) onDelete(hit.id);
      return;
    }

    if (tool === "select") {
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
    } else if (tool === "connector") {
      const hit = hitTest(sx, sy);
      if (hit && hit.type !== "connector") {
        setConnectorFromId(hit.id);
        setConnectorPreview({ x: world.x, y: world.y });
      } else {
        setSelectedId(null);
        setConnectorFromId(null);
        setConnectorPreview(null);
        // Don't start panning — use Select tool to pan. Keeps connector mode clear.
      }
    } else if (tool === "rectangle" || tool === "circle") {
      setDrawDraft({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
    } else if (tool === "sticky_note" || tool === "text") {
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

    // Pen stroke: append point while dragging (with small threshold to reduce points)
    if (strokePoints.length > 0) {
      const last = strokePoints[strokePoints.length - 1];
      const dx = world.x - last.x, dy = world.y - last.y;
      if (dx * dx + dy * dy > 4) setStrokePoints((prev) => [...prev, { x: world.x, y: world.y }]);
    }

    // Hover detection for cursor feedback
    if (!dragging && !panning && !resizing && !drawDraft && !connectorFromId && tool === "select") {
      const hit = hitTest(sx, sy);
      setHoveredId(hit?.id ?? null);
    }

    if (drawDraft) {
      setDrawDraft((d) => (d ? { ...d, currentX: world.x, currentY: world.y } : null));
    }
    if (connectorFromId) {
      setConnectorPreview({ x: world.x, y: world.y });
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

  function handleMouseUp(e?: React.MouseEvent) {
    if (strokePoints.length >= 2 && onCreateFreehand) {
      void onCreateFreehand([...strokePoints]);
      setStrokePoints([]);
    }
    if (drawDraft && (tool === "rectangle" || tool === "circle")) {
      const x = Math.min(drawDraft.startX, drawDraft.currentX);
      const y = Math.min(drawDraft.startY, drawDraft.currentY);
      const w = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentX - drawDraft.startX));
      const h = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentY - drawDraft.startY));
      void onCreate(tool, x, y, w, h);
      onToolChange("select");
      setDrawDraft(null);
    }
    if (connectorFromId) {
      if (canvasRef.current && e) {
        const rect = canvasRef.current.getBoundingClientRect();
        const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit && hit.id !== connectorFromId && hit.type !== "connector" && onCreateConnector) {
          void onCreateConnector(connectorFromId, hit.id);
          onToolChange("select");
        }
      }
      setConnectorFromId(null);
      setConnectorPreview(null);
    }
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
      const isPinchZoom = e.ctrlKey || e.metaKey;
      if (isPinchZoom) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(viewport.zoom * delta, 0.1), 5);
        const ratio = newZoom / viewport.zoom;
        onViewportChange({
          zoom: newZoom,
          x: sx - (sx - viewport.x) * ratio,
          y: sy - (sy - viewport.y) * ratio,
        });
      } else {
        // Two-finger swipe → pan
        onViewportChange({
          ...viewport,
          x: viewport.x - e.deltaX,
          y: viewport.y - e.deltaY,
        });
      }
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
  useEffect(() => {
    if (!selectedId) setFormatPanelOpen(false);
  }, [selectedId]);
  const canDeleteSelected =
    selectedId &&
    !editingId &&
    currentUserId &&
    selectedElement &&
    selectedElement.created_by === currentUserId;
  const showColorPicker = selectedElement && selectedElement.type !== "connector";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingId) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (canDeleteSelected) {
        onDelete(selectedId!);
        setSelectedId(null);
      }
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setEditingId(null);
      setFormatPanelOpen(false);
    }
    if (e.key === "d" && (e.metaKey || e.ctrlKey) && selectedId && onDuplicate && selectedElement?.type !== "connector") {
      e.preventDefault();
      void onDuplicate(selectedId);
      return;
    }
    const key = e.key.toLowerCase();
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (key === "v") onToolChange("select");
      else if (key === "n") onToolChange("sticky_note");
      else if (key === "r") onToolChange("rectangle");
      else if (key === "o") onToolChange("circle");
      else if (key === "t") onToolChange("text");
      else if (key === "a") onToolChange("connector");
    }
  }

  // Compute cursor style
  const cursorStyle = (() => {
    if (drawDraft || connectorFromId) return "crosshair";
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
      {/* Perf overlay: FPS (add ?perf=1 to board URL) */}
      {perfMode && (
        <div className="absolute top-3 left-3 z-50 px-2.5 py-1.5 rounded-lg bg-gray-900/90 text-green-400 font-mono text-sm tabular-nums">
          FPS: {fps}
        </div>
      )}
      {/* Connector tool hint — makes it clear arrows connect shapes */}
      {tool === "connector" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-xs font-medium shadow-lg border border-gray-700/50 dark:border-gray-300/50">
          Click a shape, then another to connect them with an arrow
        </div>
      )}

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

      {/* Empty board hint with quick-start actions */}
      {elements.length === 0 && !dragging && !panning && !drawDraft && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl px-8 py-7 border border-gray-200/50 dark:border-gray-700/50 shadow-xl pointer-events-auto">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mx-auto mb-3 shadow-sm">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Your board is empty</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5 max-w-[280px]">Get started by adding an element</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  const cx = (containerRef.current?.clientWidth ?? 800) / 2;
                  const cy = (containerRef.current?.clientHeight ?? 600) / 2;
                  const world = screenToWorld(cx, cy);
                  void onCreate("sticky_note", world.x, world.y);
                }}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 border border-yellow-200 dark:border-yellow-800/50 transition-colors"
              >
                Sticky Note
              </button>
              <button
                type="button"
                onClick={() => { onToolChange("rectangle"); }}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/50 transition-colors"
              >
                Rectangle
              </button>
              <button
                type="button"
                onClick={() => { onToolChange("circle"); }}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/50 transition-colors"
              >
                Circle
              </button>
              <button
                type="button"
                onClick={() => {
                  const cx = (containerRef.current?.clientWidth ?? 800) / 2;
                  const cy = (containerRef.current?.clientHeight ?? 600) / 2;
                  const world = screenToWorld(cx, cy);
                  void onCreate("text", world.x, world.y);
                }}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-800/50 transition-colors"
              >
                Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate + Delete + Layer buttons — tethered to selected element */}
      {selectedId && !editingId && selectedElement && selectedElement.type !== "connector" && (() => {
        const el = selectedElement;
        const anchor = worldToScreen(el.x + el.width + 8, el.y - 4);
        return (
          <div
            className="absolute z-20 flex items-center gap-2 flex-wrap"
            style={{ left: anchor.x, top: anchor.y, transform: "translate(0, -50%)" }}
          >
            {onDuplicate && (
              <button
                type="button"
                onClick={() => {
                  void onDuplicate(selectedId);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg shadow border border-gray-200 dark:border-gray-700 whitespace-nowrap"
                title="Duplicate (Ctrl+D)"
              >
                Duplicate
              </button>
            )}
            {(onBringToFront || onSendToBack) && (
              <>
                {onBringToFront && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBringToFront(selectedId); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700"
                    title="Bring to front"
                  >
                    Front
                  </button>
                )}
                {onSendToBack && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSendToBack(selectedId); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700"
                    title="Send to back"
                  >
                    Back
                  </button>
                )}
              </>
            )}
            {canDeleteSelected && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(selectedId!);
                    setSelectedId(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 rounded-lg shadow-md border border-red-200 dark:border-red-800 whitespace-nowrap"
                >
                  Delete
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">or Del</span>
              </>
            )}
          </div>
        );
      })()}
      {selectedId && !editingId && !canDeleteSelected && selectedElement && selectedElement.type !== "connector" && (() => {
        const el = selectedElement;
        const anchor = worldToScreen(el.x + el.width + 8, el.y - 4);
        return (
          <div
            className="absolute z-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow border border-gray-200 dark:border-gray-700"
            style={{ left: anchor.x, top: anchor.y, transform: "translate(0, -50%)" }}
          >
            <span className="text-xs text-gray-500 dark:text-gray-400">Only the creator can delete this</span>
          </div>
        );
      })()}

      {/* Color picker — to the right of selected element so it doesn't cover content (not for connectors) */}
      {selectedId && !editingId && showColorPicker && (() => {
        const el = selectedElement!;
        const anchor = worldToScreen(el.x + el.width + 16, el.y + el.height / 2);
        const props = el.properties as Record<string, string> | undefined;
        const currentTextColor = props?.textColor || "";
        const currentFontSize = (props?.fontSize || "medium") as "small" | "medium" | "large" | "xl";
        const currentFontFamily = (props?.fontFamily || "sans") as "sans" | "serif" | "mono" | "hand";
        const currentFontWeight = (props?.fontWeight === "bold" ? "bold" : "normal") as "normal" | "bold";
        const currentFontStyle = (props?.fontStyle === "italic" ? "italic" : "normal") as "normal" | "italic";
        const currentTextAlign = (props?.textAlign === "center" || props?.textAlign === "right" ? props.textAlign : "left") as "left" | "center" | "right";
        const mergeProps = (patch: Record<string, unknown>) => {
          const existingProps = (el.properties as Record<string, unknown>) || {};
          onUpdate(el.id, { properties: { ...existingProps, ...patch } as BoardElement["properties"] });
        };
        return (
          <div
            className="absolute z-30"
            style={{
              left: anchor.x,
              top: anchor.y,
              transform: "translate(0, -50%)",
            }}
          >
            <div className="flex items-center gap-2">
              <ColorPicker
                currentColor={el.color}
                elementType={el.type as "sticky_note" | "rectangle" | "circle" | "text"}
                onColorChange={(color) => onUpdate(el.id, { color })}
                textColor={currentTextColor}
                onTextColorChange={(textColor) => mergeProps({ textColor })}
                fontSize={currentFontSize}
                onFontSizeChange={(fontSize) => mergeProps({ fontSize })}
                fontFamily={currentFontFamily}
                onFontFamilyChange={(fontFamily) => mergeProps({ fontFamily })}
                fontWeight={currentFontWeight}
                onFontWeightChange={(fontWeight) => mergeProps({ fontWeight })}
                fontStyle={currentFontStyle}
                onFontStyleChange={(fontStyle) => mergeProps({ fontStyle })}
                {...(el.type !== "circle" && {
                  textAlign: currentTextAlign,
                  onTextAlignChange: (textAlign: "left" | "center" | "right") => mergeProps({ textAlign }),
                })}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFormatPanelOpen(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 flex items-center gap-1.5"
                title="Open format panel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v18M3 12h18" />
                  <path d="M7 7h.01M7 17h.01M17 7h.01M17 17h.01" />
                </svg>
                Panel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Slide-out Format panel — full controls when an element is selected */}
      {formatPanelOpen && selectedId && !editingId && showColorPicker && selectedElement && (() => {
        const el = selectedElement;
        const props = el.properties as Record<string, string> | undefined;
        const currentTextColor = props?.textColor || "";
        const currentFontSize = (props?.fontSize || "medium") as "small" | "medium" | "large" | "xl";
        const currentFontFamily = (props?.fontFamily || "sans") as "sans" | "serif" | "mono" | "hand";
        const currentFontWeight = (props?.fontWeight === "bold" ? "bold" : "normal") as "normal" | "bold";
        const currentFontStyle = (props?.fontStyle === "italic" ? "italic" : "normal") as "normal" | "italic";
        const currentTextAlign = (props?.textAlign === "center" || props?.textAlign === "right" ? props.textAlign : "left") as "left" | "center" | "right";
        const mergeProps = (patch: Record<string, unknown>) => {
          const existingProps = (el.properties as Record<string, unknown>) || {};
          onUpdate(el.id, { properties: { ...existingProps, ...patch } as BoardElement["properties"] });
        };
        return (
          <div className="absolute inset-y-0 right-0 w-[280px] z-40 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl transition-transform duration-200 ease-out">
            <FormatPanel
              currentColor={el.color}
              elementType={el.type as "sticky_note" | "rectangle" | "circle" | "text"}
              onColorChange={(color) => onUpdate(el.id, { color })}
              textColor={currentTextColor}
              onTextColorChange={(textColor) => mergeProps({ textColor })}
              fontSize={currentFontSize}
              onFontSizeChange={(fontSize) => mergeProps({ fontSize })}
              fontFamily={currentFontFamily}
              onFontFamilyChange={(fontFamily) => mergeProps({ fontFamily })}
              fontWeight={currentFontWeight}
              onFontWeightChange={(fontWeight) => mergeProps({ fontWeight })}
              fontStyle={currentFontStyle}
              onFontStyleChange={(fontStyle) => mergeProps({ fontStyle })}
              {...(el.type !== "circle" && {
                textAlign: currentTextAlign,
                onTextAlignChange: (textAlign: "left" | "center" | "right") => mergeProps({ textAlign }),
              })}
              rotation={typeof props?.rotation === "number" ? props.rotation : 0}
              onRotationChange={(r) => mergeProps({ rotation: r })}
              onClose={() => setFormatPanelOpen(false)}
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
        const padding = isSticky ? 8 : 6;
        const paddingPx = padding * zoom;
        const elFont = getElementFontSize(el);
        const elFF = getElementFontFamily(el);
        const fontWeight = getElementFontWeight(el);
        const fontStyle = getElementFontStyle(el);
        const textAlign = isCircle ? "center" : getElementTextAlign(el);
        const fontSize = elFont.canvas * zoom;
        const lineHeightPx = elFont.lineHeight * zoom;
        const w = Math.max(60, el.width * zoom);
        const h = Math.max(lineHeightPx + paddingPx * 2, el.height * zoom);
        const isCodeBlock = el.type === "text" && ((el.properties as Record<string, string>)?.fontFamily === "mono");
        const minH = el.type === "text" ? Math.max(h, 120) : h;
        return (
          <textarea
            ref={editTextareaRef}
            autoFocus
            tabIndex={0}
            aria-label="Edit text"
            className={`absolute border-2 resize-none outline-none z-[100] focus:ring-2 focus:ring-blue-400 box-border ${isCodeBlock ? "border-blue-600 dark:border-blue-400" : "border-blue-500"}`}
            style={{
              left: screen.x,
              top: screen.y,
              width: w,
              height: minH,
              minHeight: el.type === "text" ? 120 : undefined,
              padding: paddingPx,
              fontSize,
              lineHeight: lineHeightPx,
              fontFamily: elFF.css,
              fontWeight,
              fontStyle,
              textAlign,
              borderRadius: 4,
              ...(isCodeBlock && { borderLeft: `3px solid ${isDark ? "rgb(96 165 250)" : "rgb(37 99 235)"}` }),
              backgroundColor: isSticky ? el.color : `${el.color}22`,
              color: getElementTextColor(el, isDark),
              pointerEvents: "auto",
              overflow: "auto",
            }}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveAndClose}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") saveAndClose();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
