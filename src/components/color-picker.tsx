"use client";

import { useState, useRef, useEffect } from "react";

export type FontSize = "small" | "medium" | "large" | "xl";
export type FontFamily = "sans" | "serif" | "mono" | "hand";
export type FontWeight = "normal" | "bold";
export type FontStyle = "normal" | "italic";
export type TextAlign = "left" | "center" | "right";
type OpenSection = "fill" | "text" | "size" | "font" | "style" | "align" | null;

export interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  elementType: "sticky_note" | "rectangle" | "circle" | "text";
  textColor?: string;
  onTextColorChange?: (color: string) => void;
  fontSize?: FontSize;
  onFontSizeChange?: (size: FontSize) => void;
  fontFamily?: FontFamily;
  onFontFamilyChange?: (family: FontFamily) => void;
  fontWeight?: FontWeight;
  onFontWeightChange?: (weight: FontWeight) => void;
  fontStyle?: FontStyle;
  onFontStyleChange?: (style: FontStyle) => void;
  textAlign?: TextAlign;
  onTextAlignChange?: (align: TextAlign) => void;
}

export const STICKY_COLORS = [
  { color: "#FFEB3B", label: "Yellow" },
  { color: "#FF9800", label: "Orange" },
  { color: "#F48FB1", label: "Pink" },
  { color: "#CE93D8", label: "Purple" },
  { color: "#90CAF9", label: "Blue" },
  { color: "#80CBC4", label: "Teal" },
  { color: "#A5D6A7", label: "Green" },
  { color: "#FFFFFF", label: "White" },
];

