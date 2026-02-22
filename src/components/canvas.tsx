"use client";

import { useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo } from "react";
import { useTheme } from "@/components/theme-provider";
import { FormatPanel } from "@/components/format-panel";
import { PerfPanel } from "@/components/perf-panel";
import type { BoardElement, Json } from "@/lib/types/database";
import type { Peer } from "@/hooks/use-presence";
import { getDisplayName } from "@/lib/display-name";

type ToolId = "select" | "sticky_note" | "rectangle" | "circle" | "line" | "text" | "connector" | "pen" | "eraser" | "frame";

interface CanvasProps {
  elements: BoardElement[];
  viewport: { x: number; y: number; zoom: number };
  onViewportChange: (v: { x: number; y: number; zoom: number }) => void;
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
  onCreate: (type: "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "line", x: number, y: number, width?: number, height?: number) => void | Promise<void>;
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
  /** Interview board mode — changes empty board hint and quick actions */
  interviewMode?: boolean;
  /** When provided (e.g. interview mode), empty-state "Code Block" calls this instead of creating a small text */
  onInsertCodeBlock?: () => void | Promise<void>;
  /** Ref for cursor sync latency (ms) — from usePresence */
  cursorLatencyRef?: React.RefObject<number | null>;
  /** Ref for object sync latency (ms) — from useRealtimeElements */
  syncLatencyRef?: React.RefObject<number | null>;
  /** Bulk-generate N objects for stress testing (perf panel) */
  onStressTest?: (count: number) => Promise<void>;
  /** Clear all objects (perf panel) */
  onClearBoard?: () => void;
  /** Called when selection changes — used e.g. for "Zoom to selection" */
  onSelectionChange?: (selectedId: string | null, selectedIds: string[]) => void;
  /** Called every second with current FPS (for optional badge in normal UI) */
  onFpsReport?: (fps: number) => void;
}

// Color name labels for cursors
const CURSOR_COLORS = [
  "#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316",
];

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
const HANDLE_SIZE_WORLD = 8;
/** Hit area for handles (larger than visual for easier grabbing) */
const HANDLE_HIT_SLOP = 8;
const MIN_SIZE = 24;
/** Inset (px) so only elements fully inside the frame bounds are captured */
const FRAME_INSET = 2;

const ROTATION_HANDLE_OFFSET = 44;
const ROTATION_HANDLE_RADIUS = 8;
const CARDINAL_SNAP_DEG = 2;

function rotatePoint(px: number, py: number, cx: number, cy: number, rad: number): { x: number; y: number } {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  };
}

function getRotationHandlePos(el: { x: number; y: number; width: number; height: number }, zoom: number): { x: number; y: number } {
  return {
    x: el.x + el.width / 2,
    y: el.y + el.height + ROTATION_HANDLE_OFFSET / zoom,
  };
}

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

function isOnRotationHandle(
  worldX: number, worldY: number,
  el: { x: number; y: number; width: number; height: number },
  zoom: number,
): boolean {
  const handle = getRotationHandlePos(el, zoom);
  const hitRadius = (ROTATION_HANDLE_RADIUS + 4) / zoom;
  return Math.hypot(worldX - handle.x, worldY - handle.y) <= hitRadius;
}

function hitTestHandle(
  worldX: number,
  worldY: number,
  handles: { handle: ResizeHandle; x: number; y: number }[]
): ResizeHandle | null {
  for (const { handle, x, y } of handles) {
    if (
      worldX >= x - HANDLE_HIT_SLOP &&
      worldX <= x + HANDLE_HIT_SLOP &&
      worldY >= y - HANDLE_HIT_SLOP &&
      worldY <= y + HANDLE_HIT_SLOP
    )
      return handle;
  }
  return null;
}

function clampSize(v: number) {
  return Math.max(MIN_SIZE, v);
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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
  const rot = (el.properties as { rotation?: number } | null | undefined)?.rotation ?? 0;
  const rad = (rot * Math.PI) / 180;

  if (el.type === "circle") {
    return clipToEllipseEdge(cx, cy, el.width / 2, el.height / 2, targetX, targetY);
  }

  if (rot === 0) return clipToRectEdge(cx, cy, el.width, el.height, targetX, targetY);

  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const localTx = (targetX - cx) * cos - (targetY - cy) * sin;
  const localTy = (targetX - cx) * sin + (targetY - cy) * cos;
  const local = clipToRectEdge(0, 0, el.width, el.height, localTx, localTy);
  return {
    x: cx + local.x * Math.cos(rad) - local.y * Math.sin(rad),
    y: cy + local.x * Math.sin(rad) + local.y * Math.cos(rad),
  };
}

const SPATIAL_CELL = 250;
const SPATIAL_INDEX_THRESHOLD = 80;

function buildSpatialIndex(elements: BoardElement[]): Map<string, BoardElement[]> {
  const index = new Map<string, BoardElement[]>();
  for (const el of elements) {
    if (el.type === "connector") continue;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const key = `${Math.floor(cx / SPATIAL_CELL)},${Math.floor(cy / SPATIAL_CELL)}`;
    const list = index.get(key) ?? [];
    list.push(el);
    index.set(key, list);
  }
  return index;
}

const CONNECTABLE_TYPES = new Set(["sticky_note", "rectangle", "circle", "text", "frame"]);

function getShapeAnchors(el: BoardElement): { x: number; y: number }[] {
  if (!CONNECTABLE_TYPES.has(el.type)) return [];
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rot = (el.properties as { rotation?: number } | undefined)?.rotation ?? 0;
  const localAnchors = [
    { x: cx, y: el.y },
    { x: el.x + el.width, y: cy },
    { x: cx, y: el.y + el.height },
    { x: el.x, y: cy },
  ];
  if (rot === 0) return localAnchors;
  const rad = (rot * Math.PI) / 180;
  return localAnchors.map((a) => rotatePoint(a.x, a.y, cx, cy, rad));
}

