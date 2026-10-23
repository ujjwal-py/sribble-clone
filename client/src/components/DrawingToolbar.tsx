import type { DrawTool } from '../types';

interface DrawingToolbarProps {
  tool: DrawTool;
  color: string;
  size: number;
  onToolChange: (tool: DrawTool) => void;
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

const TOOLS: { label: string; value: DrawTool }[] = [
  { label: 'Brush', value: 'brush' },
  { label: 'Eraser', value: 'eraser' },
  { label: 'Fill', value: 'fill' },
];

const SIZES = [
  { label: 'Thin', value: 0.005 },
  { label: 'Thick', value: 0.015 },
];

export default function DrawingToolbar({
  tool,
  color,
  size,
  onToolChange,
  onColorChange,
  onSizeChange,
  onUndo,
  onClear,
}: DrawingToolbarProps) {
  const colorDisabled = tool === 'eraser';
  const sizeDisabled = tool === 'fill';

  return (
    <div className="toolbar">
      <div className="toolbar-group" aria-label="Drawing tool">
        {TOOLS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`tool-button ${tool === option.value ? 'tool-button-active' : ''}`}
            onClick={() => onToolChange(option.value)}
            aria-pressed={tool === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group" aria-label="Drawing color">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`swatch ${color === swatch ? 'swatch-selected' : ''}`}
            style={{ backgroundColor: swatch }}
            onClick={() => onColorChange(swatch)}
            aria-label={`Use color ${swatch}`}
            aria-pressed={color === swatch}
            disabled={colorDisabled}
          />
        ))}
      </div>

      <div className="toolbar-group" aria-label="Tool size">
        {SIZES.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`tool-button ${size === option.value ? 'tool-button-active' : ''}`}
            onClick={() => onSizeChange(option.value)}
            aria-pressed={size === option.value}
            disabled={sizeDisabled}
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
