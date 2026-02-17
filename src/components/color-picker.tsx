"use client";

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  elementType: "sticky_note" | "rectangle" | "circle" | "text";
  textColor?: string;
  onTextColorChange?: (color: string) => void;
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

export function ColorPicker({ currentColor, onColorChange, elementType, textColor, onTextColorChange }: ColorPickerProps) {
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
            className={`w-5.5 h-5.5 rounded-full border-2 transition-transform hover:scale-110 ${
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
    </div>
  );
}
