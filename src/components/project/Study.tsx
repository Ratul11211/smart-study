"use client";
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import DrawingOverlay, { DrawingTool, Stroke } from '@/components/DrawingOverlay';

const Study = ({ projectId, projectData, onUpdate, activeReading, setHeaderAction, activeDrawingTool }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, activeReading: ReadingData, setHeaderAction: (node: React.ReactNode | null) => void, activeDrawingTool: DrawingTool }) => {
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState(false);
  const [donePages, setDonePages] = useState<number[]>([]);
  const [modifiedDrawings, setModifiedDrawings] = useState<Record<string, Stroke[]>>({});
  
  // Track scroll/zoom state
  const [isUiVisible, setIsUiVisible] = useState(true);

  // Inform parent to hide/show header
  useEffect(() => {
    const event = new CustomEvent('toggle-header', { detail: { visible: isUiVisible } });
    document.dispatchEvent(event);
  }, [isUiVisible]);

  const startPageNum = activeReading.leftOffPage || activeReading.startPage || 1;
  
  // Calculate Logical Boundaries
  const readings = projectData.readings || [];
  const sortedReadings = [...readings].sort((a,b) => a.startPage - b.startPage);
  const currentIndex = sortedReadings.findIndex(r => r.id === activeReading.id);
  const logicalMinPage = activeReading.startPage;
  const logicalMaxPage = (currentIndex !== -1 && currentIndex < sortedReadings.length - 1) 
    ? sortedReadings[currentIndex + 1].startPage - 1 
    : 999999;

  const [currentPage, setCurrentPage] = useState(startPageNum);
  const [knownMinContinuousPage, setKnownMinContinuousPage] = useState<number>(logicalMinPage);
  const [knownMaxContinuousPage, setKnownMaxContinuousPage] = useState<number>(logicalMaxPage);
  
  const [pages, setPages] = useState<PageData[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const fetchingRef = useRef<Set<number>>(new Set());
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPagesBatch = useCallback(async (neededPageNums: number[]) => {
    if (neededPageNums.length === 0) return;
    
    neededPageNums.forEach(num => fetchingRef.current.add(num));
    setLoadingPages(true);

    try {
      const chunks = [];
      for(let i=0; i<neededPageNums.length; i+=10) {
        chunks.push(neededPageNums.slice(i, i+10));
      }

      let allFetched: PageData[] = [];
      for(const chunk of chunks) {
        const q = query(collection(db, 'pages'), where('projectId', '==', projectId), where('pageNum', 'in', chunk));
        const pSnap = await getDocs(q);
        allFetched = [...allFetched, ...pSnap.docs.map(d => ({ id: d.id, ...d.data() } as PageData))];
      }
      
      const fetchedNums = allFetched.map(p => p.pageNum);
      
      let newMin = knownMinContinuousPage;
      let newMax = knownMaxContinuousPage;
      neededPageNums.forEach(num => {
        if (!fetchedNums.includes(num)) {
           if (num > currentPage) newMax = Math.min(newMax, num - 1);
           if (num < currentPage) newMin = Math.max(newMin, num + 1);
        }
      });
      if (newMin !== knownMinContinuousPage) setKnownMinContinuousPage(newMin);
      if (newMax !== knownMaxContinuousPage) setKnownMaxContinuousPage(newMax);

      setPages(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const combined = [...prev, ...allFetched.filter(p => !existingIds.has(p.id))];
        return combined.sort((a,b) => a.pageNum - b.pageNum);
      });
    } catch (e) {
      console.error(e);
    }

    neededPageNums.forEach(num => fetchingRef.current.delete(num));
    setLoadingPages(false);
  }, [projectId, currentPage, knownMinContinuousPage, knownMaxContinuousPage]);

  // Sliding window effect
  useEffect(() => {
    if (!sessionActive) return;
    
    const targetStart = Math.max(knownMinContinuousPage, currentPage - 3);
    const targetEnd = Math.min(knownMaxContinuousPage, currentPage + 5);
    
    const needed = [];
    for(let i = targetStart; i <= targetEnd; i++) {
        if (!pages.some(p => p.pageNum === i) && !fetchingRef.current.has(i)) {
            needed.push(i);
        }
    }
    
    if (needed.length > 0) {
        fetchPagesBatch(needed);
    }
  }, [currentPage, sessionActive, knownMinContinuousPage, knownMaxContinuousPage, pages, fetchPagesBatch]);

  // Intersection Observer for current page
  useEffect(() => {
    if (!sessionActive || !containerRef.current) return;
    
    const observer = new IntersectionObserver((entries) => {
      let maxRatio = 0;
      let mostVisible = currentPage;
      
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-pagenum') || '0');
          if (pageNum > 0 && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisible = pageNum;
          }
        }
      });
      
      if (maxRatio > 0 && mostVisible !== currentPage) {
        setCurrentPage(mostVisible);
      }
    }, { rootMargin: "-30% 0px -30% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });
    
    const pageNodes = containerRef.current.querySelectorAll('.page-container');
    pageNodes.forEach(node => observer.observe(node));
    
    return () => observer.disconnect();
  }, [sessionActive, pages, currentPage]); 

  useEffect(() => {
    if (sessionActive) {
      setHeaderAction(
        <button className="btn btn-primary" onClick={handleDoneForToday} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Done
        </button>
      );
    } else {
      setHeaderAction(null);
    }
    return () => setHeaderAction(null);
  }, [sessionActive]);

  // Initial scroll
  useEffect(() => {
    if (sessionActive && pages.some(p => p.pageNum === startPageNum) && !hasInitiallyScrolled) {
      setTimeout(() => {
        const el = document.getElementById(`page-${startPageNum}`);
        if (el) {
           el.scrollIntoView({ behavior: 'instant', block: 'start' });
           setHasInitiallyScrolled(true);
        }
      }, 100);
    }
  }, [sessionActive, pages, startPageNum, hasInitiallyScrolled]);

  const toggleDone = async (pageNum: number) => {
    const isDone = donePages.includes(pageNum);
    const newDone = isDone ? donePages.filter(p => p !== pageNum) : [...donePages, pageNum];
    setDonePages(newDone);

    if(!isDone) {
        const p = pages.find(p => p.pageNum === pageNum);
        if(p) {
            const pageDrawings = modifiedDrawings[p.id];
            const updateData: any = { status: 'read' };
            if (pageDrawings) {
                updateData.drawings = pageDrawings;
            }
            await updateDoc(doc(db, 'pages', p.id), updateData);
        }
    }
  };

  const handleDoneForToday = useCallback(async () => {
    if (donePages.length === 0) {
      alert("You haven't marked any pages as done yet!");
      return;
    }

    const maxDone = Math.max(...donePages);
    const nextMax = Math.max(startPageNum, maxDone + 1);
    await updateDoc(doc(db, 'projects', projectId), { maxUnlockedPage: nextMax });

    const intervals = projectData.srsIntervals || [];
    let newTasks: any[] = [];
    if(intervals.length > 0) {
      const newDonePages = donePages.filter(p => p >= startPageNum);
      const now = new Date();
      newTasks = newDonePages.flatMap(pageNum => 
        intervals.map((days, idx) => {
          const dueDate = new Date();
          dueDate.setDate(now.getDate() + days);
          return {
            id: `task-${Date.now()}-${pageNum}-${idx}`,
            page: pageNum,
            repetitionIndex: idx,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'pending'
          };
        })
      );
    }

    const updatedTasks = [...(projectData.srsTasks || []), ...newTasks];
    const updatedReadings = (projectData.readings || []).map(r => 
      r.id === activeReading.id ? { ...r, leftOffPage: maxDone + 1 } : r
    );

    await updateDoc(doc(db, 'projects', projectId), { 
      srsTasks: updatedTasks,
      readings: updatedReadings 
    });

    onUpdate();
    setSessionActive(false);
    alert('Progress saved successfully!');
    router.push('/');
  }, [donePages, projectData, projectId, activeReading, onUpdate, router, startPageNum]);

  if (!sessionActive) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2>Ready to read {activeReading.title}?</h2>
        <p style={{ opacity: 0.8, marginBottom: '2rem' }}>You left off at page {startPageNum}.</p>
        <button className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.2rem' }} onClick={() => setSessionActive(true)}>🚀 Start Reading</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000, background: '#e0e0e0' }}>
      
      {/* Floating Page Indicator */}
      <div style={{
        position: 'absolute', top: '1rem', right: '1rem', zIndex: 1100,
        background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.4rem 0.8rem',
        borderRadius: '1rem', fontSize: '0.9rem', fontWeight: 600,
        opacity: isUiVisible ? 1 : 0.4, transition: 'opacity 0.3s', pointerEvents: 'none'
      }}>
        Page {currentPage} {projectData.maxUnlockedPage ? `/ ${projectData.maxUnlockedPage - 1}` : ''}
      </div>

      <div ref={containerRef} style={{ flex: 1, width: '100%', height: '100%', background: '#111', overflowY: 'auto', overflowX: 'hidden' }} onClick={() => setIsUiVisible(!isUiVisible)}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', padding: '1rem 0' }}>
          {pages.map(p => {
            const isPastDone = p.pageNum < startPageNum;
            const isSessionDone = donePages.includes(p.pageNum);
            const isDone = isPastDone || isSessionDone;
            const canCheck = p.pageNum === startPageNum || donePages.includes(p.pageNum - 1);
            return (
              <div key={p.id} id={`page-${p.pageNum}`} data-pagenum={p.pageNum} className="page-container" style={{ margin: '0 0 1rem 0', width: '100%', background: 'white', position: 'relative' }}>
                      <DrawingOverlay 
                        pageId={p.id}
                        baseImageUrl={p.imageUrl} 
                        initialDrawings={p.drawings || []}
                        activeTool={activeDrawingTool}
                        onDrawingsChange={(pid, strokes) => setModifiedDrawings(prev => ({ ...prev, [pid]: strokes }))}
                        readOnly={!(canCheck && !isDone)}
                      />
                      
                      {/* Floating circular Done button */}
                      <button
                        disabled={!canCheck && !isDone}
                        onClick={(e) => { e.stopPropagation(); toggleDone(p.pageNum); }}
                        title={isDone ? "Done" : (canCheck ? "Mark as done" : "Mark previous pages first")}
                        style={{
                          position: 'absolute',
                          bottom: '1rem',
                          right: '1rem',
                          width: '3.5rem',
                          height: '3.5rem',
                          borderRadius: '50%',
                          background: isDone ? 'var(--primary)' : 'rgba(0,0,0,0.4)',
                          color: 'white',
                          border: '3px solid white',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: canCheck ? 'pointer' : 'not-allowed',
                          opacity: (canCheck || isDone) ? (isUiVisible ? 1 : 0.6) : 0,
                          zIndex: 10,
                          transition: 'all 0.3s'
                        }}
                      >
                        {isDone ? (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
                        )}
                      </button>

                      {!canCheck && !isDone && isUiVisible && (
                        <div style={{ position: 'absolute', bottom: '1.5rem', right: '5rem', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '1rem', fontSize: '0.8rem', pointerEvents: 'none' }}>
                          Mark previous first
                        </div>
                      )}
                    </div>
                  );     
              })}
              {loadingPages && <div style={{ padding: '2rem', width: '100%', textAlign: 'center', opacity: 0.7 }}>Loading pages...</div>}
            </div>
        </div>
      </div>
    );
  }

export default Study;
