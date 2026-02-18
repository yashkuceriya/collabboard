"use client";

import type { ColorPickerProps } from "@/components/color-picker";
import {
  STICKY_COLORS,
  SHAPE_COLORS,
  TEXT_COLORS,
  FONT_SIZES,
  FONT_FAMILIES,
} from "@/components/color-picker";

interface FormatPanelProps extends ColorPickerProps {
  onClose: () => void;
}

export function FormatPanel({
  currentColor,
  onColorChange,
  elementType,
  textColor,
  onTextColorChange,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  fontWeight,
  onFontWeightChange,
  fontStyle,
  onFontStyleChange,
  textAlign,
  onTextAlignChange,
  onClose,
}: FormatPanelProps) {
  const colors = elementType === "sticky_note" ? STICKY_COLORS : SHAPE_COLORS;
  const btn =
    "rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors";
  const btnActive =
    "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300";

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Format</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Fill */}
        <section>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Fill</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {colors.map((c) => (
              <button
                key={c.color}
                type="button"
                onClick={() => onColorChange(c.color)}
                title={c.label}
                className={`rounded-full border-2 transition-transform hover:scale-110 ${
                  currentColor.toLowerCase() === c.color.toLowerCase()
                    ? "border-blue-500 dark:border-blue-400 scale-110"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                style={{ backgroundColor: c.color, width: 24, height: 24 }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentColor}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-9 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">More colors</span>
          </div>
        </section>

        {/* Text color */}
        {onTextColorChange && (
          <section>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Text color</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => onTextColorChange(c.color)}
                  title={c.label}
                  className={`rounded-full border-2 transition-transform hover:scale-110 ${
                    (textColor || "").toLowerCase() === c.color.toLowerCase()
                      ? "border-blue-500 dark:border-blue-400 scale-110"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                  style={{ backgroundColor: c.color, width: 24, height: 24 }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textColor || "#1a1a1a"}
                onChange={(e) => onTextColorChange(e.target.value)}
                className="w-9 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">More colors</span>
            </div>
          </section>
        )}

        {/* Size */}
        {onFontSizeChange && (
          <section>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Size</label>
            <div className="flex gap-1.5 flex-wrap">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFontSizeChange(s.id)}
                  title={s.label}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${btn} ${
                    (fontSize || "medium") === s.id ? btnActive : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Font */}
        {onFontFamilyChange && (
          <section>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Font</label>
            <div className="flex flex-wrap gap-1.5">
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFontFamilyChange(f.id)}
                  title={f.label}
                  className={`px-2.5 py-1.5 text-xs rounded-lg ${btn} ${
                    (fontFamily || "sans") === f.id ? btnActive : "text-gray-600 dark:text-gray-300"
                  }`}
                  style={{
                    fontFamily:
                      f.id === "serif"
                        ? "Georgia, serif"
                        : f.id === "mono"
                          ? "'Courier New', monospace"
                          : f.id === "hand"
                            ? "'Segoe Script', 'Comic Sans MS', cursive"
                            : "-apple-system, sans-serif",
                  }}
                >
                  {f.display}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Style (Bold / Italic) */}
        {(onFontWeightChange || onFontStyleChange) && (
          <section>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Style</label>
            <div className="flex flex-wrap gap-2">
              {onFontWeightChange && (
                <>
                  <button
                    type="button"
                    onClick={() => onFontWeightChange("normal")}
                    className={`px-2.5 py-1.5 text-xs rounded-lg ${btn} ${(fontWeight || "normal") === "normal" ? btnActive : ""}`}
                  >
                    Regular
                  </button>
                  <button
                    type="button"
                    onClick={() => onFontWeightChange("bold")}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg ${btn} ${(fontWeight || "normal") === "bold" ? btnActive : ""}`}
                  >
                    Bold
                  </button>
                </>
              )}
              {onFontStyleChange && (
                <>
                  <button
                    type="button"
                    onClick={() => onFontStyleChange("normal")}
                    className={`px-2.5 py-1.5 text-xs rounded-lg ${btn} ${(fontStyle || "normal") === "normal" ? btnActive : ""}`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => onFontStyleChange("italic")}
                    className={`px-2.5 py-1.5 text-xs italic rounded-lg ${btn} ${(fontStyle || "normal") === "italic" ? btnActive : ""}`}
                  >
                    Italic
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* Align */}
        {onTextAlignChange && (
          <section>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Alignment</label>
            <div className="flex gap-1.5 flex-wrap">
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => onTextAlignChange(align)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize rounded-lg ${btn} ${
                    (textAlign || "left") === align ? btnActive : ""
                  }`}
                >
                  {align}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
