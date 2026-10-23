interface DrawingToolbarProps {
  color: string;
  size: number;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

const COLORS = [
  '#111827',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
];

const SIZES = [
  { label: 'Thin', value: 0.005 },
  { label: 'Thick', value: 0.015 },
];

export default function DrawingToolbar({
  color,
  size,
  onColorChange,
  onSizeChange,
  onUndo,
  onClear,
}: DrawingToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-group" aria-label="Brush color">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`swatch ${color === swatch ? 'swatch-selected' : ''}`}
            style={{ backgroundColor: swatch }}
            onClick={() => onColorChange(swatch)}
            aria-label={`Use color ${swatch}`}
            aria-pressed={color === swatch}
          />
        ))}
      </div>

      <div className="toolbar-group" aria-label="Brush size">
        {SIZES.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`tool-button ${size === option.value ? 'tool-button-active' : ''}`}
            onClick={() => onSizeChange(option.value)}
            aria-pressed={size === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group toolbar-actions">
        <button type="button" className="tool-button" onClick={onUndo}>
          Undo
        </button>
        <button
          type="button"
          className="tool-button tool-button-danger"
          onClick={() => {
            if (window.confirm('Clear the canvas for everyone?')) onClear();
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
