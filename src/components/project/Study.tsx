"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import type { Stroke } from '@/types/project';
import {
  getPages,
  loadPageImage,
  saveProject,
  getProjectById,
  updatePageDrawings,
} from '@/lib/localDB';
import { useRouter } from 'next/navigation';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import DrawingCanvas from './DrawingCanvas';

const REVISION_INTERVALS = [1, 3, 7, 14, 30];
const PEN_COLORS = ['#111111', '#DC2626', '#2563EB', '#16A34A', '#9333EA'];
const HL_COLORS  = ['#FDE047', '#86EFAC', '#F9A8D4', '#93C5FD', '#FCA5A5'];
const PEN_WIDTHS = [{ label: 'S', value: 3 }, { label: 'M', value: 6 }, { label: 'L', value: 12 }];
const HL_WIDTHS  = [{ label: 'S', value: 18 }, { label: 'L', value: 30 }];

type ActiveTool = 'pen' | 'highlighter' | 'eraser' | null;
const TOOL_LABEL: Record<NonNullable<ActiveTool>, string> = {
  pen: '🖊️ Pen', highlighter: '🖍️ Highlight', eraser: '🧹 Erase',
};

interface StudyProps {
  projectData: ProjectData;
  projectId: string;
  activeReading: ReadingData;
  onUpdate: () => void;
  setHeaderAction: (node: React.ReactNode | null) => void;
  [key: string]: any;
}

