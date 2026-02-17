"use client";

type FontSize = "small" | "medium" | "large";

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  elementType: "sticky_note" | "rectangle" | "circle" | "text";
  textColor?: string;
  onTextColorChange?: (color: string) => void;
  fontSize?: FontSize;
  onFontSizeChange?: (size: FontSize) => void;
}

const STICKY_COLORS = [
  { color: "#FFEB3B", label: "Yellow" },
  { color: "#FF9800", label: "Orange" },
  { color: "#F48FB1", label: "Pink" },
  { color: "#CE93D8", label: "Purple" },
  { color: "#90CAF9", label: "Blue" },
  { color: "#80CBC4", label: "Teal" },
  { color: "#A5D6A7", label: "Green" },
  { color: "#FFFFFF", label: "White" },
];

const SHAPE_COLORS = [
  { color: "#3B82F6", label: "Blue" },
  { color: "#EF4444", label: "Red" },
  { color: "#10B981", label: "Green" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EC4899", label: "Pink" },
  { color: "#06B6D4", label: "Cyan" },
  { color: "#6B7280", label: "Gray" },
];

const TEXT_COLORS = [
  { color: "#1a1a1a", label: "Black" },
  { color: "#ffffff", label: "White" },
  { color: "#EF4444", label: "Red" },
  { color: "#3B82F6", label: "Blue" },
  { color: "#10B981", label: "Green" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EC4899", label: "Pink" },
];

const FONT_SIZES: { id: FontSize; label: string; icon: string }[] = [
  { id: "small", label: "Small", icon: "S" },
  { id: "medium", label: "Medium", icon: "M" },
  { id: "large", label: "Large", icon: "L" },
];

export function ColorPicker({ currentColor, onColorChange, elementType, textColor, onTextColorChange, fontSize, onFontSizeChange }: ColorPickerProps) {
  const colors = elementType === "sticky_note" ? STICKY_COLORS : SHAPE_COLORS;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 w-7 shrink-0">Fill</span>
        {colors.map((c) => (
          <button
            key={c.color}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onColorChange(c.color);
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
      {onTextColorChange && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 w-7 shrink-0">Text</span>
          {TEXT_COLORS.map((c) => (
            <button
              key={c.color}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTextColorChange(c.color);
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
      )}
      {onFontSizeChange && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 w-7 shrink-0">Size</span>
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {FONT_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFontSizeChange(s.id);
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
        </div>
      )}
    </div>
  );
}
