"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import { getPages, loadPageImage, saveProject } from '@/lib/localDB';
import { getProjectById } from '@/lib/localDB';
import { useRouter } from 'next/navigation';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface StudyProps {
  projectData: ProjectData;
  projectId: string;
  activeReading: ReadingData;
  onUpdate: () => void;
  setHeaderAction: (node: React.ReactNode | null) => void;
  [key: string]: any;
}

const REVISION_INTERVALS = [1, 3, 7, 14, 30]; // Days for each repetition

export default function Study({ projectId, projectData, activeReading, onUpdate, setHeaderAction, ...props }: StudyProps) {
  const router = useRouter();
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);

  // Track which pages are marked as read in this session
  const [readPages, setReadPages] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Currently visible page (tracked by IntersectionObserver)
  const [visiblePageNum, setVisiblePageNum] = useState<number | null>(null);

  // Refs for IntersectionObserver
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Zoom transform ref (for double-tap reset)
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const isZoomedRef = useRef<boolean>(false);

  // Double-tap detection
  const lastTapRef = useRef<number>(0);

  // ─────────────────────────────────────────────
  // LOAD PAGES
  // ─────────────────────────────────────────────
  useEffect(() => {
    async function loadPages() {
      try {
        const allPages = await getPages(projectId);
        const sorted = allPages.sort((a, b) => a.pageNum - b.pageNum);
        const startPage = activeReading.leftOffPage || 1;
        const relevantPages = sorted.filter(p => p.pageNum >= startPage).slice(0, 50);
        const loadedPages = await Promise.all(relevantPages.map(p => loadPageImage(p)));
        setPages(loadedPages);
        if (loadedPages.length > 0) {
          setVisiblePageNum(loadedPages[0].pageNum);
        }
      } catch (err) {
        console.error("Error loading pages", err);
      } finally {
        setLoading(false);
      }
    }
    loadPages();
  }, [projectId, activeReading.leftOffPage]);

  // ─────────────────────────────────────────────
  // INTERSECTION OBSERVER — track visible page
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (pages.length === 0) return;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Pick the entry with highest intersection ratio
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best) {
          const pageNum = Number((best.target as HTMLElement).dataset.pagenum);
          if (!isNaN(pageNum)) setVisiblePageNum(pageNum);
        }
      },
      { threshold: [0.1, 0.3, 0.5, 0.7] }
    );

    pageRefs.current.forEach((el) => {
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [pages]);

  // ─────────────────────────────────────────────
  // MARK AS READ TOGGLE
  // ─────────────────────────────────────────────
  const toggleMarkAsRead = useCallback((pageNum: number) => {
    setReadPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageNum)) newSet.delete(pageNum);
      else newSet.add(pageNum);
      return newSet;
    });
  }, []);

  // ─────────────────────────────────────────────
  // DONE FOR TODAY
  // ─────────────────────────────────────────────
  const handleDoneForToday = useCallback(async () => {
    if (readPages.size === 0) {
      alert("You haven't marked any pages as read yet!");
      return;
    }

    setIsSaving(true);
    try {
      const readArray = Array.from(readPages).sort((a, b) => a - b);
      const maxPageRead = readArray[readArray.length - 1];
      const newLeftOffPage = Math.max(activeReading.leftOffPage || 1, maxPageRead + 1);

      const updatedReadings = (projectData.readings || []).map(r =>
        r.title === activeReading.title ? { ...r, leftOffPage: newLeftOffPage } : r
      );

      const existingTasks = projectData.srsTasks || [];
      const newTasks: any[] = [];
      const today = new Date();

      readArray.forEach(pageNum => {
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + REVISION_INTERVALS[0]);
        newTasks.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          readingTitle: activeReading.title,
          page: pageNum,
          repetitionIndex: 0,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending'
        });
      });

      const finalTasks = [...existingTasks, ...newTasks];
      const proj = await getProjectById(projectId);
      if (proj) {
        await saveProject({ ...proj, readings: updatedReadings, srsTasks: finalTasks });
      }

      onUpdate();
      alert(`Awesome! You read ${readPages.size} pages today. They've been added to your Revision schedule.`);
      router.push(`/project?id=${projectId}`);
    } catch (err) {
      console.error(err);
      alert("Error saving progress.");
    } finally {
      setIsSaving(false);
    }
  }, [readPages, activeReading, projectData, projectId, onUpdate, router]);

  // ─────────────────────────────────────────────
  // HEADER ACTION
  // ─────────────────────────────────────────────
  useEffect(() => {
    setHeaderAction(
      <button
        className="btn btn-primary"
        onClick={handleDoneForToday}
        disabled={isSaving || readPages.size === 0}
      >
        {isSaving ? "Saving..." : `Done for Today${readPages.size > 0 ? ` (${readPages.size})` : ''}`}
      </button>
    );
    return () => setHeaderAction(null);
  }, [handleDoneForToday, setHeaderAction, isSaving, readPages.size]);

  // ─────────────────────────────────────────────
  // DOUBLE TAP to zoom toggle
  // ─────────────────────────────────────────────
  const handleDoubleTap = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300) {
      // Double tap detected — toggle between zoomed and reset
      if (isZoomedRef.current) {
        transformRef.current?.resetTransform();
        isZoomedRef.current = false;
      } else {
        transformRef.current?.zoomIn(1.5);
        isZoomedRef.current = true;
      }
    }
  }, []);

  // ─────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a1a', zIndex: 1000
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: 'white', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem'
          }} />
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Loading viewer...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isCurrentPageRead = visiblePageNum !== null && readPages.has(visiblePageNum);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#1a1a1a',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Scrollable + Zoomable area ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
        onTouchEnd={handleDoubleTap}
      >
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.5}
          maxScale={4}
          panning={{ disabled: false, velocityDisabled: false }}
          pinch={{ disabled: false }}
          doubleClick={{ disabled: true }} // We handle manually for better control
          wheel={{ disabled: false, step: 0.1 }}
          centerOnInit={false}
          limitToBounds={false}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', display: 'block' }}
            contentStyle={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                alignItems: 'center',
                gap: '12px',
                paddingTop: '12px',
                paddingBottom: '80px', // space for floating bar
              }}
            >
              {pages.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  <h3 style={{ color: 'white' }}>You have reached the end!</h3>
                  <p>No more pages available for this reading.</p>
                </div>
              ) : null}

              {pages.map(p => {
                const isRead = readPages.has(p.pageNum);
                return (
                  <div
                    key={p.id}
                    data-pagenum={p.pageNum}
                    ref={el => {
                      if (el) pageRefs.current.set(p.pageNum, el);
                      else pageRefs.current.delete(p.pageNum);
                    }}
                    style={{
                      width: '100%',
                      maxWidth: '800px',
                      position: 'relative',
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {/* Read indicator strip */}
                    {isRead && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '4px',
                        height: '100%',
                        background: '#22c55e',
                        zIndex: 2,
                        borderRadius: '0 2px 2px 0',
                      }} />
                    )}

                    <img
                      src={p.imageUrl}
                      alt={`Page ${p.pageNum}`}
                      style={{
                        width: '100%',
                        display: 'block',
                        opacity: isRead ? 0.75 : 1,
                        transition: 'opacity 0.2s',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        pointerEvents: 'none', // prevent drag interference
                      }}
                      draggable={false}
                    />

                    {/* Page number badge */}
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      background: 'rgba(0,0,0,0.55)',
                      color: 'white',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backdropFilter: 'blur(4px)',
                      zIndex: 2,
                    }}>
                      {p.pageNum}
                    </div>
                  </div>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* ── Floating Bottom Bar ── */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(15,15,15,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        gap: '12px',
      }}>
        {/* Left: page info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.5)',
            whiteSpace: 'nowrap',
          }}>
            📄 Page
          </span>
          <span style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'white',
          }}>
            {visiblePageNum ?? '—'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>
            / {pages.length > 0 ? pages[pages.length - 1].pageNum : '?'}
          </span>
        </div>

        {/* Center: marked count */}
        {readPages.size > 0 && (
          <div style={{
            fontSize: '0.8rem',
            color: '#22c55e',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>
            ✓ {readPages.size} marked
          </div>
        )}

        {/* Right: Mark as Read button */}
        <button
          onClick={() => visiblePageNum !== null && toggleMarkAsRead(visiblePageNum)}
          disabled={visiblePageNum === null}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '999px',
            border: 'none',
            cursor: visiblePageNum === null ? 'default' : 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.2s',
            background: isCurrentPageRead
              ? 'rgba(34,197,94,0.2)'
              : 'rgba(255,255,255,0.1)',
            color: isCurrentPageRead ? '#22c55e' : 'rgba(255,255,255,0.8)',
            outline: isCurrentPageRead ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        >
          {isCurrentPageRead ? '✓ Read' : '○ Mark Read'}
        </button>
      </div>
    </div>
  );
}