export const SHAPE_COLORS = [
  { color: "#3B82F6", label: "Blue" },
  { color: "#EF4444", label: "Red" },
  { color: "#10B981", label: "Green" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EC4899", label: "Pink" },
  { color: "#06B6D4", label: "Cyan" },
  { color: "#6B7280", label: "Gray" },
];

export const TEXT_COLORS = [
  { color: "#1a1a1a", label: "Black" },
  { color: "#ffffff", label: "White" },
  { color: "#EF4444", label: "Red" },
  { color: "#3B82F6", label: "Blue" },
  { color: "#10B981", label: "Green" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EC4899", label: "Pink" },
];

export const FONT_SIZES: { id: FontSize; label: string; icon: string }[] = [
  { id: "small", label: "Small", icon: "S" },
  { id: "medium", label: "Medium", icon: "M" },
  { id: "large", label: "Large", icon: "L" },
  { id: "xl", label: "XL", icon: "X" },
];

export const FONT_FAMILIES: { id: FontFamily; label: string; display: string; preview: string }[] = [
  { id: "sans", label: "Sans-serif", display: "Sans", preview: "font-sans" },
  { id: "serif", label: "Serif", display: "Serif", preview: "font-serif" },
  { id: "mono", label: "Monospace", display: "Mono", preview: "font-mono" },
  { id: "hand", label: "Handwritten", display: "Hand", preview: "" },
];

export function ColorPicker({
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
}: ColorPickerProps) {
  const [openSection, setOpenSection] = useState<OpenSection>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fillColorInputRef = useRef<HTMLInputElement>(null);
  const textColorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const colors = elementType === "sticky_note" ? STICKY_COLORS : SHAPE_COLORS;
  const currentSizeLabel = FONT_SIZES.find((s) => s.id === (fontSize || "medium"))?.label ?? "Medium";
  const currentFontLabel = FONT_FAMILIES.find((f) => f.id === (fontFamily || "sans"))?.display ?? "Sans";
  const currentAlignLabel = (textAlign || "left") === "center" ? "Center" : (textAlign || "left") === "right" ? "Right" : "Left";

  const toggle = (section: OpenSection) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const trigger =
    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border " +
    "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700";

  const triggerActive =
    "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300";

  return (
    <div ref={containerRef} className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 flex flex-col gap-2">
      {/* One row: dropdown triggers — only one section open at a time */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle("fill");
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${trigger} ${openSection === "fill" ? triggerActive : ""}`}
          title="Fill color"
        >
          <span className="rounded-full border border-gray-300 dark:border-gray-600 w-4 h-4 shrink-0" style={{ backgroundColor: currentColor }} />
          <span>Fill</span>
          <span className="text-[10px] opacity-70">{openSection === "fill" ? "▲" : "▼"}</span>
        </button>
        {onTextColorChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle("text");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${trigger} ${openSection === "text" ? triggerActive : ""}`}
            title="Text color"
          >
            <span className="rounded-full border border-gray-300 dark:border-gray-600 w-4 h-4 shrink-0" style={{ backgroundColor: textColor || "#1a1a1a" }} />
            <span>Text</span>
            <span className="text-[10px] opacity-70">{openSection === "text" ? "▲" : "▼"}</span>
          </button>
        )}
        {onFontSizeChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle("size");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${trigger} ${openSection === "size" ? triggerActive : ""}`}
            title="Font size"
          >
            <span>Size</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{currentSizeLabel}</span>
            <span className="text-[10px] opacity-70">{openSection === "size" ? "▲" : "▼"}</span>
          </button>
        )}
        {onFontFamilyChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle("font");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${trigger} ${openSection === "font" ? triggerActive : ""}`}
            title="Font family"
          >
            <span>{currentFontLabel}</span>
            <span className="text-[10px] opacity-70">{openSection === "font" ? "▲" : "▼"}</span>
          </button>
        )}
        {(onFontWeightChange || onFontStyleChange) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle("style");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${trigger} ${openSection === "style" ? triggerActive : ""}`}
            title="Bold & italic"
          >
            <span className="font-bold">B</span>
            <span className="italic text-[10px]">I</span>
            <span className="text-[10px] opacity-70">{openSection === "style" ? "▲" : "▼"}</span>
          </button>
        )}
        {onTextAlignChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle("align");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${trigger} ${openSection === "align" ? triggerActive : ""}`}
            title="Text alignment"
          >
            <span>{currentAlignLabel}</span>
            <span className="text-[10px] opacity-70">{openSection === "align" ? "▲" : "▼"}</span>
          </button>
        )}
      </div>

      {/* Expanded content for the open section only */}
      {openSection === "fill" && (
        <div className="flex flex-col gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 flex-wrap">
            {colors.map((c) => (
              <button
                key={c.color}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onColorChange(c.color);
                  setOpenSection(null);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={c.label}
                className={`rounded-full border-2 transition-transform hover:scale-110 ${
                  currentColor.toLowerCase() === c.color.toLowerCase()
                    ? "border-blue-500 dark:border-blue-400 scale-110"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                style={{ backgroundColor: c.color, width: 22, height: 22 }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={fillColorInputRef}
              type="color"
              value={currentColor}
              onChange={(e) => {
                e.stopPropagation();
                onColorChange(e.target.value);
              }}
              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fillColorInputRef.current?.click();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              More colors…
            </button>
          </div>
        </div>
      )}
      {openSection === "text" && onTextColorChange && (
        <div className="flex flex-col gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 flex-wrap">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTextColorChange(c.color);
                  setOpenSection(null);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={c.label}
                className={`rounded-full border-2 transition-transform hover:scale-110 ${
                  (textColor || "").toLowerCase() === c.color.toLowerCase()
                    ? "border-blue-500 dark:border-blue-400 scale-110"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                style={{ backgroundColor: c.color, width: 22, height: 22 }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={textColorInputRef}
              type="color"
              value={textColor || "#1a1a1a"}
              onChange={(e) => {
                e.stopPropagation();
                onTextColorChange(e.target.value);
              }}
              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                textColorInputRef.current?.click();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              More colors…
            </button>
          </div>
        </div>
      )}
      {openSection === "size" && onFontSizeChange && (
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" onMouseDown={(e) => e.stopPropagation()}>
          {FONT_SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFontSizeChange(s.id);
                setOpenSection(null);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={s.label}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                (fontSize || "medium") === s.id
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {s.icon}
            </button>
          ))}
        </div>
      )}
      {openSection === "font" && onFontFamilyChange && (
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-wrap" onMouseDown={(e) => e.stopPropagation()}>
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFontFamilyChange(f.id);
                setOpenSection(null);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={f.label}
              className={`px-2 py-1 rounded-md text-[11px] transition-all ${
                (fontFamily || "sans") === f.id
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm font-semibold"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
      )}
      {openSection === "style" && (onFontWeightChange || onFontStyleChange) && (
        <div className="flex flex-col gap-2" onMouseDown={(e) => e.stopPropagation()}>
          {onFontWeightChange && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 w-10 shrink-0">Weight</span>
              <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFontWeightChange("normal");
                    setOpenSection(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-2 py-1 rounded-md text-[11px] ${(fontWeight || "normal") === "normal" ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm font-medium" : "text-gray-500 dark:text-gray-400"}`}
                >
                  Regular
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFontWeightChange("bold");
                    setOpenSection(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold ${(fontWeight || "normal") === "bold" ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}
                >
                  Bold
                </button>
              </div>
            </div>
          )}
          {onFontStyleChange && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 w-10 shrink-0">Style</span>
              <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFontStyleChange("normal");
                    setOpenSection(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-2 py-1 rounded-md text-[11px] ${(fontStyle || "normal") === "normal" ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFontStyleChange("italic");
                    setOpenSection(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-2 py-1 rounded-md text-[11px] italic ${(fontStyle || "normal") === "italic" ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}
                >
                  Italic
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {openSection === "align" && onTextAlignChange && (
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" onMouseDown={(e) => e.stopPropagation()}>
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTextAlignChange(align);
                setOpenSection(null);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={align.charAt(0).toUpperCase() + align.slice(1)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize ${
                (textAlign || "left") === align
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
