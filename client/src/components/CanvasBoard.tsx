import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { socket } from '../socket';
import type { Point, Stroke } from '../types';

const MOVE_INTERVAL_MS = 30;

export interface CanvasHandle {
  /** Replaces the canvas with an authoritative stroke list (undo, clear, sync). */
  setStrokes(strokes: Stroke[]): void;
  startRemoteStroke(stroke: Stroke): void;
  addRemotePoint(strokeId: string, x: number, y: number): void;
}

interface CanvasBoardProps {
  canDraw: boolean;
  color: string;
  size: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  { canDraw, color, size },
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
      paintStroke(ctx, canvas, stroke);
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
    if (!canDraw || event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const stroke: Stroke = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      color,
      size,
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
    socket.emit('draw_start', { x: point.x, y: point.y, color, size });
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
      if (canvas && ctx) paintStroke(ctx, canvas, copy);
    },

    addRemotePoint(strokeId: string, x: number, y: number): void {
      const stroke = [...strokesRef.current]
        .reverse()
        .find((candidate) => candidate.id === strokeId);
      if (!stroke) return;

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
      className={`drawing-canvas ${canDraw ? 'drawing-canvas-active' : ''}`}
      aria-label={canDraw ? 'Drawing canvas. Draw with your mouse or finger.' : 'Drawing canvas'}
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