function getConnectorEndpoints(
  el: BoardElement,
  elementsOrMap: BoardElement[] | Map<string, BoardElement>
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (el.type !== "connector") return null;
  const props = el.properties as Record<string, string> | undefined;
  const fromId = props?.fromId;
  const toId = props?.toId;
  if (!fromId || !toId) return null;
  const fromEl = elementsOrMap instanceof Map ? elementsOrMap.get(fromId) : elementsOrMap.find((e) => e.id === fromId && e.type !== "connector");
  const toEl = elementsOrMap instanceof Map ? elementsOrMap.get(toId) : elementsOrMap.find((e) => e.id === toId && e.type !== "connector");
  if (!fromEl || !toEl || fromEl.type === "connector" || toEl.type === "connector") return null;
  const fromCenter = { x: fromEl.x + fromEl.width / 2, y: fromEl.y + fromEl.height / 2 };
  const toCenter = { x: toEl.x + toEl.width / 2, y: toEl.y + toEl.height / 2 };
  const start = clipToShapeEdge(fromEl, toCenter.x, toCenter.y);
  const end = clipToShapeEdge(toEl, fromCenter.x, fromCenter.y);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

// Curved connector: quadratic Bezier control point offset (world units). Miro-style: curve scales with distance.
function getConnectorCurve(distance: number): number {
  return Math.min(56, Math.max(20, distance * 0.18));
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

// Text wrapping cache — avoids expensive measureText calls on every frame
// Cache is keyed by "font|maxWidth|text" and cleared when elements change
const wrapTextCache = new Map<string, string[]>();

function wrapTextCached(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  const key = `${font}|${Math.round(maxWidth)}|${text}`;
  const cached = wrapTextCache.get(key);
  if (cached) return cached;
  ctx.font = font;
  const result = wrapText(ctx, text, maxWidth);
  wrapTextCache.set(key, result);
  return result;
}

function invalidateWrapCache() {
  wrapTextCache.clear();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
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
  interviewMode = false,
  onInsertCodeBlock,
  cursorLatencyRef,
  syncLatencyRef,
  onStressTest,
  onClearBoard,
  onSelectionChange,
  onFpsReport,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  // FPS state updated by the continuous rAF loop
  const [fps, setFps] = useState(0);
  const { effective: themeMode } = useTheme();
  const isDark = themeMode === "dark";
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; });
  // Sync pending viewport when parent updates (e.g. zoom 100% / +/- buttons) so canvas applies immediately
  useEffect(() => {
    pendingViewportRef.current = viewport;
  }, [viewport]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    onSelectionChange?.(selectedId, Array.from(selectedIds));
  }, [selectedId, selectedIds, onSelectionChange]);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
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
  const [rotating, setRotating] = useState<{
    id: string;
    startAngle: number;
    startRotation: number;
  } | null>(null);
  const [rotationDraft, setRotationDraft] = useState<number | null>(null);
  const rotationVelocityRef = useRef(0);
  const lastRotationTimeRef = useRef(0);
  const rotationMouseScreenRef = useRef<{ x: number; y: number } | null>(null);
  const [drawDraft, setDrawDraft] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [connectorFromId, setConnectorFromId] = useState<string | null>(null);
  const [connectorFromPoint, setConnectorFromPoint] = useState<{ x: number; y: number } | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<{ x: number; y: number } | null>(null);
  const [connectorSnapTargetId, setConnectorSnapTargetId] = useState<string | null>(null);
  const [formatPanelOpen, setFormatPanelOpen] = useState(false);
  const [strokePoints, setStrokePoints] = useState<{ x: number; y: number }[]>([]);
  const [isErasing, setIsErasing] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [caretPosition, setCaretPosition] = useState<{ left: number; top: number; height: number } | null>(null);
  const [textareaScroll, setTextareaScroll] = useState({ scrollLeft: 0, scrollTop: 0 });
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<BoardElement[]>([]);

  // When board asks to open editor for a newly created text element, do it once it appears
  useEffect(() => {
    if (!openEditorForId || !onOpenEditorFulfilled) return;
    const el = elements.find((e) => e.id === openEditorForId);
    if (el) {
      setEditingId(openEditorForId);
      setEditText(el.text ?? "");
      onOpenEditorFulfilled();
    }
  }, [openEditorForId, onOpenEditorFulfilled, elements]);

  // Place cursor at start (top) for all editable text: stickies, shapes, text/code blocks.
  // Run when editor opens and again after React has committed value so typing starts at top.
  const editingIdRef = useRef<string | null>(null);
  const runCursorToTop = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, 0);
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, []);
  // When opening the editor for any shape (sticky, rectangle, circle, text, frame), cursor starts at start.
  // Only run once on open; delayed runs are not used so we don't reset the cursor after the user types.
  useLayoutEffect(() => {
    if (!editingId) return;
    editingIdRef.current = editingId;
    setSelectionStart(0);
    setTextareaScroll({ scrollLeft: 0, scrollTop: 0 });
    runCursorToTop(editTextareaRef.current);
    const id1 = requestAnimationFrame(() => runCursorToTop(editTextareaRef.current));
    return () => cancelAnimationFrame(id1);
  }, [editingId, runCursorToTop]);

  // Measure caret position for thin-caret overlay (1px line instead of native thick caret)
  useLayoutEffect(() => {
    if (!editingId || !measureRef.current) {
      setCaretPosition(null);
      return;
    }
    const el = elements.find((e) => e.id === editingId);
    if (!el) {
      setCaretPosition(null);
      return;
    }
    const zoom = viewport.zoom;
    const elFont = getElementFontSize(el);
    const lineHeightPx = elFont.lineHeight * zoom;
    const div = measureRef.current;
    div.innerHTML = escapeHtml(editText.substring(0, selectionStart)) + '<span data-caret-marker></span>';
    const span = div.querySelector("[data-caret-marker]");
    if (span instanceof HTMLElement) {
      setCaretPosition({
        left: span.offsetLeft,
        top: span.offsetTop,
        height: lineHeightPx,
      });
    } else {
      setCaretPosition(null);
    }
  }, [editingId, editText, selectionStart, elements, viewport.zoom]);

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

  // Memoized sorted elements: frames first, then shapes, connectors skipped in draw loop
  const sortedElements = useMemo(
    () => {
      invalidateWrapCache();
      return [...elements].sort((a, b) => {
        if (a.type === "frame" && b.type !== "frame") return -1;
        if (a.type !== "frame" && b.type === "frame") return 1;
        return 0;
      });
    },
    [elements]
  );

  // Track visible count for perf panel
  const visibleCountRef = useRef(0);

  // Hit test: find element at screen position (shapes first, then connectors by distance to line)
  const spatialIndex = useMemo(
    () => (elements.length > SPATIAL_INDEX_THRESHOLD ? buildSpatialIndex(elements) : null),
    [elements]
  );

  const idToElement = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  function pointInRotatedBox(
    wx: number,
    wy: number,
    el: { x: number; y: number; width: number; height: number; properties?: unknown }
  ): boolean {
    const rot = (el.properties as { rotation?: number } | null | undefined)?.rotation ?? 0;
    if (rot === 0)
      return wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    const lx = (wx - cx) * cos - (wy - cy) * sin;
    const ly = (wx - cx) * sin + (wy - cy) * cos;
    const hw = el.width / 2;
    const hh = el.height / 2;
    return lx >= -hw && lx <= hw && ly >= -hh && ly <= hh;
  }

  const hitTest = useCallback(
    (sx: number, sy: number) => {
      const { x, y } = screenToWorld(sx, sy);
      const threshold = 12 / viewport.zoom;
      const boxCandidates = spatialIndex
        ? (spatialIndex.get(`${Math.floor(x / SPATIAL_CELL)},${Math.floor(y / SPATIAL_CELL)}`) ?? [])
        : elements;
      for (let i = boxCandidates.length - 1; i >= 0; i--) {
        const el = boxCandidates[i];
        if (el.type === "freehand") {
          const rot = (el.properties as { rotation?: number } | undefined)?.rotation ?? 0;
          if (rot !== 0) {
            if (pointInRotatedBox(x, y, el)) return el;
          } else {
            const pts = (el.properties as { points?: { x: number; y: number }[] })?.points;
            if (pts && pts.length >= 2) {
              for (let j = 0; j < pts.length - 1; j++) {
                if (distanceToSegment(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) <= threshold) return el;
              }
            }
          }
        } else if (el.type === "line") {
          const rot = (el.properties as { rotation?: number } | undefined)?.rotation ?? 0;
          if (rot !== 0) {
            if (pointInRotatedBox(x, y, el)) return el;
          } else {
            const props = el.properties as { x2?: number; y2?: number } | undefined;
            const x2 = el.x + (props?.x2 ?? el.width);
            const y2 = el.y + (props?.y2 ?? el.height);
            if (distanceToSegment(x, y, el.x, el.y, x2, y2) <= threshold) return el;
          }
        } else if (pointInRotatedBox(x, y, el)) {
          return el;
        }
      }
      if (spatialIndex) {
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
          if (el.type !== "connector") continue;
          const pts = getConnectorEndpoints(el, idToElement);
          if (pts && distanceToSegment(x, y, pts.x1, pts.y1, pts.x2, pts.y2) <= threshold) return el;
        }
      }
      return null;
    },
    [elements, screenToWorld, viewport.zoom, spatialIndex, idToElement]
  );

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const effectiveViewport = pendingViewportRef.current ?? viewport;

    const dpr = window.devicePixelRatio || 1;
    if (!canvasRectRef.current) canvasRectRef.current = canvas.getBoundingClientRect();
    const rect = canvasRectRef.current;
    const newW = Math.round(rect.width * dpr);
    const newH = Math.round(rect.height * dpr);
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = isDark ? "#030712" : "#fafafa";
      ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid
    ctx.save();
    ctx.translate(effectiveViewport.x, effectiveViewport.y);
    ctx.scale(effectiveViewport.zoom, effectiveViewport.zoom);

    // Adaptive grid: coarser when zoomed out so we draw fewer dots (Figma/Miro smoothness)
    const gridSize = effectiveViewport.zoom < 0.25 ? 160 : effectiveViewport.zoom < 0.5 ? 80 : 40;
    const startX = Math.floor(-effectiveViewport.x / effectiveViewport.zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-effectiveViewport.y / effectiveViewport.zoom / gridSize) * gridSize - gridSize;
    const endX = startX + (rect.width / effectiveViewport.zoom) + gridSize * 2;
    const endY = startY + (rect.height / effectiveViewport.zoom) + gridSize * 2;
    const maxGridDots = 2500;
    const gridCols = Math.min(Math.ceil((endX - startX) / gridSize), Math.ceil(Math.sqrt(maxGridDots)));
    const gridRows = Math.min(Math.ceil((endY - startY) / gridSize), Math.ceil(maxGridDots / gridCols));

    if (effectiveViewport.zoom > 0.15 && gridCols > 0 && gridRows > 0) {
      const gridAlpha = effectiveViewport.zoom < 0.3 ? (effectiveViewport.zoom - 0.15) / 0.15
        : effectiveViewport.zoom > 4 ? Math.max(0, (5 - effectiveViewport.zoom))
        : 1;
      ctx.globalAlpha = gridAlpha;
      ctx.fillStyle = isDark ? "rgba(55,65,81,0.7)" : "rgba(0,0,0,0.08)";
      const dotSize = (isDark ? 2 : 1.5) / effectiveViewport.zoom;
      const half = dotSize / 2;
      for (let gy = 0; gy < gridRows; gy++) {
        for (let gx = 0; gx < gridCols; gx++) {
          const wx = startX + gx * gridSize;
          const wy = startY + gy * gridSize;
          ctx.fillRect(wx - half, wy - half, dotSize, dotSize);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Viewport culling: only draw elements that intersect the visible area (helps 500+ objects)
    const vw = rect.width / effectiveViewport.zoom;
    const vh = rect.height / effectiveViewport.zoom;
    const vx = -effectiveViewport.x / effectiveViewport.zoom;
    const vy = -effectiveViewport.y / effectiveViewport.zoom;
    const inView = (ex: number, ey: number, ew: number, eh: number) =>
      ex + ew >= vx && ex <= vx + vw && ey + eh >= vy && ey <= vy + vh;

    // Level-of-detail: when zoomed out, draw simple rects only (Figma/Miro-style smooth zoom)
    const LOD_ZOOM = 0.4;
    const useLOD = effectiveViewport.zoom < LOD_ZOOM;

    // Draw frames first (behind other elements), then non-frames, then connectors
    let visibleDrawn = 0;
    for (const el of sortedElements) {
      if (el.type === "connector") continue;
      const bounds =
        resizing && el.id === resizing.id && resizeDraft
          ? resizeDraft
          : { x: el.x, y: el.y, width: el.width, height: el.height };
      const { x, y, width, height } = bounds;
      if (!inView(x, y, width, height)) continue;
      visibleDrawn++;

      ctx.save();

      const baseRotation = (el.properties as { rotation?: number } | undefined)?.rotation ?? 0;
      const rotation = selectedId === el.id && rotationDraft !== null ? rotationDraft : baseRotation;
      const rotatableTypes = ["sticky_note", "rectangle", "circle", "text", "frame", "line", "freehand"];
      if (rotation && rotatableTypes.includes(el.type)) {
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }

      // LOD: zoomed out — draw only colored rect (no text, shadows, or detail)
      if (useLOD) {
        if (el.type === "freehand") {
          const pts = (el.properties as { points?: { x: number; y: number }[] })?.points;
          if (pts && pts.length >= 2) {
            ctx.strokeStyle = el.color;
            ctx.lineWidth = Math.max(2 / effectiveViewport.zoom, 2);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += Math.max(1, Math.floor(pts.length / 50))) ctx.lineTo(pts[i].x, pts[i].y);
            if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.stroke();
          }
        } else {
          const color = el.color ?? "#6366F1";
          ctx.fillStyle = el.type === "frame" ? color + "18" : el.type === "sticky_note" ? color : color + "22";
          const r = el.type === "sticky_note" ? 8 : el.type === "frame" ? 10 : 6;
          if (el.type === "circle") {
            const cx = x + width / 2, cy = y + height / 2, rx = width / 2, ry = height / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, r);
            ctx.fill();
          }
        }
      } else if (el.type === "sticky_note") {
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
        ctx.lineWidth = 1 / effectiveViewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 8);
        ctx.stroke();

        const stickyFont = getElementFontSize(el);
        ctx.fillStyle = getElementTextColor(el, isDark);
        const stickyCanvasFont = buildCanvasFont(el);
        ctx.font = stickyCanvasFont;
        const lines = wrapTextCached(ctx, el.text, width - 20, stickyCanvasFont);
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
        ctx.lineWidth = 2 / effectiveViewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 6);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          const rectFont = getElementFontSize(el);
          ctx.fillStyle = getElementTextColor(el, isDark);
          const rectCanvasFont = buildCanvasFont(el);
          ctx.font = rectCanvasFont;
          const lines = wrapTextCached(ctx, el.text, width - 14, rectCanvasFont);
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
        ctx.lineWidth = 2 / effectiveViewport.zoom;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (el.text) {
          const circFont = getElementFontSize(el);
          ctx.fillStyle = getElementTextColor(el, isDark);
          const circCanvasFont = buildCanvasFont(el);
          ctx.font = circCanvasFont;
          const lines = wrapTextCached(ctx, el.text, width - 12, circCanvasFont);
          const startY = cy - (lines.length * circFont.lineHeight) / 2 + circFont.lineHeight / 2;
          lines.forEach((line, i) => {
            const tw = ctx.measureText(line).width;
            ctx.fillText(line, cx - tw / 2, startY + i * circFont.lineHeight);
          });
        }
      } else if (el.type === "text") {
        ctx.fillStyle = el.color + "22";
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1.5 / effectiveViewport.zoom;
        const r = 6;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, r);
        ctx.fill();
        ctx.stroke();
        const textFont = getElementFontSize(el);
        ctx.fillStyle = getElementTextColor(el, isDark);
        const textCanvasFont = buildCanvasFont(el);
        ctx.font = textCanvasFont;
        const lines = wrapTextCached(ctx, el.text || "Type here…", width - 12, textCanvasFont);
        const textAlign = getElementTextAlign(el);
        const tPad = 6;
        lines.forEach((line, i) => {
          const lineY = y + 8 + textFont.canvas + i * textFont.lineHeight;
          const tw = ctx.measureText(line).width;
          const lineX = textAlign === "center" ? x + width / 2 - tw / 2 : textAlign === "right" ? x + width - tPad - tw : x + tPad;
          ctx.fillText(line, lineX, lineY);
        });
      } else if (el.type === "line") {
        const props = el.properties as { x2?: number; y2?: number } | undefined;
        const x2 = x + (props?.x2 ?? width);
        const y2 = y + (props?.y2 ?? height);
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2.5 / effectiveViewport.zoom;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (el.type === "frame") {
        ctx.fillStyle = (el.color ?? "#6366F1") + "08";
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 10);
        ctx.fill();
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2 / effectiveViewport.zoom;
        ctx.setLineDash([8 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 10);
        ctx.stroke();
        ctx.setLineDash([]);
        if (el.text) {
          const labelSize = Math.max(12, 14 / effectiveViewport.zoom);
          ctx.fillStyle = isDark ? "#e5e7eb" : "#374151";
          ctx.font = `bold ${labelSize}px Inter, system-ui, sans-serif`;
          const labelBgW = ctx.measureText(el.text).width + 16;
          ctx.fillStyle = isDark ? "rgba(17,24,39,0.85)" : "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.roundRect(x + 8, y - labelSize - 6, labelBgW, labelSize + 8, 4);
          ctx.fill();
          ctx.fillStyle = el.color;
          ctx.fillText(el.text, x + 16, y - 6);
        }
      } else if (el.type === "freehand") {
        const pts = (el.properties as { points?: { x: number; y: number }[] })?.points;
        if (pts && pts.length >= 2) {
          ctx.strokeStyle = el.color;
          ctx.lineWidth = Math.max(2 / effectiveViewport.zoom, 2);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }

      // Highlight elements that belong to the selected frame
      const elFrameId = (el.properties as { frameId?: string } | undefined)?.frameId;
      const isFrameChild = elFrameId && elFrameId === selectedId;

      // Hover highlight — subtle blue outline (Miro-style)
      if (el.id === hoveredId && el.id !== selectedId && !selectedIds.has(el.id) && !isFrameChild) {
        const hGap = 2 / effectiveViewport.zoom;
        const hCornerR = 4 / effectiveViewport.zoom;
        ctx.strokeStyle = isDark ? "rgba(96,165,250,0.4)" : "rgba(59,130,246,0.35)";
        ctx.lineWidth = 1.5 / effectiveViewport.zoom;
        ctx.beginPath();
        ctx.roundRect(x - hGap, y - hGap, width + hGap * 2, height + hGap * 2, hCornerR);
        ctx.stroke();
      }

      // Selection outline — single thin border (Miro/Figma-style). For text, cap size to avoid huge box when selected.
      if (el.id === selectedId || selectedIds.has(el.id) || isFrameChild) {
        const gap = 4 / effectiveViewport.zoom;
        const cornerR = 6 / effectiveViewport.zoom;
        const maxOutline = 1200;
        const ow = el.type === "text" ? Math.min(width, maxOutline) : width;
        const oh = el.type === "text" ? Math.min(height, maxOutline) : height;
        const isPrimary = el.id === selectedId;
        ctx.save();
        if (isPrimary) {
          ctx.shadowColor = "#3b82f6";
          ctx.shadowBlur = 6 / effectiveViewport.zoom;
        }
        ctx.strokeStyle = isFrameChild ? "#818cf8" : (isDark ? "#60a5fa" : "#3b82f6");
        ctx.lineWidth = (isPrimary ? 2 : 1.5) / effectiveViewport.zoom;
        ctx.setLineDash(isFrameChild || (!isPrimary && selectedIds.has(el.id)) ? [5 / effectiveViewport.zoom, 3 / effectiveViewport.zoom] : []);
        ctx.beginPath();
        ctx.roundRect(x - gap, y - gap, ow + gap * 2, oh + gap * 2, cornerR);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.restore();
    }

    // Draw connectors (arrows) — cull if line bbox is out of view
    const strokeColor = isDark ? "#94a3b8" : "#64748b";
    const arrowLen = 14 / effectiveViewport.zoom;
    for (const el of elements) {
      if (el.type !== "connector") continue;
      const pts = getConnectorEndpoints(el, idToElement);
      if (!pts) continue;
      const bx = Math.min(pts.x1, pts.x2);
      const by = Math.min(pts.y1, pts.y2);
      const bw = Math.abs(pts.x2 - pts.x1);
      const bh = Math.abs(pts.y2 - pts.y1);
      if (!inView(bx, by, bw || 1, bh || 1)) continue;
      ctx.save();
      const connColor = el.color && el.color !== "#64748b" ? el.color : (el.id === selectedId ? "#3b82f6" : strokeColor);
      ctx.strokeStyle = el.id === selectedId ? "#3b82f6" : connColor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const connProps = el.properties as { style?: string; route?: string; thickness?: string } | undefined;
      const connStyle = connProps?.style;
      const connRoute = connProps?.route ?? "curved";
      const thicknessMap: Record<string, number> = { thin: 1.2, medium: 2, thick: 4 };
      const lineW = (thicknessMap[connProps?.thickness ?? "medium"] ?? 2) / effectiveViewport.zoom;
      ctx.lineWidth = el.id === selectedId ? lineW * 1.3 : lineW;
      if (connStyle === "dashed") ctx.setLineDash([8 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);

      let arrowAngle: number;

      if (connRoute === "straight") {
        ctx.beginPath();
        ctx.moveTo(pts.x1, pts.y1);
        ctx.lineTo(pts.x2, pts.y2);
        ctx.stroke();
        arrowAngle = Math.atan2(pts.y2 - pts.y1, pts.x2 - pts.x1);
      } else if (connRoute === "orthogonal") {
        const midX = (pts.x1 + pts.x2) / 2;
        ctx.beginPath();
        ctx.moveTo(pts.x1, pts.y1);
        ctx.lineTo(midX, pts.y1);
        ctx.lineTo(midX, pts.y2);
        ctx.lineTo(pts.x2, pts.y2);
        ctx.stroke();
        arrowAngle = Math.atan2(0, pts.x2 > midX ? 1 : -1);
      } else {
        const midX = (pts.x1 + pts.x2) / 2;
        const midY = (pts.y1 + pts.y2) / 2;
        const dx = pts.x2 - pts.x1;
        const dy = pts.y2 - pts.y1;
        const len = Math.hypot(dx, dy) || 1;
        const curve = getConnectorCurve(len);
        const perpX = (-dy / len) * curve;
        const perpY = (dx / len) * curve;
        const ctrlX = midX + perpX;
        const ctrlY = midY + perpY;
        ctx.beginPath();
        ctx.moveTo(pts.x1, pts.y1);
        ctx.quadraticCurveTo(ctrlX, ctrlY, pts.x2, pts.y2);
        ctx.stroke();
        arrowAngle = Math.atan2(pts.y2 - ctrlY, pts.x2 - ctrlX);
      }

      if (connStyle === "dashed") ctx.setLineDash([]);
      const arrowColor = el.id === selectedId ? "#3b82f6" : strokeColor;
      ctx.fillStyle = arrowColor;
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = (1.5 / effectiveViewport.zoom);
      ctx.beginPath();
      ctx.moveTo(pts.x2, pts.y2);
      ctx.lineTo(pts.x2 - arrowLen * Math.cos(arrowAngle - 0.4), pts.y2 - arrowLen * Math.sin(arrowAngle - 0.4));
      ctx.lineTo(pts.x2 - arrowLen * Math.cos(arrowAngle + 0.4), pts.y2 - arrowLen * Math.sin(arrowAngle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw-by-drag preview (rectangle / circle / line)
    if (drawDraft && (tool === "rectangle" || tool === "circle" || tool === "line" || tool === "frame")) {
      ctx.save();
      ctx.lineWidth = 2 / effectiveViewport.zoom;
      ctx.setLineDash([6 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);
      if (tool === "line") {
        ctx.strokeStyle = "#64748b";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(drawDraft.startX, drawDraft.startY);
        ctx.lineTo(drawDraft.currentX, drawDraft.currentY);
        ctx.stroke();
      } else {
        const x = Math.min(drawDraft.startX, drawDraft.currentX);
        const y = Math.min(drawDraft.startY, drawDraft.currentY);
        const w = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentX - drawDraft.startX));
        const h = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentY - drawDraft.startY));
        if (tool === "frame") {
          ctx.strokeStyle = "#6366F1";
          ctx.setLineDash([8 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 10);
          ctx.stroke();
          ctx.setLineDash([6 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);
        } else {
          ctx.strokeStyle = tool === "rectangle" ? "#42A5F5" : "#10B981";
          if (tool === "rectangle") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 4);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // Connector drag preview (curved line from edge point to cursor)
    if (connectorFromId && connectorFromPoint && connectorPreview) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 / effectiveViewport.zoom;
      ctx.setLineDash([6 / effectiveViewport.zoom, 4 / effectiveViewport.zoom]);
      const px = connectorFromPoint.x;
      const py = connectorFromPoint.y;
      const qx = connectorPreview.x;
      const qy = connectorPreview.y;
      const midX = (px + qx) / 2;
      const midY = (py + qy) / 2;
      const dx = qx - px;
      const dy = qy - py;
      const len = Math.hypot(dx, dy) || 1;
      const curve = getConnectorCurve(len);
      const perpX = (-dy / len) * curve;
      const perpY = (dx / len) * curve;
      const ctrlX = midX + perpX;
      const ctrlY = midY + perpY;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(ctrlX, ctrlY, qx, qy);
      ctx.stroke();
      const angle = Math.atan2(qy - ctrlY, qx - ctrlX);
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

    // Edge anchor dot at the connectorFromPoint
    if (connectorFromPoint && connectorFromId) {
      ctx.save();
      ctx.fillStyle = "#3b82f6";
      ctx.strokeStyle = isDark ? "#1f2937" : "#fff";
      ctx.lineWidth = 2 / effectiveViewport.zoom;
      ctx.beginPath();
      ctx.arc(connectorFromPoint.x, connectorFromPoint.y, 5 / effectiveViewport.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Target shape highlight when snapping a connector
    if (connectorFromId && connectorSnapTargetId) {
      const targetEl = idToElement.get(connectorSnapTargetId);
      if (targetEl && inView(targetEl.x, targetEl.y, targetEl.width, targetEl.height)) {
        ctx.save();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 3 / effectiveViewport.zoom;
        ctx.setLineDash([]);
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 12 / effectiveViewport.zoom;
        if (targetEl.type === "circle") {
        ctx.beginPath();
          ctx.ellipse(targetEl.x + targetEl.width / 2, targetEl.y + targetEl.height / 2, targetEl.width / 2, targetEl.height / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.roundRect(targetEl.x, targetEl.y, targetEl.width, targetEl.height, 4 / effectiveViewport.zoom);
        ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Edge anchor dots: in connector mode, or in select mode on hover
    if (tool === "connector" || tool === "select") {
      const targetsToShow =
        connectorFromId
          ? elements.filter(
              (e) => e.id !== connectorFromId && e.type !== "connector" && e.type !== "freehand" && CONNECTABLE_TYPES.has(e.type)
            )
          : hoveredId
            ? elements.filter((e) => e.id === hoveredId && CONNECTABLE_TYPES.has(e.type))
            : [];
      const anchorR = 7 / effectiveViewport.zoom;
      for (const hovEl of targetsToShow) {
        const anchors = getShapeAnchors(hovEl);
        const isSnapTarget = hovEl.id === connectorSnapTargetId;
        ctx.save();
        if (isSnapTarget) {
          ctx.shadowColor = "#3b82f6";
          ctx.shadowBlur = 10 / effectiveViewport.zoom;
        }
        ctx.fillStyle = isSnapTarget ? "#2563eb" : "#3b82f6";
        ctx.strokeStyle = isDark ? "#1f2937" : "#fff";
        ctx.lineWidth = 2.5 / effectiveViewport.zoom;
        for (const a of anchors) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, isSnapTarget ? anchorR * 1.3 : anchorR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      ctx.restore();
      }
    }

    // Pen stroke preview
    if (tool === "pen" && strokePoints.length >= 2) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(2 / effectiveViewport.zoom, 2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(strokePoints[0].x, strokePoints[0].y);
      for (let i = 1; i < strokePoints.length; i++) ctx.lineTo(strokePoints[i].x, strokePoints[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // Marquee selection rectangle
    if (marquee) {
      const mx = Math.min(marquee.startX, marquee.currentX);
      const my = Math.min(marquee.startY, marquee.currentY);
      const mw = Math.abs(marquee.currentX - marquee.startX);
      const mh = Math.abs(marquee.currentY - marquee.startY);
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,0.08)";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1 / effectiveViewport.zoom;
      ctx.setLineDash([4 / effectiveViewport.zoom, 3 / effectiveViewport.zoom]);
      ctx.beginPath();
      ctx.rect(mx, my, mw, mh);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Resize handles omitted — use format panel / toolbar to resize (cleaner selection UI)

    ctx.restore();

    // Draw peer cursors (in screen space)
    peers.forEach((peer, i) => {
      if (peer.cursor_x == null || peer.cursor_y == null) return;
      const screen = worldToScreen(peer.cursor_x, peer.cursor_y);
      const color = CURSOR_COLORS[i % CURSOR_COLORS.length];

      ctx.save();
      // Cursor arrow — with white outline for visibility on any background
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x, screen.y + 18);
      ctx.lineTo(screen.x + 5, screen.y + 14);
      ctx.lineTo(screen.x + 12, screen.y + 14);
      ctx.closePath();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fill();

      // Name label
      const name = getDisplayName({ email: peer.user_email });
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
    visibleCountRef.current = visibleDrawn;
  }, [elements, sortedElements, viewport, selectedId, selectedIds, resizing, resizeDraft, rotationDraft, peers, worldToScreen, isDark, drawDraft, marquee, tool, connectorFromId, connectorFromPoint, connectorPreview, connectorSnapTargetId, hoveredId, strokePoints, idToElement]);

  // Sampled perf metrics for panel (avoid reading refs during render)
  const [perfVisibleCount, setPerfVisibleCount] = useState(0);
  const [perfCursorLatency, setPerfCursorLatency] = useState<number | null>(null);
  const [perfSyncLatency, setPerfSyncLatency] = useState<number | null>(null);

  const fpsRef = useRef(0);
  const frameCountRef = useRef(0);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Continuous rAF render loop — runs at display refresh rate (60/120 Hz)
  useEffect(() => {
    let running = true;

    function loop() {
      if (!running) return;
      drawRef.current();
      frameCountRef.current++;
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    return () => { running = false; };
  }, []);

  // FPS + perf sampling on interval (no refs read during render)
  useEffect(() => {
    const id = setInterval(() => {
      const currentFps = frameCountRef.current;
      fpsRef.current = currentFps;
      setFps(currentFps);
      onFpsReport?.(currentFps);
      setPerfVisibleCount(visibleCountRef.current);
      setPerfCursorLatency(cursorLatencyRef?.current ?? null);
      setPerfSyncLatency(syncLatencyRef?.current ?? null);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(id);
    // Refs are stable; no need in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer — invalidates cached rect on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (canvas) canvasRectRef.current = canvas.getBoundingClientRect();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Mouse handlers
  function handleMouseDown(e: React.MouseEvent) {
    containerRef.current?.focus({ preventScroll: true });
    const rect = canvasRectRef.current ?? canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);

    if (tool === "pen") {
      setStrokePoints([{ x: world.x, y: world.y }]);
      return;
    }
    if (tool === "eraser") {
      setIsErasing(true);
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
          const rotatableTypes = ["sticky_note", "rectangle", "circle", "text", "frame", "line", "freehand"];
          if (rotatableTypes.includes(el.type) && isOnRotationHandle(world.x, world.y, el, viewport.zoom)) {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            const startAngle = Math.atan2(world.y - cy, world.x - cx);
            const startRotation = (el.properties as { rotation?: number } | null | undefined)?.rotation ?? 0;
            setRotating({ id: el.id, startAngle, startRotation });
            setRotationDraft(startRotation);
            rotationVelocityRef.current = 0;
            lastRotationTimeRef.current = performance.now();
            rotationMouseScreenRef.current = { x: sx, y: sy };
            return;
          }
        }
      }

      // Start connector from edge anchor without Connect tool: click on a shape's anchor to begin
      const hit = hitTest(sx, sy);
      if (hit && CONNECTABLE_TYPES.has(hit.type) && onCreateConnector) {
        const anchors = getShapeAnchors(hit);
        const ANCHOR_HIT_RADIUS = 14;
        for (const anchor of anchors) {
          const screen = worldToScreen(anchor.x, anchor.y);
          const dist = Math.hypot(sx - screen.x, sy - screen.y);
          if (dist <= ANCHOR_HIT_RADIUS) {
            setConnectorFromId(hit.id);
            setConnectorFromPoint(anchor);
            setConnectorPreview({ x: world.x, y: world.y });
            return;
          }
        }
      }

      if (hit) {
        if (e.shiftKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
        setSelectedId(hit.id);
        } else {
          setSelectedId(hit.id);
          setSelectedIds(new Set());
        }
        setDragging({ id: hit.id, offsetX: world.x - hit.x, offsetY: world.y - hit.y });
      } else {
        if (!e.shiftKey) {
        setSelectedId(null);
          setSelectedIds(new Set());
        }
        setMarquee({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
      }
    } else if (tool === "connector") {
      const hit = hitTest(sx, sy);
      if (hit && hit.type !== "connector") {
        const edgePt = clipToShapeEdge(hit, world.x, world.y);
        setConnectorFromId(hit.id);
        setConnectorFromPoint(edgePt);
        setConnectorPreview({ x: world.x, y: world.y });
      } else {
        setSelectedId(null);
        setConnectorFromId(null);
        setConnectorFromPoint(null);
        setConnectorPreview(null);
        setConnectorSnapTargetId(null);
      }
    } else if (tool === "rectangle" || tool === "circle" || tool === "line" || tool === "frame") {
      setDrawDraft({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
    } else if (tool === "sticky_note" || tool === "text") {
      void onCreate(tool, world.x, world.y);
      onToolChange("select");
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = canvasRectRef.current ?? canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Broadcast cursor position in world coords
    const world = screenToWorld(sx, sy);
    onCursorMove(world.x, world.y);

    if (rotating) {
      const el = elements.find((e) => e.id === rotating.id);
      if (el) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const currentAngle = Math.atan2(world.y - cy, world.x - cx);
        let deltaDeg = ((currentAngle - rotating.startAngle) * 180) / Math.PI;
        while (deltaDeg > 180) deltaDeg -= 360;
        while (deltaDeg < -180) deltaDeg += 360;
        let newRot = rotating.startRotation + deltaDeg;
        if (e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15;
        } else {
          for (const cardinal of [0, 90, 180, -180, -90, 270]) {
            let diff = newRot - cardinal;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            if (Math.abs(diff) <= CARDINAL_SNAP_DEG) {
              newRot = cardinal;
              break;
            }
          }
        }
        const now = performance.now();
        const dt = now - lastRotationTimeRef.current;
        if (dt > 0) {
          const prevRot = rotationDraft ?? rotating.startRotation;
          rotationVelocityRef.current = (newRot - prevRot) / dt;
          lastRotationTimeRef.current = now;
        }
        setRotationDraft(newRot);
        rotationMouseScreenRef.current = { x: sx, y: sy };
      }
      return;
    }

    // Eraser: continuously erase elements under cursor while dragging
    if (isErasing && tool === "eraser") {
      const hit = hitTest(sx, sy);
      if (hit) onDelete(hit.id);
    }

    // Pen stroke: append point while dragging (with small threshold to reduce points)
    if (strokePoints.length > 0) {
      const last = strokePoints[strokePoints.length - 1];
      const dx = world.x - last.x, dy = world.y - last.y;
      if (dx * dx + dy * dy > 4) setStrokePoints((prev) => [...prev, { x: world.x, y: world.y }]);
    }

    // Hover detection for cursor feedback
    if (!dragging && !panning && !resizing && !drawDraft && !connectorFromId && !rotating && (tool === "select" || tool === "connector")) {
      const hit = hitTest(sx, sy);
      setHoveredId(hit?.id ?? null);
    }

    if (drawDraft) {
      setDrawDraft((d) => (d ? { ...d, currentX: world.x, currentY: world.y } : null));
    }
    if (marquee) {
      setMarquee((m) => (m ? { ...m, currentX: world.x, currentY: world.y } : null));
    }
    if (connectorFromId) {
      const SNAP_THRESHOLD = 28 / viewport.zoom;
      let snapPt: { x: number; y: number } | null = null;
      let snapTargetId: string | null = null;
      for (const el of elements) {
        if (el.id === connectorFromId || el.type === "connector" || el.type === "freehand" || !CONNECTABLE_TYPES.has(el.type)) continue;
        const ecx = el.x + el.width / 2;
        const ecy = el.y + el.height / 2;
        const dist = Math.hypot(world.x - ecx, world.y - ecy);
        const maxDist = Math.hypot(el.width, el.height) / 2 + SNAP_THRESHOLD;
        if (dist > maxDist) continue;
        const edgePt = clipToShapeEdge(el, world.x, world.y);
        if (Math.hypot(world.x - edgePt.x, world.y - edgePt.y) <= SNAP_THRESHOLD) {
          snapPt = edgePt;
          snapTargetId = el.id;
          break;
        }
      }
      setConnectorPreview(snapPt ?? { x: world.x, y: world.y });
      setConnectorSnapTargetId(snapTargetId);
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
      const newX = world.x - dragging.offsetX;
      const newY = world.y - dragging.offsetY;
      const updateFn = onLocalUpdate ?? onUpdate;
      updateFn(dragging.id, { x: newX, y: newY });

      const dragEl = elements.find((el) => el.id === dragging.id);
      if (dragEl?.type === "frame") {
        const dx = newX - dragEl.x;
        const dy = newY - dragEl.y;
        if (dx !== 0 || dy !== 0) {
          for (const child of elements) {
            if (child.id === dragging.id || child.type === "connector") continue;
            const fp = child.properties as { frameId?: string } | undefined;
            if (fp?.frameId === dragging.id) {
              updateFn(child.id, { x: child.x + dx, y: child.y + dy });
            }
          }
        }
      }
    }

    if (resizing) {
      const { startEl, handle } = resizing;
      const el = elements.find((e) => e.id === resizing.id);
      const rot = (el?.properties as { rotation?: number } | undefined)?.rotation ?? 0;

      let x: number, y: number, width: number, height: number;

      if (rot !== 0) {
        const rad = (rot * Math.PI) / 180;
        const sCx = startEl.x + startEl.width / 2;
        const sCy = startEl.y + startEl.height / 2;
        const local = rotatePoint(world.x, world.y, sCx, sCy, -rad);
        const lx = local.x;
        const ly = local.y;

        let newW = startEl.width;
        let newH = startEl.height;
        let newCx = sCx;
        let newCy = sCy;

        if (handle === "se" || handle === "e" || handle === "ne") {
          newW = clampSize(lx - (startEl.x));
        }
        if (handle === "sw" || handle === "w" || handle === "nw") {
          newW = clampSize((startEl.x + startEl.width) - lx);
          newCx = sCx + (startEl.width - newW) / 2;
        }
        if (handle === "se" || handle === "s" || handle === "sw") {
          newH = clampSize(ly - (startEl.y));
        }
        if (handle === "ne" || handle === "n" || handle === "nw") {
          newH = clampSize((startEl.y + startEl.height) - ly);
          newCy = sCy + (startEl.height - newH) / 2;
        }

        const finalCenter = rotatePoint(newCx, newCy, sCx, sCy, rad);
        x = finalCenter.x - newW / 2;
        y = finalCenter.y - newH / 2;
        width = newW;
        height = newH;
      } else {
      switch (handle) {
        case "se":
            x = startEl.x; y = startEl.y;
            width = clampSize(world.x - startEl.x); height = clampSize(world.y - startEl.y);
          break;
        case "s":
            x = startEl.x; y = startEl.y;
            width = startEl.width; height = clampSize(world.y - startEl.y);
          break;
        case "e":
            x = startEl.x; y = startEl.y;
            width = clampSize(world.x - startEl.x); height = startEl.height;
          break;
        case "sw":
            x = world.x; y = startEl.y;
            width = clampSize(startEl.x + startEl.width - world.x); height = clampSize(world.y - startEl.y);
          break;
        case "w":
            x = world.x; y = startEl.y;
            width = clampSize(startEl.x + startEl.width - world.x); height = startEl.height;
          break;
        case "nw":
            x = world.x; y = world.y;
            width = clampSize(startEl.x + startEl.width - world.x); height = clampSize(startEl.y + startEl.height - world.y);
          break;
        case "n":
            x = startEl.x; y = world.y;
            width = startEl.width; height = clampSize(startEl.y + startEl.height - world.y);
          break;
        case "ne":
            x = startEl.x; y = world.y;
            width = clampSize(world.x - startEl.x); height = clampSize(startEl.y + startEl.height - world.y);
          break;
        }
      }
      setResizeDraft({ x, y, width, height });
    }
  }

  function handleMouseUp(e?: React.MouseEvent) {
    if (rotating) {
      const el = elements.find((x) => x.id === rotating.id);
      const velocity = rotationVelocityRef.current;
      rotationMouseScreenRef.current = null;
      if (el && Math.abs(velocity) > 0.15) {
        const elId = rotating.id;
        const elProps = { ...(el.properties as Record<string, unknown>) };
        let currentRot = rotationDraft ?? rotating.startRotation;
        let v = velocity * 16;
        const friction = 0.92;
        setRotating(null);
        function spinFrame() {
          v *= friction;
          currentRot += v;
          if (Math.abs(v) < 0.05) {
            while (currentRot > 180) currentRot -= 360;
            while (currentRot < -180) currentRot += 360;
            setRotationDraft(null);
            onUpdate(elId, { properties: { ...elProps, rotation: currentRot } as BoardElement["properties"] });
            return;
          }
          setRotationDraft(currentRot);
          requestAnimationFrame(spinFrame);
        }
        requestAnimationFrame(spinFrame);
      } else {
        if (el) {
          let finalRot = rotationDraft ?? rotating.startRotation;
          while (finalRot > 180) finalRot -= 360;
          while (finalRot < -180) finalRot += 360;
          const props = { ...(el.properties as Record<string, unknown>), rotation: finalRot };
          onUpdate(rotating.id, { properties: props as BoardElement["properties"] });
        }
        setRotating(null);
        setRotationDraft(null);
      }
    }
    if (marquee) {
      const mx1 = Math.min(marquee.startX, marquee.currentX);
      const my1 = Math.min(marquee.startY, marquee.currentY);
      const mx2 = Math.max(marquee.startX, marquee.currentX);
      const my2 = Math.max(marquee.startY, marquee.currentY);
      if (mx2 - mx1 > 5 || my2 - my1 > 5) {
        let candidates: BoardElement[];
        if (spatialIndex) {
          const cminX = Math.floor(mx1 / SPATIAL_CELL);
          const cmaxX = Math.floor(mx2 / SPATIAL_CELL);
          const cminY = Math.floor(my1 / SPATIAL_CELL);
          const cmaxY = Math.floor(my2 / SPATIAL_CELL);
          const set = new Set<BoardElement>();
          for (let cx = cminX; cx <= cmaxX; cx++) {
            for (let cy = cminY; cy <= cmaxY; cy++) {
              const list = spatialIndex.get(`${cx},${cy}`) ?? [];
              list.forEach((el) => set.add(el));
            }
          }
          candidates = [...set];
        } else {
          candidates = elements;
        }
        const hit = candidates.filter(
          (el) => el.type !== "connector" && el.type !== "freehand" && el.x < mx2 && el.x + el.width > mx1 && el.y < my2 && el.y + el.height > my1
        );
        if (hit.length > 0) {
          setSelectedIds(new Set(hit.map((el) => el.id)));
          setSelectedId(hit[0].id);
        }
      } else if (!e?.shiftKey) {
        setPanning(false);
      }
      setMarquee(null);
    }
    if (strokePoints.length >= 2 && onCreateFreehand) {
      void onCreateFreehand([...strokePoints]);
      setStrokePoints([]);
    }
    if (drawDraft && (tool === "rectangle" || tool === "circle" || tool === "line" || tool === "frame")) {
      if (tool === "line") {
        const dx = drawDraft.currentX - drawDraft.startX;
        const dy = drawDraft.currentY - drawDraft.startY;
        if (Math.abs(dx) + Math.abs(dy) > MIN_DRAW_SIZE) {
          void onCreate("line", drawDraft.startX, drawDraft.startY, dx, dy);
        }
      } else {
        const x = Math.min(drawDraft.startX, drawDraft.currentX);
        const y = Math.min(drawDraft.startY, drawDraft.currentY);
        const w = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentX - drawDraft.startX));
        const h = Math.max(MIN_DRAW_SIZE, Math.abs(drawDraft.currentY - drawDraft.startY));
        void onCreate(tool, x, y, w, h);
      }
      onToolChange("select");
      setDrawDraft(null);
    }
    if (connectorFromId) {
      if (canvasRef.current && e) {
        const rect = canvasRectRef.current ?? canvasRef.current.getBoundingClientRect();
        const sx2 = e.clientX - rect.left;
        const sy2 = e.clientY - rect.top;
        const hit = hitTest(sx2, sy2);
        if (hit && hit.id !== connectorFromId && hit.type !== "connector" && onCreateConnector) {
          void onCreateConnector(connectorFromId, hit.id);
          onToolChange("select");
        }
      }
      setConnectorFromId(null);
      setConnectorFromPoint(null);
      setConnectorPreview(null);
      setConnectorSnapTargetId(null);
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

        if (el.type === "frame") {
          const fx = el.x + FRAME_INSET, fy = el.y + FRAME_INSET, fx2 = el.x + el.width - FRAME_INSET, fy2 = el.y + el.height - FRAME_INSET;
          for (const child of elements) {
            if (child.id === el.id || child.type === "connector" || child.type === "frame") continue;
            const inside = child.x >= fx && child.y >= fy &&
              child.x + child.width <= fx2 && child.y + child.height <= fy2;
            const curFrame = (child.properties as { frameId?: string } | undefined)?.frameId;
            if (inside && curFrame !== el.id) {
              onUpdate(child.id, { properties: { ...(child.properties as Record<string, Json>), frameId: el.id } as Json });
            } else if (!inside && curFrame === el.id) {
              const rest = { ...(child.properties as Record<string, Json>) };
              delete rest.frameId;
              onUpdate(child.id, { properties: rest as Json });
            }
          }
        } else {
          const frames = elements.filter((f) => f.type === "frame" && f.id !== el.id);
          let assignedFrame: string | undefined;
          for (const frame of frames) {
            const fx = frame.x + FRAME_INSET, fy = frame.y + FRAME_INSET, fx2 = frame.x + frame.width - FRAME_INSET, fy2 = frame.y + frame.height - FRAME_INSET;
            if (el.x >= fx && el.y >= fy && el.x + el.width <= fx2 && el.y + el.height <= fy2) {
              assignedFrame = frame.id;
              break;
            }
          }
          const curFrame = (el.properties as { frameId?: string } | undefined)?.frameId;
          if (assignedFrame && curFrame !== assignedFrame) {
            onUpdate(el.id, { properties: { ...(el.properties as Record<string, Json>), frameId: assignedFrame } as Json });
          } else if (!assignedFrame && curFrame) {
            const rest = { ...(el.properties as Record<string, Json>) };
            delete rest.frameId;
            onUpdate(el.id, { properties: rest as Json });
          }
        }
      }
    }
    setDragging(null);
    setPanning(false);
    setIsErasing(false);
  }

  // Throttle wheel to one viewport update per frame (Figma/Miro smoothness)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvasRectRef.current ?? canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const base = pendingViewportRef.current ?? viewport;
      const isPinchZoom = e.ctrlKey || e.metaKey;
      let next: { x: number; y: number; zoom: number };
      if (isPinchZoom) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(base.zoom * delta, 0.1), 5);
        const ratio = newZoom / base.zoom;
        next = {
        zoom: newZoom,
          x: sx - (sx - base.x) * ratio,
          y: sy - (sy - base.y) * ratio,
        };
      } else {
        // Shift+scroll → horizontal pan (mice only emit deltaY; trackpads emit both)
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        next = { ...base, x: base.x - dx, y: base.y - dy };
      }
      pendingViewportRef.current = next;
      if (wheelRafRef.current === null) {
        wheelRafRef.current = requestAnimationFrame(() => {
          const p = pendingViewportRef.current;
          if (p) onViewportChange(p);
          wheelRafRef.current = null;
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
    const rect = canvasRectRef.current ?? canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    if (
      hit &&
      (hit.type === "sticky_note" ||
        hit.type === "rectangle" ||
        hit.type === "circle" ||
        hit.type === "text" ||
        hit.type === "frame")
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
    selectedElement &&
    (selectedElement.type === "connector" || (currentUserId && selectedElement.created_by === currentUserId));
  const showColorPicker = selectedElement && selectedElement.type !== "connector";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingId) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIds.size > 0) {
        selectedIds.forEach((id) => onDelete(id));
        setSelectedIds(new Set());
        setSelectedId(null);
      } else if (canDeleteSelected) {
        onDelete(selectedId!);
        setSelectedId(null);
      }
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setSelectedIds(new Set());
      setEditingId(null);
      setFormatPanelOpen(false);
    }
    if (e.key === "d" && (e.metaKey || e.ctrlKey) && selectedId && onDuplicate && selectedElement?.type !== "connector") {
      e.preventDefault();
      void onDuplicate(selectedId);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      const ids = selectedIds.size > 0 ? selectedIds : (selectedId ? new Set([selectedId]) : new Set<string>());
      if (ids.size > 0) {
        clipboardRef.current = elements.filter((el) => ids.has(el.id) && el.type !== "connector");
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
      if (clipboardRef.current.length > 0) {
        const offset = 30;
        for (const el of clipboardRef.current) {
          void (async () => {
            const id = await (onCreate as (type: string, x: number, y: number, w?: number, h?: number) => Promise<string | void>)(
              el.type as "sticky_note" | "rectangle" | "circle" | "text" | "frame" | "line",
              el.x + offset, el.y + offset, el.width, el.height
            );
            if (id && typeof id === "string") {
              onUpdate(id, { text: el.text, color: el.color, properties: el.properties });
            }
          })();
        }
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (key === "v") onToolChange("select");
      else if (key === "n") onToolChange("sticky_note");
      else if (key === "r") onToolChange("rectangle");
      else if (key === "o") onToolChange("circle");
      else if (key === "l") onToolChange("line");
      else if (key === "f") onToolChange("frame");
      else if (key === "t") onToolChange("text");
      else if (key === "a") onToolChange("connector");
      else if (key === "p") onToolChange("pen");
      else if (key === "e") onToolChange("eraser");
    }
  }

  // Compute cursor style
  const cursorStyle = (() => {
    if (drawDraft || connectorFromId || rotating) return "crosshair";
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
      {/* Performance panel (add ?perf=1 to board URL) */}
      {perfMode && (
        <PerfPanel
          metrics={{
            fps,
            elementCount: elements.length,
            visibleCount: perfVisibleCount,
            peerCount: peers.length,
            cursorLatency: perfCursorLatency,
            syncLatency: perfSyncLatency,
            spatialIndexActive: spatialIndex !== null,
          }}
          onStressTest={onStressTest}
          onClearBoard={onClearBoard}
        />
      )}
      {/* Connector tool hint — makes it clear arrows connect shapes */}
      {tool === "connector" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-xs font-medium shadow-lg border border-gray-700/50 dark:border-gray-300/50">
          Click on a shape&apos;s edge to start, then click another shape&apos;s edge to connect
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
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm ${interviewMode ? "bg-gradient-to-br from-emerald-500 to-teal-500" : "bg-gradient-to-br from-blue-500 to-indigo-500"}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                {interviewMode
                  ? <><path d="M4 7V4h16v3M9 20h6M12 4v16" /></>
                  : <path d="M12 5v14M5 12h14" />}
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
              {interviewMode ? "Interview Board" : "Your board is empty"}
            </p>
            {interviewMode ? (
              <div className="mb-5 max-w-[320px]">
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">Get started in 3 steps:</p>
                <div className="flex flex-col gap-2 text-left">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                    <span className="text-xs text-gray-600 dark:text-gray-300">Pick a template from the toolbar above</span>
          </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                    <span className="text-xs text-gray-600 dark:text-gray-300">Set your timer (15-60 min)</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 text-xs font-bold flex items-center justify-center shrink-0">3</span>
                    <span className="text-xs text-gray-600 dark:text-gray-300">Start solving -- use AI for hints</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-5 max-w-[280px]">Get started by adding an element</p>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              {interviewMode ? (
                <>
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
                    onClick={() => { onToolChange("pen"); }}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50 border border-orange-200 dark:border-orange-800/50 transition-colors"
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onInsertCodeBlock) {
                        void onInsertCodeBlock();
                      } else {
                        const cx = (containerRef.current?.clientWidth ?? 800) / 2;
                        const cy = (containerRef.current?.clientHeight ?? 600) / 2;
                        const world = screenToWorld(cx, cy);
                        void onCreate("text", world.x, world.y);
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-800/50 transition-colors"
                  >
                    Code Block
                  </button>
                  <button
                    type="button"
                    onClick={() => { onToolChange("connector"); }}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-gray-200 dark:border-gray-700/50 transition-colors"
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => { onToolChange("frame"); }}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/50 transition-colors"
                  >
                    Frame
                  </button>
                </>
              ) : (
                <>
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
                    onClick={() => { onToolChange("frame"); }}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/50 transition-colors"
                  >
                    Frame
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rotation handle — small grab handle below selected element (menus sit above) */}
      {selectedId && !editingId && selectedElement && selectedElement.type !== "connector" && (() => {
        const rotatableTypes = ["sticky_note", "rectangle", "circle", "text", "frame", "line", "freehand"];
        const el = selectedElement;
        if (!el || !rotatableTypes.includes(el.type)) return null;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const handlePos = getRotationHandlePos(el, viewport.zoom);
        const screenHandle = worldToScreen(handlePos.x, handlePos.y);
        const screenBottomCenter = worldToScreen(cx, el.y + el.height);
        const rot = rotationDraft ?? (el.properties as { rotation?: number } | null | undefined)?.rotation ?? 0;
        const isActive = rotating !== null;
        const handleColor = isDark ? "#60a5fa" : "#3b82f6";
        const showAngle = isActive && rotationMouseScreenRef.current;
        const normalizedRot = ((rot % 360) + 360) % 360;
        const displayDeg = normalizedRot > 180 ? normalizedRot - 360 : normalizedRot;
        return (
          <div className="absolute inset-0 pointer-events-none z-30" aria-hidden>
            <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible", pointerEvents: "none" }}>
              {!isActive && (
                <>
                  <line
                    x1={screenBottomCenter.x}
                    y1={screenBottomCenter.y}
                    x2={screenHandle.x}
                    y2={screenHandle.y}
                    stroke={handleColor}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                  <circle
                    cx={screenHandle.x}
                    cy={screenHandle.y}
                    r={ROTATION_HANDLE_RADIUS}
                    fill={isDark ? "#1e293b" : "#ffffff"}
                    stroke={handleColor}
                    strokeWidth={2}
                    style={{ pointerEvents: "all", cursor: "grab" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const sx = e.clientX - rect.left;
                      const sy = e.clientY - rect.top;
                      const w = screenToWorld(sx, sy);
                      const startAngle = Math.atan2(w.y - cy, w.x - cx);
                      const startRotation = (el.properties as { rotation?: number } | null | undefined)?.rotation ?? 0;
                      setRotating({ id: el.id, startAngle, startRotation });
                      setRotationDraft(startRotation);
                      rotationVelocityRef.current = 0;
                      lastRotationTimeRef.current = performance.now();
                      rotationMouseScreenRef.current = { x: sx, y: sy };
                    }}
                  />
                  {/* Rotation icon inside handle */}
                  <path
                    d={`M${screenHandle.x - 4},${screenHandle.y + 1} A4,4 0 1,1 ${screenHandle.x + 1},${screenHandle.y - 4}`}
                    fill="none"
                    stroke={handleColor}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    style={{ pointerEvents: "none" }}
                  />
                  <polyline
                    points={`${screenHandle.x + 1},${screenHandle.y - 7} ${screenHandle.x + 1},${screenHandle.y - 4} ${screenHandle.x + 4},${screenHandle.y - 4}`}
                    fill="none"
                    stroke={handleColor}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  />
                </>
              )}
            </svg>
            {showAngle && rotationMouseScreenRef.current && (
              <div
                className="absolute px-2 py-1 rounded-lg text-xs font-mono font-bold shadow-lg border"
                style={{
                  left: rotationMouseScreenRef.current.x + 20,
                  top: rotationMouseScreenRef.current.y - 10,
                  backgroundColor: isDark ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.95)",
                  color: isDark ? "#f472b6" : "#ec4899",
                  borderColor: isDark ? "#475569" : "#e2e8f0",
                }}
              >
                {Math.round(displayDeg)}°
              </div>
            )}
          </div>
        );
      })()}

      {/* Size label while resizing */}
      {resizing && resizeDraft && (() => {
        const w = Math.round(resizeDraft.width);
        const h = Math.round(resizeDraft.height);
        const bottomCenter = worldToScreen(resizeDraft.x + resizeDraft.width / 2, resizeDraft.y + resizeDraft.height + 12 / viewport.zoom);
        return (
          <div
            className="absolute z-30 px-2 py-1 rounded-md text-[11px] font-mono font-bold shadow-md border pointer-events-none"
            style={{
              left: bottomCenter.x,
              top: bottomCenter.y,
              transform: "translate(-50%, 0)",
              backgroundColor: isDark ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.95)",
              color: isDark ? "#93c5fd" : "#3b82f6",
              borderColor: isDark ? "#475569" : "#e2e8f0",
            }}
          >
            {w} x {h}
          </div>
        );
      })()}

      {/* Duplicate + Edit (format panel) + Delete + Layer buttons — above selected element */}
      {selectedId && !editingId && selectedElement && selectedElement.type !== "connector" && (() => {
        const el = selectedElement;
        const anchor = worldToScreen(el.x + el.width / 2, el.y - 8);
        const hasOverlappingOthers = elements.some(
          (e) => e.id !== el.id && e.type !== "connector" && rectsOverlap(el, e)
        );
        return (
          <div
            className="absolute z-20 flex items-center gap-2 flex-wrap justify-center"
            style={{ left: anchor.x, top: anchor.y, transform: "translate(-50%, -100%)" }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFormatPanelOpen((open) => !open);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg shadow border whitespace-nowrap ${formatPanelOpen ? "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800" : "text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"}`}
              title="Edit color, text style, rotation"
            >
              {formatPanelOpen ? "Close panel" : "Edit"}
            </button>
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
            {(onBringToFront || onSendToBack) && hasOverlappingOthers && (
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
          <button
            type="button"
            onClick={() => {
              onDelete(selectedId!);
              setSelectedId(null);
            }}
                className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 rounded-lg shadow-md border border-red-200 dark:border-red-800 whitespace-nowrap"
                title="Delete (Del)"
          >
            Delete
          </button>
      )}
        </div>
        );
      })()}
      {/* Connector mini-toolbar — line type + delete for selected connector */}
      {selectedId && !editingId && selectedElement && selectedElement.type === "connector" && (() => {
        const el = selectedElement;
        const pts = getConnectorEndpoints(el, idToElement);
        if (!pts) return null;
        const anchor = worldToScreen((pts.x1 + pts.x2) / 2, (pts.y1 + pts.y2) / 2 - 20);
        const connProps = el.properties as Record<string, string> | undefined;
        const currentRoute = (connProps?.route || "curved") as "straight" | "orthogonal" | "curved";
        const currentThickness = (connProps?.thickness || "medium") as "thin" | "medium" | "thick";
        const mergeProps = (patch: Record<string, unknown>) => {
          const existingProps = (el.properties as Record<string, unknown>) || {};
          onUpdate(el.id, { properties: { ...existingProps, ...patch } as BoardElement["properties"] });
        };
        const routeBtn = "px-2 py-1 text-xs font-medium rounded-md border transition-colors";
        const routeActive = "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300";
        const routeInactive = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700";
        return (
          <div
            className="absolute z-20 flex items-center gap-1.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-2 py-1.5 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
            style={{ left: anchor.x, top: anchor.y, transform: "translate(-50%, -100%)" }}
          >
            {(["straight", "orthogonal", "curved"] as const).map((route) => (
              <button
                key={route}
                type="button"
                onClick={(e) => { e.stopPropagation(); mergeProps({ route }); }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`${routeBtn} ${currentRoute === route ? routeActive : routeInactive}`}
              >
                {route === "orthogonal" ? "Elbow" : route.charAt(0).toUpperCase() + route.slice(1)}
              </button>
            ))}
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            {(["thin", "medium", "thick"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => { e.stopPropagation(); mergeProps({ thickness: t }); }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`${routeBtn} ${currentThickness === t ? routeActive : routeInactive}`}
                title={`${t} line`}
              >
                <svg width="16" height="10" viewBox="0 0 16 10"><line x1="0" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth={t === "thin" ? 1 : t === "medium" ? 2 : 4} strokeLinecap="round" /></svg>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { onDelete(selectedId!); setSelectedId(null); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md border border-red-200 dark:border-red-800"
              title="Delete connector"
            >
              Delete
            </button>
          </div>
        );
      })()}
      {selectedId && !editingId && !canDeleteSelected && selectedElement && selectedElement.type !== "connector" && (() => {
        const el = selectedElement;
        const anchor = worldToScreen(el.x + el.width / 2, el.y - 8);
        return (
          <div
            className="absolute z-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow border border-gray-200 dark:border-gray-700"
            style={{ left: anchor.x, top: anchor.y, transform: "translate(-50%, -100%)" }}
          >
            <span className="text-xs text-gray-500 dark:text-gray-400">Only the creator can delete this</span>
          </div>
        );
      })()}

      {/* Slide-out Format panel — full controls when an element is selected (no floating box) */}
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
              {...(el.type === "connector" && {
                connectorRoute: ((props?.route as string) || "curved") as "straight" | "orthogonal" | "curved",
                onConnectorRouteChange: (route: "straight" | "orthogonal" | "curved") => mergeProps({ route }),
              })}
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
        const textColor = getElementTextColor(el, isDark);
        // Code block: solid dark background so light text is readable; stickies: solid color; other text: slight tint
        const backgroundColor = isCodeBlock ? el.color : isSticky ? el.color : `${el.color}22`;
        const lineHeightStr = `${lineHeightPx}px`;
        const measureStyle = {
          position: "absolute" as const,
          left: -9999,
          top: 0,
          width: w,
          padding: paddingPx,
          fontSize,
          lineHeight: lineHeightStr,
          fontFamily: elFF.css,
          fontWeight,
          fontStyle,
          textAlign,
          whiteSpace: "pre-wrap" as const,
          wordBreak: "break-word" as const,
          overflow: "hidden",
          visibility: "hidden" as const,
          margin: 0,
          border: "1px solid transparent",
          boxSizing: "border-box" as const,
        };
        return (
          <div className="absolute z-[100]" style={{ left: screen.x, top: screen.y, width: w, height: minH }}>
            {/* Hidden measure div for thin-caret position (same font/size as textarea) */}
            <div ref={measureRef} style={measureStyle} />
          <textarea
              ref={(ta) => {
                editTextareaRef.current = ta;
              }}
            tabIndex={0}
            aria-label="Edit text"
              className={`absolute inset-0 resize-none outline-none box-border canvas-inline-edit border ${isCodeBlock ? "border-blue-600 dark:border-blue-400" : "border-blue-500 dark:border-blue-400"}`}
            style={{
              padding: paddingPx,
              fontSize,
                lineHeight: lineHeightStr,
                fontFamily: elFF.css,
                fontWeight,
                fontStyle,
                textAlign,
                verticalAlign: "top",
              borderRadius: 4,
                ...(isCodeBlock && { borderLeft: `3px solid ${isDark ? "rgb(96 165 250)" : "rgb(37 99 235)"}` }),
                backgroundColor,
                color: textColor,
                caretColor: "transparent",
              pointerEvents: "auto",
                overflow: "auto",
            }}
            value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                setSelectionStart(e.target.selectionStart ?? 0);
              }}
              onSelect={(e) => setSelectionStart(e.currentTarget.selectionStart)}
              onScroll={(e) => setTextareaScroll({ scrollLeft: e.currentTarget.scrollLeft, scrollTop: e.currentTarget.scrollTop })}
            onBlur={saveAndClose}
              spellCheck={!isCodeBlock}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") saveAndClose();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveAndClose();
              }
            }}
              onKeyUp={(e) => setSelectionStart(e.currentTarget.selectionStart)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectionStart(e.currentTarget.selectionStart);
              }}
            onMouseDown={(e) => e.stopPropagation()}
          />
            {/* Thin 1px caret overlay (Miro/Figma-style) */}
            {caretPosition && (
              <div
                aria-hidden
                className="caret-blink pointer-events-none absolute"
                style={{
                  left: 1 + caretPosition.left - textareaScroll.scrollLeft,
                  top: 1 + caretPosition.top - textareaScroll.scrollTop,
                  width: 1.5,
                  height: caretPosition.height,
                  backgroundColor: textColor,
                }}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Helper: wrap text into lines (handles explicit newlines and word-wrap)
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
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
  }
  return lines.length ? lines : [""];
}
