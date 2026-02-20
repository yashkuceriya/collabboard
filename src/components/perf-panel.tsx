"use client";

import { useEffect, useRef, useState } from "react";

export interface PerfMetrics {
  fps: number;
  elementCount: number;
  visibleCount: number;
  peerCount: number;
  cursorLatency: number | null;
  syncLatency: number | null;
  spatialIndexActive: boolean;
}

export interface PerfPanelProps {
  metrics: PerfMetrics;
  onStressTest?: (count: number) => void;
  onClearBoard?: () => void;
}

const HISTORY_LEN = 60;

function color(val: number, green: number, yellow: number): string {
  if (val <= green) return "text-green-400";
  if (val <= yellow) return "text-yellow-400";
  return "text-red-400";
}

function fpsColor(val: number): string {
  if (val >= 55) return "text-green-400";
  if (val >= 40) return "text-yellow-400";
  return "text-red-400";
}

export function PerfPanel({ metrics, onStressTest, onClearBoard }: PerfPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [stressLoading, setStressLoading] = useState(false);
  const fpsHistory = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fpsHistory.current.push(metrics.fps);
    if (fpsHistory.current.length > HISTORY_LEN) fpsHistory.current.shift();

    const canvas = canvasRef.current;
    if (!canvas || collapsed) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, w, h);

    // 60 FPS line
    const y60 = h - (60 / 80) * h;
    ctx.strokeStyle = "rgba(74,222,128,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, y60);
    ctx.lineTo(w, y60);
    ctx.stroke();
    ctx.setLineDash([]);

    // FPS graph
    const data = fpsHistory.current;
    if (data.length < 2) return;
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (HISTORY_LEN - 1)) * w;
      const y = h - Math.min(data[i], 80) / 80 * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [metrics.fps, collapsed]);

  const culling = metrics.elementCount > 0
    ? Math.round((1 - metrics.visibleCount / metrics.elementCount) * 100)
    : 0;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute top-3 left-3 z-50 px-2 py-1 rounded-lg bg-gray-900/90 text-green-400 font-mono text-xs tabular-nums hover:bg-gray-900 transition-colors"
      >
        {metrics.fps} FPS
      </button>
    );
  }

  return (
    <div className="absolute top-3 left-3 z-50 w-52 rounded-xl bg-gray-900/95 backdrop-blur-sm text-xs font-mono text-gray-300 shadow-xl border border-gray-700/50 overflow-hidden select-none">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/50">
        <span className="font-semibold text-gray-100">Performance</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
      </div>

      {/* FPS graph */}
      <canvas ref={canvasRef} width={208} height={40} className="w-full" />

      <div className="px-3 py-2 space-y-1">
        <div className="flex justify-between">
          <span>FPS</span>
          <span className={`font-bold ${fpsColor(metrics.fps)}`}>{metrics.fps}</span>
        </div>
        <div className="flex justify-between">
          <span>Objects</span>
          <span className="text-gray-100">{metrics.elementCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Visible</span>
          <span className="text-gray-100">{metrics.visibleCount} <span className="text-gray-500">({culling}% culled)</span></span>
        </div>
        <div className="flex justify-between">
          <span>Peers</span>
          <span className="text-gray-100">{metrics.peerCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Spatial idx</span>
          <span className={metrics.spatialIndexActive ? "text-green-400" : "text-gray-500"}>{metrics.spatialIndexActive ? "Active" : "Off"}</span>
        </div>
        {metrics.cursorLatency !== null && (
          <div className="flex justify-between">
            <span>Cursor sync</span>
            <span className={color(metrics.cursorLatency, 50, 100)}>{metrics.cursorLatency}ms</span>
          </div>
        )}
        {metrics.syncLatency !== null && (
          <div className="flex justify-between">
            <span>Object sync</span>
            <span className={color(metrics.syncLatency, 100, 300)}>{metrics.syncLatency}ms</span>
          </div>
        )}
      </div>

      {/* Stress test controls */}
      {onStressTest && (
        <div className="px-3 py-2 border-t border-gray-700/50 space-y-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Stress Test</span>
          <div className="flex gap-1">
            {[50, 200, 500].map((n) => (
              <button
                key={n}
                type="button"
                disabled={stressLoading}
                onClick={async () => {
                  setStressLoading(true);
                  try { await onStressTest(n); } finally { setStressLoading(false); }
                }}
                className="flex-1 px-1 py-1 text-[10px] rounded bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 transition-colors disabled:opacity-40"
              >
                +{n}
              </button>
            ))}
          </div>
          {onClearBoard && (
            <button
              type="button"
              disabled={stressLoading}
              onClick={onClearBoard}
              className="w-full px-1 py-1 text-[10px] rounded bg-red-900/40 hover:bg-red-800/50 text-red-300 transition-colors disabled:opacity-40"
            >
              Clear all
            </button>
          )}
          {stressLoading && (
            <p className="text-[10px] text-yellow-400 animate-pulse">Generating...</p>
          )}
        </div>
      )}
    </div>
  );
}
