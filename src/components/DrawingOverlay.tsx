import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  tool: 'highlighter' | 'pen';
  points: Point[];
}

export type DrawingTool = 'highlighter' | 'pen' | 'eraser' | null;

interface DrawingOverlayProps {
  pageId: string;
  baseImageUrl: string;
  initialDrawings?: Stroke[];
  activeTool: DrawingTool;
  onDrawingsChange?: (pageId: string, drawings: Stroke[]) => void;
  readOnly?: boolean;
}

export default function DrawingOverlay({ pageId, baseImageUrl, initialDrawings = [], activeTool, onDrawingsChange, readOnly = false }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [strokes, setStrokes] = useState<Stroke[]>(initialDrawings);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Synchronize incoming drawings if they change from props
  useEffect(() => {
    if (initialDrawings.length > 0 && strokes.length === 0) {
      setStrokes(initialDrawings);
    }
  }, [initialDrawings]); 

  const drawStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    allStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      if (stroke.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.strokeStyle = 'rgba(255, 235, 59, 0.4)'; 
        ctx.lineWidth = 30;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 3;
      }
      
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });
  }, [strokes, currentStroke]);

  // Redraw when strokes change
  useEffect(() => {
    drawStrokes();
  }, [drawStrokes]);

  const updateCanvasSize = useCallback(() => {
    if (canvasRef.current && containerRef.current) {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      
      const img = container.querySelector('img.base-img') as HTMLImageElement;
      if (img && img.complete && img.naturalWidth > 0) {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          drawStrokes();
        }
      }
    }
  }, [drawStrokes]);

  useEffect(() => {
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  const getCoordinates = (clientX: number, clientY: number): Point | null => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const pointToSegmentDistance = (p: Point, v: Point, w: Point) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
  };

  // Keep a mutable ref of state for native touch handlers
  const stateRef = useRef({ activeTool, readOnly, isDrawing, currentStroke, strokes });
  useEffect(() => {
    stateRef.current = { activeTool, readOnly, isDrawing, currentStroke, strokes };
  }, [activeTool, readOnly, isDrawing, currentStroke, strokes]);

  const handleErase = useCallback((pt: Point, currentStrokes: Stroke[]) => {
    const ERASE_RADIUS = 20; 
    let strokeRemoved = false;
    
    const newStrokes = [...currentStrokes];
    for (let i = newStrokes.length - 1; i >= 0; i--) {
      const stroke = newStrokes[i];
      let hit = false;
      for (let j = 0; j < stroke.points.length - 1; j++) {
        const dist = pointToSegmentDistance(pt, stroke.points[j], stroke.points[j + 1]);
        if (dist <= ERASE_RADIUS + (stroke.tool === 'highlighter' ? 15 : 2)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        newStrokes.splice(i, 1);
        strokeRemoved = true;
        break; 
      }
    }

    if (strokeRemoved) {
      setStrokes(newStrokes);
      if (onDrawingsChange) onDrawingsChange(pageId, newStrokes);
    }
  }, [onDrawingsChange, pageId]);

  // React Event Listeners (handles both Mouse and Touch via React Synthetic Events)
  const startInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly || !activeTool) return;
    
    // Ignore multi-touch (e.g., two fingers for zooming/scrolling)
    if ('touches' in e && e.touches.length > 1) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const pt = getCoordinates(clientX, clientY);
    if (!pt) return;

    if (activeTool === 'eraser') {
      setIsDrawing(true);
      handleErase(pt, strokes);
    } else {
      setIsDrawing(true);
      setCurrentStroke({
        id: `${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
        tool: activeTool as 'highlighter' | 'pen',
        points: [pt]
      });
    }
  };

  const moveInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly || !activeTool) return;
    
    // Ignore multi-touch (e.g., two fingers for zooming/scrolling)
    if ('touches' in e && e.touches.length > 1) {
      stopInteraction();
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const pt = getCoordinates(clientX, clientY);
    if (!pt) return;

    if (activeTool === 'eraser') {
      handleErase(pt, strokes);
    } else if (currentStroke) {
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, pt]
      });
    }
  };

  const stopInteraction = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (currentStroke && (activeTool === 'highlighter' || activeTool === 'pen')) {
        const newStrokes = [...strokes, currentStroke];
        setStrokes(newStrokes);
        setCurrentStroke(null);
        if (onDrawingsChange) onDrawingsChange(pageId, newStrokes);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', userSelect: 'none' }} ref={containerRef}>
      <img 
        src={baseImageUrl} 
        alt="Page" 
        className="base-img"
        onLoad={updateCanvasSize}
        style={{ width: '100%', display: 'block', pointerEvents: 'none' }} 
      />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: readOnly ? 'default' : (!activeTool ? 'default' : (activeTool === 'eraser' ? 'cell' : 'crosshair')),
          touchAction: readOnly || !activeTool ? 'auto' : 'pinch-zoom' // pinch-zoom blocks 1-finger scroll but allows 2-finger zoom/scroll natively
        }}
        onMouseDown={startInteraction}
        onMouseMove={moveInteraction}
        onMouseUp={stopInteraction}
        onMouseLeave={stopInteraction}
        onTouchStart={startInteraction}
        onTouchMove={moveInteraction}
        onTouchEnd={stopInteraction}
        onTouchCancel={stopInteraction}
      />
    </div>
  );
}
