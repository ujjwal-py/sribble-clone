import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { socket } from '../socket';
import type { DrawTool, Point, Stroke } from '../types';

const MOVE_INTERVAL_MS = 30;

export interface CanvasHandle {
  /** Replaces the canvas with an authoritative stroke list (undo, clear, sync). */
  setStrokes(strokes: Stroke[]): void;
  startRemoteStroke(stroke: Stroke): void;
  addRemotePoint(strokeId: string, x: number, y: number): void;
}

interface CanvasBoardProps {
  canDraw: boolean;
  tool: DrawTool;
  color: string;
  size: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function eraserSize(brushSize: number): number {
  return Math.min(0.07, Math.max(0.022, brushSize * 3.2));
}

function hexToRgba(hex: string): [number, number, number, number] {
  const value = hex.replace('#', '');
  if (value.length !== 6) return [0, 0, 0, 255];

  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed)) return [0, 0, 0, 255];

  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255, 255];
}

/**
 * Rasterizes a paint-bucket click against the canvas as it looks right now.
 * The operation itself is stored server-side in stroke order so undo/redraw can
 * replay it; the pixel work is necessarily local to each browser.
 */
function applyFill(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  color: string,
  point: Point,
): boolean {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return false;

  const startX = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  const startIndex = (startY * width + startX) * 4;
  const target = [
    data[startIndex],
    data[startIndex + 1],
    data[startIndex + 2],
    data[startIndex + 3],
  ];
  const fill = hexToRgba(color);

  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === fill[3]
  ) {
    return false;
  }

  function matches(x: number, y: number): boolean {
    const index = (y * width + x) * 4;
    return (
      data[index] === target[0] &&
      data[index + 1] === target[1] &&
      data[index + 2] === target[2] &&
      data[index + 3] === target[3]
    );
  }

  function paintPixel(x: number, y: number): void {
    const index = (y * width + x) * 4;
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = fill[3];
  }

  // Scanline flood fill. Each stack entry is a seed in a contiguous run; the
  // whole run is painted at once, which is much faster than per-pixel recursion.
  const stack: number[] = [startX, startY];

  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (!matches(x, y)) continue;

    let left = x;
    let right = x;
    while (left > 0 && matches(left - 1, y)) left -= 1;
    while (right < width - 1 && matches(right + 1, y)) right += 1;

    for (let px = left; px <= right; px += 1) paintPixel(px, y);

    for (const nextY of [y - 1, y + 1]) {
      if (nextY < 0 || nextY >= height) continue;

      let nextX = left;
      while (nextX <= right) {
        while (nextX <= right && !matches(nextX, nextY)) nextX += 1;
        if (nextX > right) break;

        stack.push(nextX, nextY);
        while (nextX <= right && matches(nextX, nextY)) nextX += 1;
      }
    }
  }

  context.putImageData(image, 0, 0);
  return true;
}

function paintStroke(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stroke: Stroke,
): void {
  if (stroke.points.length === 0) return;

  const lineWidth = Math.max(1, stroke.size * canvas.width);
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x * canvas.width, point.y * canvas.height, lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  const [first, ...rest] = stroke.points;
  context.beginPath();
  context.moveTo(first.x * canvas.width, first.y * canvas.height);

  for (const point of rest) {
    context.lineTo(point.x * canvas.width, point.y * canvas.height);
  }

  context.stroke();
}

function paintSegment(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stroke: Stroke,
  from: Point,
  to: Point,
): void {
  context.strokeStyle = stroke.color;
  context.lineWidth = Math.max(1, stroke.size * canvas.width);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x * canvas.width, from.y * canvas.height);
  context.lineTo(to.x * canvas.width, to.y * canvas.height);
  context.stroke();
}

