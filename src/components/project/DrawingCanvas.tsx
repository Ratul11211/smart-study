"use client";
import { useRef, useEffect, useCallback } from 'react';
import type { Stroke } from '@/types/project';

interface DrawingCanvasProps {
  activeTool: 'pen' | 'highlighter' | 'eraser' | null;
  toolColor: string;
  toolWidth: number;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  canvasWidth: number;
  canvasHeight: number;
  readOnly?: boolean;
}

export default function DrawingCanvas({
  activeTool,
  toolColor,
  toolWidth,
  strokes,
  onStrokesChange,
  canvasWidth,
  canvasHeight,
  readOnly = false,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const currentToolRef = useRef<'pen' | 'highlighter' | 'eraser' | null>(null);

  // ── Render all strokes ───────────────────────────────────────
  const renderAll = useCallback((list: Stroke[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of list) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = s.tool === 'highlighter' ? 0.38 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    renderAll(strokes);
  }, [strokes, renderAll, canvasWidth, canvasHeight]);

  // ── Touch → canvas coordinates ───────────────────────────────
  const getPoint = useCallback((touch: React.Touch): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  // ── Eraser: proximity check ──────────────────────────────────
  const isNearStroke = useCallback((pt: { x: number; y: number }, s: Stroke): boolean => {
    const threshold = Math.max(35, s.width * 3);
    return s.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < threshold);
  }, []);

  // ── touchstart ───────────────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (readOnly || !activeTool || e.touches.length !== 1) return;
      e.stopPropagation();
      currentToolRef.current = activeTool;
      const pt = getPoint(e.touches[0]);
      isDrawingRef.current = true;

      if (activeTool === 'eraser') {
        const kept = strokes.filter((s) => !isNearStroke(pt, s));
        if (kept.length !== strokes.length) onStrokesChange(kept);
      } else {
        currentPointsRef.current = [pt];
      }
    },
    [readOnly, activeTool, strokes, getPoint, isNearStroke, onStrokesChange]
  );

  // ── touchmove ────────────────────────────────────────────────
  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 1) {
        // Second finger added → cancel drawing, let zoom/pan take over
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        return;
      }
      if (!isDrawingRef.current || !currentToolRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      const pt = getPoint(e.touches[0]);

      if (currentToolRef.current === 'eraser') {
        const kept = strokes.filter((s) => !isNearStroke(pt, s));
        if (kept.length !== strokes.length) onStrokesChange(kept);
        return;
      }

      currentPointsRef.current.push(pt);

      // Live-draw current segment
      const ctx = canvasRef.current?.getContext('2d');
      const pts = currentPointsRef.current;
      if (ctx && pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.strokeStyle = toolColor;
        ctx.lineWidth = toolWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = currentToolRef.current === 'highlighter' ? 0.38 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    [strokes, toolColor, toolWidth, getPoint, isNearStroke, onStrokesChange]
  );

  // ── touchend ─────────────────────────────────────────────────
  const onTouchEnd = useCallback(() => {
    if (!isDrawingRef.current || currentToolRef.current === 'eraser') {
      isDrawingRef.current = false;
      currentToolRef.current = null;
      return;
    }
    const pts = currentPointsRef.current;
    if (pts.length >= 2 && currentToolRef.current) {
      onStrokesChange([
        ...strokes,
        {
          tool: currentToolRef.current as 'pen' | 'highlighter',
          color: toolColor,
          width: toolWidth,
          points: pts,
        },
      ]);
    }
    currentPointsRef.current = [];
    isDrawingRef.current = false;
    currentToolRef.current = null;
  }, [strokes, toolColor, toolWidth, onStrokesChange]);

  const isActive = !readOnly && !!activeTool;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth || 1800}
      height={canvasHeight || 2400}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: isActive ? 'auto' : 'none',
        touchAction: isActive ? 'none' : 'auto',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );
}