export default function Study({ projectId, activeReading, onUpdate, setHeaderAction }: StudyProps) {
  const router = useRouter();
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageSizes, setImageSizes] = useState<Map<string, { w: number; h: number }>>(new Map());
  const [readPages, setReadPages] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [pageDrawings, setPageDrawings] = useState<Map<number, Stroke[]>>(new Map());
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [toolColor, setToolColor] = useState('#111111');
  const [toolWidth, setToolWidth] = useState(6);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    async function load() {
      const all = await getPages(projectId);
      const startPage = activeReading.startPage || 1;
      const sorted = all.filter((p) => p.pageNum >= startPage).sort((a, b) => a.pageNum - b.pageNum);
      const loaded = await Promise.all(sorted.map(loadPageImage));
      setPages(loaded);
      const drawMap = new Map<number, Stroke[]>();
      for (const p of loaded) {
        if (p.drawings && p.drawings.length > 0) drawMap.set(p.pageNum, p.drawings as Stroke[]);
      }
      setPageDrawings(drawMap);
      setLoading(false);
    }
    load();
  }, [projectId, activeReading.startPage]);

  useEffect(() => {
    if (loading || hasScrolledRef.current || pages.length === 0) return;
    const leftOff = activeReading.leftOffPage || activeReading.startPage || 1;
    const el = pageRefs.current.get(leftOff);
    if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); hasScrolledRef.current = true; }
  }, [loading, pages, activeReading.leftOffPage, activeReading.startPage]);

  useEffect(() => { setHeaderAction(null); return () => setHeaderAction(null); }, [setHeaderAction]);

  const startHideTimer = useCallback(() => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => { setShowToolbar(false); setShowOptions(false); }, 3000);
  }, []);

  const cancelHideTimer = useCallback(() => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
  }, []);

  const handleToolIcon = useCallback(() => {
    if (activeTool) { setActiveTool(null); setShowOptions(false); setShowToolbar(true); startHideTimer(); }
    else if (showToolbar) { setShowToolbar(false); cancelHideTimer(); }
    else { setShowToolbar(true); startHideTimer(); }
  }, [activeTool, showToolbar, startHideTimer, cancelHideTimer]);

  const selectTool = useCallback((tool: 'pen' | 'highlighter' | 'eraser') => {
    cancelHideTimer();
    if (activeTool === tool) { setActiveTool(null); setShowOptions(false); startHideTimer(); }
    else {
      setActiveTool(tool); setShowToolbar(true); setShowOptions(tool !== 'eraser');
      if (tool === 'pen') { setToolColor('#111111'); setToolWidth(6); }
      else if (tool === 'highlighter') { setToolColor('#FDE047'); setToolWidth(18); }
    }
  }, [activeTool, cancelHideTimer, startHideTimer]);

  const updateDrawings = useCallback((pageNum: number, newStrokes: Stroke[]) => {
    setPageDrawings((prev) => { const next = new Map(prev); next.set(pageNum, newStrokes); return next; });
  }, []);

  const handleImageLoad = useCallback((pageId: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSizes((prev) => { const next = new Map(prev); next.set(pageId, { w: img.naturalWidth, h: img.naturalHeight }); return next; });
  }, []);

  const toggleRead = useCallback(async (page: PageData) => {
    setReadPages((prev) => { const next = new Set(prev); if (next.has(page.pageNum)) next.delete(page.pageNum); else next.add(page.pageNum); return next; });
    const strokes = pageDrawings.get(page.pageNum) || [];
    await updatePageDrawings(projectId, page.id, strokes as any[]);
  }, [pageDrawings, projectId]);

  const handleDoneForToday = useCallback(async () => {
    if (readPages.size === 0) return;
    setIsSaving(true);
    try {
      const readArr = Array.from(readPages).sort((a, b) => a - b);
      const maxPage = readArr[readArr.length - 1];
      const newLeftOff = Math.max(activeReading.leftOffPage || 1, maxPage + 1);
      for (const p of pages) {
        if (readPages.has(p.pageNum)) {
          const strokes = pageDrawings.get(p.pageNum) || [];
          await updatePageDrawings(projectId, p.id, strokes as any[]);
        }
      }
      const today = new Date();
      const newTasks = readArr.map((pageNum) => {
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + REVISION_INTERVALS[0]);
        return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, readingTitle: activeReading.title, page: pageNum, repetitionIndex: 0, dueDate: dueDate.toISOString().split('T')[0], status: 'pending' };
      });
      const proj = await getProjectById(projectId);
      if (proj) {
        const updatedReadings = proj.readings.map((r) => r.title === activeReading.title ? { ...r, leftOffPage: newLeftOff } : r);
        await saveProject({ ...proj, readings: updatedReadings, srsTasks: [...(proj.srsTasks || []), ...newTasks] });
      }
      onUpdate();
      router.push(`/project?id=${projectId}`);
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  }, [readPages, pages, pageDrawings, activeReading, projectId, onUpdate, router]);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0d0d0d', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', margin: 0 }}>Loading pages…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const colors = activeTool === 'highlighter' ? HL_COLORS : PEN_COLORS;
  const widths  = activeTool === 'highlighter' ? HL_WIDTHS  : PEN_WIDTHS;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d0d', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none' }}>

        <button onClick={() => router.push(`/project?id=${projectId}`)} style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, color: 'white', padding: '7px 14px', fontSize: '0.85rem', cursor: 'pointer' }}>
          ← Back
        </button>

        <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>

            <div style={{ position: 'relative' }}>
              <button onClick={handleToolIcon} style={{ background: activeTool ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, color: activeTool ? '#111' : 'white', padding: '7px 14px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: activeTool ? 700 : 400, transition: 'all 0.15s' }}>
                {activeTool ? TOOL_LABEL[activeTool] : '✏️ Tools'}
              </button>
              {showToolbar && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'rgba(15,15,15,0.97)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '8px 10px', display: 'flex', gap: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.6)', animation: 'fadeIn 0.15s ease' }}>
                  {(['pen', 'highlighter', 'eraser'] as const).map((tool) => (
                    <button key={tool} onClick={() => selectTool(tool)} style={{ background: activeTool === tool ? 'white' : 'rgba(255,255,255,0.08)', color: activeTool === tool ? '#111' : 'white', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.12s' }}>
                      {tool === 'pen' ? '🖊️ Pen' : tool === 'highlighter' ? '🖍️ Highlight' : '🧹 Erase'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleDoneForToday} disabled={isSaving || readPages.size === 0} style={{ background: readPages.size > 0 ? 'rgba(22,163,74,0.92)' : 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, color: 'white', padding: '7px 14px', fontSize: '0.85rem', cursor: readPages.size > 0 ? 'pointer' : 'default', opacity: isSaving ? 0.6 : 1, fontWeight: readPages.size > 0 ? 700 : 400, transition: 'all 0.2s' }}>
              {isSaving ? '…' : readPages.size > 0 ? `✓ Done (${readPages.size})` : 'Done for Today'}
            </button>
          </div>

          {activeTool && activeTool !== 'eraser' && showOptions && (
            <div style={{ background: 'rgba(15,15,15,0.97)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.6)', animation: 'fadeIn 0.15s ease' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {colors.map((c) => (
                  <button key={c} onClick={() => setToolColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer', border: toolColor === c ? '3px solid white' : '2px solid rgba(255,255,255,0.2)', transition: 'border 0.1s' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {widths.map((w) => (
                  <button key={w.value} onClick={() => setToolWidth(w.value)} style={{ background: toolWidth === w.value ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.1)', color: toolWidth === w.value ? '#111' : 'white', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700, transition: 'all 0.12s' }}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 64, paddingBottom: 32 }}>
        <TransformWrapper minScale={0.5} maxScale={5} centerOnInit={false} limitToBounds={false} doubleClick={{ disabled: true }} panning={{ disabled: false, velocityDisabled: false }}>
          <TransformComponent wrapperStyle={{ width: '100%', display: 'block' }} contentStyle={{ width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 3 }}>
              {pages.map((p) => {
                const isRead  = readPages.has(p.pageNum);
                const imgSize = imageSizes.get(p.id);
                const strokes = pageDrawings.get(p.pageNum) || [];
                return (
                  <div key={p.id} data-pagenum={p.pageNum}
                    ref={(el) => { if (el) pageRefs.current.set(p.pageNum, el); else pageRefs.current.delete(p.pageNum); }}
                    style={{ width: '100%', maxWidth: 840, position: 'relative', background: '#1a1a1a' }}>

                    <img src={p.imageUrl} alt={`Page ${p.pageNum}`} draggable={false}
                      onLoad={(e) => handleImageLoad(p.id, e)}
                      style={{ width: '100%', display: 'block', opacity: isRead ? 0.7 : 1, userSelect: 'none', pointerEvents: 'none', transition: 'opacity 0.2s' }} />

                    <DrawingCanvas activeTool={activeTool} toolColor={toolColor} toolWidth={toolWidth}
                      strokes={strokes} onStrokesChange={(s) => updateDrawings(p.pageNum, s)}
                      canvasWidth={imgSize?.w || 1800} canvasHeight={imgSize?.h || 2400} />

                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, background: isRead ? 'rgba(22,163,74,0.15)' : 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', borderTop: isRead ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px', transition: 'background 0.2s' }}>
                      <span style={{ color: isRead ? 'rgba(134,239,172,0.85)' : 'rgba(255,255,255,0.4)', fontSize: '0.78rem', fontWeight: 600 }}>
                        Page {p.pageNum}
                      </span>
                      <button onClick={() => toggleRead(p)} style={{ background: isRead ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.07)', color: isRead ? '#4ade80' : 'rgba(255,255,255,0.55)', border: isRead ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                        {isRead ? '✓ Read' : '○ Mark Read'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}
