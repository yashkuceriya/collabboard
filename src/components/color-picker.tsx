"use client";

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  elementType: "sticky_note" | "rectangle" | "circle" | "text";
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

export function ColorPicker({ currentColor, onColorChange, elementType }: ColorPickerProps) {
  const colors = elementType === "sticky_note" ? STICKY_COLORS : SHAPE_COLORS;

  return (
    <div className="flex items-center gap-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-2 py-1.5">
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
          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
            currentColor.toLowerCase() === c.color.toLowerCase()
              ? "border-blue-500 dark:border-blue-400 scale-110"
              : "border-gray-300 dark:border-gray-600"
          }`}
          style={{ backgroundColor: c.color }}
        />
      ))}
    </div>
  );
}
