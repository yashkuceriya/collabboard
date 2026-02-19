"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type InterviewTool = "select" | "sticky_note" | "pen" | "eraser" | "text" | "rectangle" | "circle" | "connector";

interface InterviewToolbarProps {
  tool?: InterviewTool;
  onToolChange?: (t: InterviewTool) => void;
  onInsertTemplate: (template: "system_design" | "algorithm") => void;
  onInsertCodeBlock?: () => void;
  onClearBoard: () => void;
}

function TimerWidget() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [preset, setPreset] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((duration?: number) => {
    if (duration !== undefined) {
      setSeconds(duration * 60);
      setPreset(duration * 60);
    }
    setRunning(true);
  }, []);

  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setSeconds(preset);
  }, [preset]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (preset > 0 && s <= 1) {
            setRunning(false);
            return 0;
          }
          return preset > 0 ? s - 1 : s + 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, preset]);

  const mins = Math.floor(Math.abs(seconds) / 60);
  const secs = Math.abs(seconds) % 60;
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const isWarning = preset > 0 && seconds <= 60 && seconds > 0;
  const isExpired = preset > 0 && seconds === 0 && preset > 0;

  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-lg tabular-nums font-bold ${isExpired ? "text-red-500 animate-pulse" : isWarning ? "text-amber-500" : "text-gray-800 dark:text-gray-100"}`}>
        {display}
      </span>
      <div className="flex gap-1">
        {!running ? (
          <button
            onClick={() => start()}
            className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
          >
            {seconds > 0 ? "Resume" : "Start"}
          </button>
        ) : (
          <button
            onClick={pause}
            className="px-2 py-1 text-[11px] font-medium rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50"
          >
            Pause
          </button>
        )}
        <button
          onClick={reset}
          className="px-2 py-1 text-[11px] font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Reset
        </button>
      </div>
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
      <div className="flex gap-1">
        {[15, 30, 45, 60].map((m) => (
          <button
            key={m}
            onClick={() => { start(m); }}
            className={`px-1.5 py-1 text-[10px] font-medium rounded ${preset === m * 60 ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            {m}m
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded-lg border flex items-center justify-center transition-colors ${active ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700" : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
    >
      {children}
    </button>
  );
}

export function InterviewToolbar({ tool, onToolChange, onInsertTemplate, onInsertCodeBlock, onClearBoard }: InterviewToolbarProps) {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 px-4 py-2.5">
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-0.5">Draw</span>
        {onToolChange && (
          <>
            <ToolButton active={tool === "select"} onClick={() => onToolChange("select")} label="Select">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-5.39 5.39-2.51L3 3z" /></svg>
            </ToolButton>
            <ToolButton active={tool === "pen"} onClick={() => onToolChange("pen")} label="Pen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>
            </ToolButton>
            <ToolButton active={tool === "eraser"} onClick={() => onToolChange("eraser")} label="Eraser">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16a2 2 0 010-2.83L16 1a2 2 0 012.83 0l4 4a2 2 0 010 2.83L10 20" /></svg>
            </ToolButton>
            <ToolButton active={tool === "text"} onClick={() => onToolChange("text")} label="Type">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>
            </ToolButton>
            <ToolButton active={tool === "rectangle"} onClick={() => onToolChange("rectangle")} label="Rectangle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1" /></svg>
            </ToolButton>
            <ToolButton active={tool === "circle"} onClick={() => onToolChange("circle")} label="Circle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
            </ToolButton>
            {onInsertCodeBlock && (
              <button
                type="button"
                onClick={onInsertCodeBlock}
                className="px-2 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-800/50 flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                Code block
              </button>
            )}
          </>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Templates</span>
        <button
          onClick={() => onInsertTemplate("system_design")}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/50 flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          System Design
        </button>
        <button
          onClick={() => onInsertTemplate("algorithm")}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Algorithm
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      <TimerWidget />

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      <button
        onClick={onClearBoard}
        className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/40"
      >
        Clear Board
      </button>
    </div>
  );
}