const CanvasBoard = forwardRef<CanvasHandle, CanvasBoardProps>(function CanvasBoard(
  { canDraw, tool, color, size },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeId = useRef<string | null>(null);
  const lastSentAt = useRef(0);
  const pendingPoint = useRef<Point | null>(null);
  const flushTimer = useRef<number | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);

  function context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function redraw(): void {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      if (stroke.tool === 'fill') {
        const seed = stroke.points[0];
        if (seed) applyFill(ctx, canvas, stroke.color, seed);
      } else {
        paintStroke(ctx, canvas, stroke);
      }
    }
  }

  redrawRef.current = redraw;

  function sendPending(): void {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }

    const point = pendingPoint.current;
    pendingPoint.current = null;
    if (!point) return;

    lastSentAt.current = performance.now();
    socket.emit('draw_move', { x: point.x, y: point.y });
  }

  function schedulePoint(point: Point): void {
    const elapsed = performance.now() - lastSentAt.current;

    if (elapsed >= MOVE_INTERVAL_MS) {
      // Drop an older queued point; the newest point is more important.
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      pendingPoint.current = null;
      lastSentAt.current = performance.now();
      socket.emit('draw_move', { x: point.x, y: point.y });
      return;
    }

    pendingPoint.current = point;

    if (flushTimer.current === null) {
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        const queued = pendingPoint.current;
        pendingPoint.current = null;
        if (!queued) return;
        lastSentAt.current = performance.now();
        socket.emit('draw_move', { x: queued.x, y: queued.y });
      }, MOVE_INTERVAL_MS - elapsed);
    }
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function appendLocalPoint(point: Point): boolean {
    const stroke = strokesRef.current.find(
      (candidate) => candidate.id === activeStrokeId.current,
    );
    if (!stroke) return false;

    const previous = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);

    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) paintSegment(ctx, canvas, stroke, previous, point);

    schedulePoint(point);
    return true;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!canDraw || event.button !== 0 || activeStrokeId.current) return;

    const point = pointFromEvent(event);

    if (tool === 'fill') {
      const canvas = canvasRef.current;
      const ctx = context();
      if (!canvas || !ctx) return;
      if (!applyFill(ctx, canvas, color, point)) return;

      const operation: Stroke = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'fill',
        color,
        size: 0,
        points: [point],
      };
      strokesRef.current.push(operation);

      // A fill is one operation: start records it, end closes the event pair.
      socket.emit('draw_start', {
        x: point.x,
        y: point.y,
        color,
        size: 0,
        tool: 'fill',
      });
      socket.emit('draw_end');
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool,
      // White paint is visually identical to erasing on the white canvas, and
      // keeps eraser strokes replayable with the same stroke model as brushes.
      color: tool === 'eraser' ? '#ffffff' : color,
      size: tool === 'eraser' ? eraserSize(size) : size,
      points: [point],
    };

    strokesRef.current.push(stroke);
    activeStrokeId.current = stroke.id;
    pendingPoint.current = null;
    lastSentAt.current = performance.now();

    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) paintStroke(ctx, canvas, stroke);

    // The first point travels with draw_start; later points use throttled draw_move.
    socket.emit('draw_start', {
      x: point.x,
      y: point.y,
      color: stroke.color,
      size: stroke.size,
      tool: stroke.tool,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!canDraw || !activeStrokeId.current) return;
    appendLocalPoint(pointFromEvent(event));
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!activeStrokeId.current) return;

    const stroke = strokesRef.current.find(
      (candidate) => candidate.id === activeStrokeId.current,
    );

    if (stroke) {
      const point = pointFromEvent(event);
      const previous = stroke.points[stroke.points.length - 1];
      if (previous.x !== point.x || previous.y !== point.y) {
        stroke.points.push(point);
        const canvas = canvasRef.current;
        const ctx = context();
        if (canvas && ctx) paintSegment(ctx, canvas, stroke, previous, point);
        pendingPoint.current = point;
      }
    }

    // Make sure the last point reaches the server before draw_end.
    sendPending();
    activeStrokeId.current = null;
    socket.emit('draw_end');
  }

  function resetLocalState(): void {
    activeStrokeId.current = null;
    pendingPoint.current = null;
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    setStrokes(strokes: Stroke[]): void {
      resetLocalState();
      strokesRef.current = strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      }));
      redrawRef.current();
    },

    startRemoteStroke(stroke: Stroke): void {
      const copy: Stroke = {
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      };
      strokesRef.current.push(copy);

      const canvas = canvasRef.current;
      const ctx = context();
      if (!canvas || !ctx) return;

      if (copy.tool === 'fill') {
        const seed = copy.points[0];
        if (seed) applyFill(ctx, canvas, copy.color, seed);
        return;
      }

      paintStroke(ctx, canvas, copy);
    },

    addRemotePoint(strokeId: string, x: number, y: number): void {
      const stroke = [...strokesRef.current]
        .reverse()
        .find((candidate) => candidate.id === strokeId);
      if (!stroke || stroke.tool === 'fill') return;

      const point = { x: clamp01(x), y: clamp01(y) };
      const previous = stroke.points[stroke.points.length - 1];
      stroke.points.push(point);

      const canvas = canvasRef.current;
      const ctx = context();
      if (canvas && ctx) paintSegment(ctx, canvas, stroke, previous, point);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      redrawRef.current();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`drawing-canvas ${canDraw ? `drawing-canvas-active drawing-canvas-${tool}` : ''}`}
      aria-label={
        canDraw
          ? `Drawing canvas. ${tool} tool active. Draw with your mouse or finger.`
          : 'Drawing canvas'
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onLostPointerCapture={(event) => {
        if (activeStrokeId.current) finishStroke(event);
      }}
    />
  );
});

export default CanvasBoard;
