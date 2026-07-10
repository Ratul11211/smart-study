"use client";
import Link from 'next/link';
import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import dynamic from 'next/dynamic';
import type { DrawingTool, Stroke } from '@/components/DrawingOverlay';
import { ProjectData, PageData, ReadingData } from '@/types/project';
import { useAuth } from '@/hooks/useAuth';
import BackupMenu from '@/components/BackupMenu';

const DrawingOverlay = dynamic(() => import('@/components/DrawingOverlay'), { ssr: false });

const UploadScans = ({ projectId, pages, onUploadComplete }: { projectId: string, pages: PageData[], onUploadComplete: ()=>void }) => {
  const [extractedPages, setExtractedPages] = useState<PageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const boiPages = pages.filter(p => p.category === 'BOOK' || p.category === 'Boi' || !p.category);
  
  const uploadCategory = 'BOOK';
  const [startPageNum, setStartPageNum] = useState<number | ''>('');

  useEffect(() => {
    setStartPageNum(boiPages.length > 0 ? Math.max(...boiPages.map(p=>p.pageNum)) + 1 : 1);
  }, [pages]);

  const compressToTargetSize = (canvas: HTMLCanvasElement, targetKB: number = 150): string => {
    const grayCanvas = document.createElement('canvas');
    grayCanvas.width = canvas.width;
    grayCanvas.height = canvas.height;
    const ctx = grayCanvas.getContext('2d');
    if (ctx) {
      ctx.filter = 'grayscale(100%)';
      ctx.drawImage(canvas, 0, 0);
    }
    const finalCanvas = ctx ? grayCanvas : canvas;

    let quality = 0.85;
    let dataUrl = finalCanvas.toDataURL('image/webp', quality);
    let sizeKB = (dataUrl.length * 0.75) / 1024;
    
    while (sizeKB > targetKB && quality > 0.5) {
      quality -= 0.05;
      dataUrl = finalCanvas.toDataURL('image/webp', quality);
      sizeKB = (dataUrl.length * 0.75) / 1024;
    }
    
    grayCanvas.width = 0;
    grayCanvas.height = 0;
    
    return dataUrl;
  };

  const processPDF = async (file: File) => {
    setIsProcessing(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const newPages: any[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        let viewport = page.getViewport({ scale: 1.0 });
        let scale = 1800 / viewport.width;
        viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if(context) {
          await page.render({ canvasContext: context, viewport } as any).promise;
          const dataUrl = compressToTargetSize(canvas, 150);
          newPages.push({ id: `page-${Date.now()}-${i}`, pageNum: i, imageUrl: dataUrl, status: 'pending' });
          
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      setExtractedPages(prev => [...prev, ...newPages]);
    } catch (e: any) {
      console.error(e);
      alert('Error processing PDF: ' + (e?.message || e));
    }
    setIsProcessing(false);
  };

  const processImage = async (file: File) => {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          
          const MAX_DIMENSION = 1800;
          if (width > height && width > MAX_DIMENSION) {
            height = Math.round(height * (MAX_DIMENSION / width));
            width = MAX_DIMENSION;
          } else if (height > MAX_DIMENSION) {
            width = Math.round(width * (MAX_DIMENSION / height));
            height = MAX_DIMENSION;
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = width;
          canvas.height = height;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = compressToTargetSize(canvas, 150);
            setExtractedPages(prev => [...prev, { id: `img-${Date.now()}`, pageNum: prev.length + 1, imageUrl: dataUrl, status: 'pending' }]);
            
            canvas.width = 0;
            canvas.height = 0;
          }
          resolve();
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.type === 'application/pdf') await processPDF(file);
      else if (file.type.startsWith('image/')) await processImage(file);
    }
  };

  const handleUpload = async () => {
    if(extractedPages.length === 0 || startPageNum === '') return;
    setIsUploading(true);
    try {
      for(let i = 0; i < extractedPages.length; i++) {
        const page = extractedPages[i];
        await addDoc(collection(db, 'pages'), {
          projectId,
          pageNum: Number(startPageNum) + i,
          imageUrl: page.imageUrl,
          status: page.status,
          category: uploadCategory
        });
      }
      alert('Pages uploaded successfully!');
      setExtractedPages([]);
      onUploadComplete();
    } catch(e) {
      console.error(e);
      alert('Upload failed.');
    }
    setIsUploading(false);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Upload Scans</h3>
      <p style={{ opacity: 0.8, marginBottom: '2rem' }}>Add PDF or images to your project. They will be appended after existing pages.</p>
      
      <div style={{ border: '2px dashed var(--surface-border)', borderRadius: 'var(--radius-md)', padding: '2rem 1rem', textAlign: 'center', background: 'var(--surface-solid)', marginBottom: '2rem' }}>
        <input type="file" multiple accept=".pdf,image/*" onChange={handleFileChange} id="file-upload" style={{ display: 'none' }} />
        <label htmlFor="file-upload" className="btn btn-secondary">
          {isProcessing ? 'Processing Files...' : 'Select PDF or Images'}
        </label>
      </div>

      {extractedPages.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h4>Extracted Pages ({extractedPages.length})</h4>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem 0' }}>
            {extractedPages.map((p, idx) => (
              <div key={p.id} style={{ textAlign: 'center' }}>
                <img src={p.imageUrl} alt="preview" style={{ height: '100px', border: '1px solid var(--surface-border)', background: 'white' }} />
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 600 }}>Page {Number(startPageNum) + idx}</div>
              </div>
            ))}
          </div>

          <div className="flex-responsive-wrap" style={{ background: 'var(--surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', marginTop: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Category</label>
              <select value={uploadCategory} disabled style={{ padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)', opacity: 0.7 }}>
                <option value="BOOK">BOOK</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Start Page Number</label>
              <input type="number" value={startPageNum} onChange={(e) => setStartPageNum(Number(e.target.value))} style={{ width: '120px', padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleUpload} disabled={isUploading || startPageNum === ''}>{isUploading ? 'Uploading...' : 'Save Pages'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



const Study = ({ projectId, projectData, onUpdate, activeReading, setHeaderAction, activeDrawingTool }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, activeReading: ReadingData, setHeaderAction: (node: React.ReactNode | null) => void, activeDrawingTool: DrawingTool }) => {
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState(false);
  const [donePages, setDonePages] = useState<number[]>([]);
  const [modifiedDrawings, setModifiedDrawings] = useState<Record<string, Stroke[]>>({});

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
        <button className="btn btn-primary" onClick={handleDoneForToday}>
          ✓ Done for today
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
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { maxUnlockedPage: nextMax });

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
    if (user) {
      await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { 
        srsTasks: updatedTasks,
        readings: updatedReadings 
      });
    }

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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: '#f5f5f5', borderRadius: 'var(--radius-md)' }}>
        {pages.map(p => {
          const isPastDone = p.pageNum < startPageNum;
          const isSessionDone = donePages.includes(p.pageNum);
          const isDone = isPastDone || isSessionDone;
          const canCheck = p.pageNum === startPageNum || donePages.includes(p.pageNum - 1);
          
          return (
            <div key={p.id} id={`page-${p.pageNum}`} data-pagenum={p.pageNum} className="page-container" style={{ marginBottom: '2rem', background: 'white', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Page {p.pageNum}</span>
              </div>
              <DrawingOverlay 
                pageId={p.id}
                baseImageUrl={p.imageUrl} 
                initialDrawings={p.drawings || []}
                activeTool={activeDrawingTool}
                onDrawingsChange={(pid, strokes) => setModifiedDrawings(prev => ({ ...prev, [pid]: strokes }))}
                readOnly={!(canCheck && !isDone)}
              />
              {!canCheck && !isDone && (
                <div style={{ padding: '1rem', textAlign: 'center', background: '#fff3cd', color: '#856404' }}>
                  Please mark previous pages as done first.
                </div>
              )}
              
              <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', borderTop: '1px solid #eee' }}>
                {isPastDone ? (
                  <span style={{ color: 'var(--primary)', fontWeight: 600, opacity: 0.6 }}>✓ Read previously</span>
                ) : (
                  <button 
                    disabled={!canCheck}
                    onClick={() => toggleDone(p.pageNum)}
                    style={{
                      background: isDone ? 'var(--primary)' : 'transparent',
                      color: isDone ? 'white' : (canCheck ? 'var(--foreground)' : '#ccc'),
                      border: `2px solid ${isDone ? 'var(--primary)' : (canCheck ? 'var(--foreground)' : '#eee')}`,
                      padding: '0.4rem 1.5rem', borderRadius: '2rem', cursor: canCheck ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s', fontWeight: 600,
                      opacity: isDone ? 1 : 0.85
                    }}
                  >
                    {isDone ? '✓ Done' : 'Mark Done'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {loadingPages && <div style={{ padding: '2rem', width: '100%', textAlign: 'center', opacity: 0.7 }}>Loading pages...</div>}
      </div>
    </div>
  );
}



const ActiveRevisionView = ({ projectId, projectData, groupName, groupTasks, onUpdate, setHeaderAction, activeDrawingTool }: { projectId: string, projectData: ProjectData, groupName: string, groupTasks: any[], onUpdate: ()=>void, setHeaderAction: (node: React.ReactNode | null) => void, activeDrawingTool: DrawingTool }) => {
  const router = useRouter();
  const [modifiedDrawings, setModifiedDrawings] = useState<Record<string, Stroke[]>>({});
  const sortedTasks = [...groupTasks].sort((a,b) => a.page - b.page);
  
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevPages = async () => {
      const pageNums = groupTasks.map(t => t.page);
      if (pageNums.length === 0) { setLoading(false); return; }
      
      let allFetched: PageData[] = [];
      for (let i = 0; i < pageNums.length; i += 10) {
        const chunk = pageNums.slice(i, i + 10);
        const q = query(collection(db, 'pages'), where('projectId', '==', projectId), where('pageNum', 'in', chunk));
        const snap = await getDocs(q);
        allFetched = [...allFetched, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as PageData))];
      }
      setPages(allFetched);
      setLoading(false);
    };
    fetchRevPages();
  }, [projectId, groupTasks]);

  const handleMarkRevisionDone = useCallback(async () => {
    for (const [pageId, drawings] of Object.entries(modifiedDrawings)) {
       await updateDoc(doc(db, 'pages', pageId), { drawings });
    }
    const taskIds = groupTasks.map(t => t.id);
    const updatedTasks = (projectData.srsTasks || []).map((t: any) => 
      taskIds.includes(t.id) ? { ...t, status: 'done' } : t
    );
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { srsTasks: updatedTasks });
    onUpdate();
    alert(`Great job! You have completed your ${groupName}.`);
  }, [groupTasks, projectData, projectId, groupName, onUpdate, router, modifiedDrawings]);

  useEffect(() => {
    setHeaderAction(
      <button className="btn btn-primary" onClick={handleMarkRevisionDone}>
        ✓ Mark Revision Done
      </button>
    );
    return () => setHeaderAction(null);
  }, [handleMarkRevisionDone, setHeaderAction]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading revision pages...</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <h3 style={{ margin: 0, marginBottom: '1.5rem' }}>{groupName} ({groupTasks.length} Pages)</h3>

      <div style={{ display: 'grid', gap: '4rem', marginTop: '3rem', justifyItems: 'center' }}>
        {sortedTasks.map(task => {
          const pageData = pages.find(p => p.pageNum === task.page);
          if(!pageData) return null;
          
          return (
            <div id={`rev-page-${task.page}`} key={task.id} className="content-visible-auto fade-in" style={{ maxWidth: '800px', width: '100%', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--surface-solid)', padding: '1rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>Page {task.page}</strong>
                <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>Due: {task.dueDate}</span>
              </div>
              <div style={{ background: 'white' }}>
                <DrawingOverlay 
                  pageId={pageData.id}
                  baseImageUrl={pageData.imageUrl}
                  initialDrawings={pageData.drawings || []}
                  activeTool={activeDrawingTool}
                  onDrawingsChange={(pid, drawings) => {
                    setModifiedDrawings(prev => ({ ...prev, [pid]: drawings }));
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RevisionView = ({ projectId, projectData, onUpdate, activeReading, setHeaderAction, activeDrawingTool }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, activeReading: ReadingData, setHeaderAction: (node: React.ReactNode | null) => void, activeDrawingTool: DrawingTool }) => {
  const router = useRouter();
    const searchParams = useSearchParams();
  const activeGroup = searchParams.get('group');
  
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const tasks = projectData.srsTasks || [];
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  
  const todayStr = new Date().toISOString().split('T')[0];
  const dueTasks = pendingTasks.filter(t => t.dueDate <= todayStr);
  
  const groupedTasks = dueTasks.reduce((acc: any, task: any) => {
    const revName = `${getOrdinal(task.repetitionIndex + 1)} Revision`;
    if (!acc[revName]) acc[revName] = [];
    acc[revName].push(task);
    return acc;
  }, {});

  if (activeGroup) {
    return <ActiveRevisionView 
      projectId={projectId} 
      projectData={projectData} 
      groupName={activeGroup} 
      groupTasks={groupedTasks[activeGroup]} 
      onUpdate={onUpdate} 
      setHeaderAction={setHeaderAction}
      activeDrawingTool={activeDrawingTool}
    />;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Revisions for {activeReading.title}</h2>
      
      {Object.keys(groupedTasks).length === 0 ? (
        <p style={{ opacity: 0.7 }}>No pending revisions right now! Take a break.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
            <div key={groupName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
              <div>
                <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>{groupName}</h3>
                <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: 0 }}>{(groupTasks as any[]).length} pages to review</p>
              </div>
              <button className="btn btn-primary" onClick={() => {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('group', groupName);
                router.push(currentUrl.pathname + currentUrl.search);
              }}>Start Revision</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};



const PageItem = ({ p, onUpdate, labelPrefix }: { p: PageData, onUpdate: ()=>void, labelPrefix: string }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(p.pageNum);

  const handleSave = async () => {
    if(num !== p.pageNum) {
      await updateDoc(doc(db, 'pages', p.id), { pageNum: Number(num) });
    }
    setEditing(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if(confirm('Delete this page?')) {
      await deleteDoc(doc(db, 'pages', p.id));
      onUpdate();
    }
  };

  return (
    <div style={{ maxWidth: '600px', width: '100%' }}>
      <div style={{ background: 'var(--surface-solid)', padding: '0.5rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--surface-border)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>
          {editing ? (
            <input type="number" value={num} onChange={(e)=>setNum(Number(e.target.value))} style={{ width: '80px', padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--primary)' }} autoFocus onBlur={handleSave} onKeyDown={e => e.key === 'Enter' && handleSave()} />
          ) : (
            <span onDoubleClick={() => setEditing(true)}>{labelPrefix} {p.pageNum}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setEditing(!editing)}>{editing ? 'Save' : 'Edit'}</button>
          <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#ff4444', color: 'white', border: 'none' }} onClick={handleDelete}>Delete</button>
        </div>
      </div>
      <img src={p.imageUrl} alt={`${labelPrefix} ${p.pageNum}`} style={{ width: '100%', border: '1px solid var(--surface-border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', background: 'white' }} />
    </div>
  );
};

const BookTab = ({ pages, onUpdate }: { pages: PageData[], onUpdate: ()=>void }) => {
  const boiPages = pages.filter(p => p.category === 'BOOK' || p.category === 'Boi' || !p.category).sort((a,b)=>a.pageNum - b.pageNum);
  return (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h3 style={{ marginBottom: '1rem' }}>BOOK</h3>
    <div style={{ display: 'grid', gap: '2rem', justifyItems: 'center' }}>
      {boiPages.length === 0 && <p style={{ opacity: 0.7 }}>No pages found.</p>}
      {boiPages.map(p => <PageItem key={p.id} p={p} onUpdate={onUpdate} labelPrefix="Page" />)}
    </div>
  </div>
)};

const SRS = ({ projectId, currentIntervals }: { projectId: string, currentIntervals: number[] }) => {
  const [intervals, setIntervals] = useState<number[]>(currentIntervals || []);
  const [isAdding, setIsAdding] = useState(false);
  const [newInterval, setNewInterval] = useState('');

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const addInterval = async () => {
    if(newInterval && !isNaN(Number(newInterval))) {
      const updated = [...intervals, Number(newInterval)];
      setIntervals(updated);
      setNewInterval('');
      setIsAdding(false);
      const { auth } = await import('@/lib/firebase');
      const user = auth.currentUser;
      if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { srsIntervals: updated });
    }
  };

  const removeInterval = async (index: number) => {
    const updated = intervals.filter((_, i) => i !== index);
    setIntervals(updated);
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { srsIntervals: updated });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>SRS Configuration</h3>
      <p style={{ opacity: 0.8, marginBottom: '2rem' }}>Set your spaced repetition intervals (e.g., 3 days after first reading, 7 days after reading).</p>
      
      {intervals.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          {intervals.map((day, idx) => (
            <div key={idx} style={{ background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{getOrdinal(idx + 1)} Repetition</strong>
              <span>{day} Days later</span>
              <button className="btn" style={{ background: 'transparent', color: '#ff4444', padding: '0.2rem 0.5rem' }} onClick={() => removeInterval(idx)}>✖</button>
            </div>
          ))}
        </div>
      )}

      {isAdding ? (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--surface-solid)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--surface-border)' }}>
          <strong>{getOrdinal(intervals.length + 1)} Repetition: </strong>
          <input type="number" value={newInterval} onChange={(e) => setNewInterval(e.target.value)} placeholder="Days" style={{ padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', width: '100px', background: 'var(--background)', color: 'var(--foreground)' }} autoFocus onKeyDown={e => e.key === 'Enter' && addInterval()} />
          <button className="btn btn-primary" onClick={addInterval}>Save</button>
          <button className="btn btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
          + Add {getOrdinal(intervals.length + 1)} Repetition
        </button>
      )}
    </div>
  );
};

const ReadingSetup = ({ projectId, currentReadings }: { projectId: string, currentReadings: ReadingData[] }) => {
  const [readings, setReadings] = useState<ReadingData[]>(currentReadings || []);
  const [title, setTitle] = useState('');
  const [startPage, setStartPage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  useEffect(() => {
    let changed = false;
    const now = new Date();
    const updated = readings.filter(r => {
      if (r.deletedAt) {
        const deletedTime = new Date(r.deletedAt);
        const daysDiff = (now.getTime() - deletedTime.getTime()) / (1000 * 3600 * 24);
        if (daysDiff > 30) {
          changed = true;
          return false;
        }
      }
      return true;
    });
    
    if (changed) {
      setReadings(updated);
      import('@/lib/firebase').then(({ auth }) => {
        if (auth.currentUser) updateDoc(doc(db, `users/${auth.currentUser.uid}/projects`, projectId), { readings: updated }).catch(console.error);
      });
    }
  }, [readings, projectId]);

  const addReading = async () => {
    if(title && startPage) {
      const newReading: ReadingData = { 
        id: `reading-${Date.now()}`, 
        title, 
        startPage: Number(startPage) 
      };
      const updated = [...readings, newReading].sort((a,b)=>a.startPage - b.startPage);
      setReadings(updated);
      setTitle('');
      setStartPage('');
      const { auth } = await import('@/lib/firebase');
      const user = auth.currentUser;
      if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { readings: updated });
    }
  };

  const saveEdit = async (id: string) => {
    const updated = readings.map(r => r.id === id ? { ...r, title: editTitle } : r);
    setReadings(updated);
    setEditingId(null);
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { readings: updated });
  };

  const deleteReading = async (readingId: string) => {
    if (!window.confirm('Are you sure you want to move this reading plan to the Recycle Bin?')) return;
    const deletedAt = new Date().toISOString();
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt } : r);
    setReadings(updated);
    setEditingId(null);
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { readings: updated });
  };

  const restoreReading = async (readingId: string) => {
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt: undefined } : r);
    setReadings(updated);
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { readings: updated });
  };

  const permanentDeleteReading = async (readingId: string) => {
    if (!window.confirm('Permanently delete this reading plan? This cannot be undone.')) return;
    const updated = readings.filter(r => r.id !== readingId);
    setReadings(updated);
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (user) await updateDoc(doc(db, `users/${user.uid}/projects`, projectId), { readings: updated });
  };

  const activeReadings = readings.filter(r => !r.deletedAt);
  const deletedReadings = readings.filter(r => r.deletedAt);
  const displayedReadings = showRecycleBin ? deletedReadings : activeReadings;

  return (
    <div style={{ padding: '2rem' }}>
      <div className="flex-responsive" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>{showRecycleBin ? 'Recycle Bin' : 'Reading Plan'}</h3>
        <button 
          onClick={() => setShowRecycleBin(!showRecycleBin)}
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '50%', padding: 0,
            background: showRecycleBin ? 'var(--primary)' : 'transparent', 
            color: showRecycleBin ? 'white' : 'var(--foreground)', 
            border: '1px solid var(--surface-border)', 
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={showRecycleBin ? 'View Active Readings' : 'View Recycle Bin'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      
      {!showRecycleBin && (
        <div className="flex-responsive-wrap" style={{ marginBottom: '2rem' }}>
          <input type="text" placeholder="Title (e.g. Chapter 1)" value={title} onChange={(e)=>setTitle(e.target.value)} className="input-responsive" style={{ flex: 1, minWidth: '200px' }} />
          <input type="number" placeholder="Start Page" value={startPage} onChange={(e)=>setStartPage(e.target.value)} className="input-responsive" style={{ width: '120px' }} />
          <button className="btn btn-primary mobile-stretch" onClick={addReading}>Add</button>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {displayedReadings.map((r, i) => (
          <li key={r.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--surface-solid)', marginBottom: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
            {editingId === r.id && !showRecycleBin ? (
              <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                <input type="text" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)' }} autoFocus />
                <button className="btn btn-primary" onClick={() => saveEdit(r.id)} style={{ padding: '0.5rem 1rem' }}>Save</button>
                <button className="btn btn-secondary" onClick={() => deleteReading(r.id)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                <button className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ padding: '0.5rem 1rem' }}>Cancel</button>
              </div>
            ) : (
              <>
                <div>
                  <strong>{r.title}</strong> <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>(Starts from Page {r.startPage})</span>
                  {showRecycleBin && r.deletedAt && (
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.3rem' }}>
                      Deleted on {new Date(r.deletedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {!showRecycleBin ? (
                  <button className="btn btn-secondary" style={{ padding: '0.4rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setEditingId(r.id); setEditTitle(r.title); }} title="Edit Reading">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={() => restoreReading(r.id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Restore</button>
                    <button className="btn btn-secondary" onClick={() => permanentDeleteReading(r.id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {displayedReadings.length === 0 && (
          <p style={{ opacity: 0.5 }}>
            {showRecycleBin ? 'Recycle bin is empty.' : 'No readings planned yet.'}
          </p>
        )}
      </ul>
    </div>
  );
};




const StudyTab = ({ projectId, projectData, onUpdate, setHeaderAction, activeDrawingTool, mode, readingTitle }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, setHeaderAction: (node: React.ReactNode | null) => void, activeDrawingTool: DrawingTool, mode: string | null, readingTitle: string | null }) => {
  const router = useRouter();

  const readings = projectData.readings || [];
  const activeReading = readings.find(r => r.title === readingTitle) || null;

  if (activeReading && mode === 'reading') {
    return <Study projectId={projectId} projectData={projectData} onUpdate={onUpdate} activeReading={activeReading} setHeaderAction={setHeaderAction} activeDrawingTool={activeDrawingTool} />;
  }

  if (activeReading && mode === 'revision') {
    return <RevisionView projectId={projectId} projectData={projectData} onUpdate={onUpdate} activeReading={activeReading} setHeaderAction={setHeaderAction} activeDrawingTool={activeDrawingTool} />;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>Select a Reading</h2>
      {readings.filter(r => !r.deletedAt).length === 0 ? (
        <p style={{ opacity: 0.7 }}>No readings defined yet. Go to the Management tab to create one.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {readings.filter(r => !r.deletedAt).map(r => (
            <div key={r.id || r.title} className="flex-responsive" style={{ padding: '1.5rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', justifyContent: 'space-between' }}>
              <div style={{ width: '100%' }}>
                <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{r.title}</h3>
                <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: 0 }}>Starts at page {r.startPage} {r.leftOffPage ? `| Left off at page ${r.leftOffPage}` : ''}</p>
              </div>
              <div className="flex-responsive" style={{ gap: '1rem', width: '100%' }}>
                <Link href={`/project?id=${projectId}&mode=reading&reading=${encodeURIComponent(r.title)}`} className="btn btn-primary mobile-stretch" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Start Reading</Link>
                <Link href={`/project?id=${projectId}&mode=revision&reading=${encodeURIComponent(r.title)}`} className="btn btn-secondary mobile-stretch" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Revision</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function ProjectContent() {
  const [showManagement, setShowManagement] = useState(false);
  const [headerAction, setHeaderAction] = useState<React.ReactNode | null>(null);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [isDrawingMenuOpen, setIsDrawingMenuOpen] = useState(false);
  const [managementTab, setManagementTab] = useState('Reading');
  const drawingMenuRef = useRef<HTMLDivElement>(null);
  const isLongPress = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const handlePressStart = () => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      router.push('/');
    }, 500);
  };

  const handlePressCancel = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };


  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const mode = searchParams.get('mode');

  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const handleHashChange = () => {
      setShowManagement(window.location.hash === '#management');
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        isDrawingMenuOpen && 
        !activeDrawingTool && 
        drawingMenuRef.current && 
        !drawingMenuRef.current.contains(e.target as Node)
      ) {
        setIsDrawingMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDrawingMenuOpen, activeDrawingTool]);

  const fetchData = async () => {
    if(!id || !user) {
      if (!user) setLoading(false);
      return;
    }
    try {
      const docSnap = await getDoc(doc(db, `users/${user.uid}/projects`, id));
      if(docSnap.exists()) {
        const data = docSnap.data();
        let readings = data.readings || [];
        
        const now = new Date().getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const validReadings = [];
        let changed = false;
        
        for (const r of readings) {
          if (r.deletedAt) {
            const deletedTime = new Date(r.deletedAt).getTime();
            if (now - deletedTime > thirtyDaysMs) {
              changed = true;
              continue; // Skip adding, effectively deleting
            }
          }
          validReadings.push(r);
        }
        
        if (changed) {
          await updateDoc(doc(db, `users/${user.uid}/projects`, id), { readings: validReadings });
          data.readings = validReadings;
        }

        setProjectData({ id: docSnap.id, ...data } as any);
      }
      
      if (showManagement) {
        const q = query(collection(db, 'pages'), where('projectId', '==', id));
        const pSnap = await getDocs(q);
        const pData = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as PageData)).sort((a,b)=>a.pageNum - b.pageNum);
        setPages(pData);
      } else {
        setPages([]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [id, showManagement, user]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading project data...</div>;
  if (!user) return <div style={{ padding: '4rem', textAlign: 'center' }}>Please login to view this project.</div>;
  if (!projectData || !id) return <div style={{ padding: '4rem', textAlign: 'center' }}>Project not found.</div>;

  return (
    <div className="container fade-in" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div className="flex-responsive" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--background)', padding: '1rem 0', marginBottom: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
          {mode ? (
            <button 
              onClick={() => {
                if (!isLongPress.current) {
                  window.location.href = `/project?id=${id}`;
                }
              }}
              onMouseDown={handlePressStart}
              onTouchStart={handlePressStart}
              onMouseUp={handlePressCancel}
              onTouchEnd={handlePressCancel}
              onMouseLeave={handlePressCancel}
              className="glass-card" 
              style={{ padding: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)' }}
              title="Back to Reading List (Long press for Home)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          ) : (
            <button 
              onMouseDown={handlePressStart}
              onTouchStart={handlePressStart}
              onMouseUp={handlePressCancel}
              onTouchEnd={handlePressCancel}
              onMouseLeave={handlePressCancel}
              onClick={() => {
                if (!isLongPress.current) {
                  if (showManagement) {
                    router.back();
                  } else {
                    window.location.hash = 'management';
                  }
                }
              }}
              className="glass-card" 
              style={{ padding: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showManagement ? 'var(--primary)' : 'var(--foreground)' }}
              title="Management Settings (Long press for Home)"
            >
              {showManagement ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="7" rx="0.5" />
                  <rect x="4" y="13" width="7" height="7" rx="0.5" />
                  <rect x="13" y="13" width="7" height="7" rx="0.5" />
                  <polygon points="16.5,4 20,7.5 16.5,11 13,7.5" />
                </svg>
              )}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h1 style={{ marginBottom: '0.2rem' }}>{projectData.name}</h1>
              <span style={{ background: 'var(--surface-solid)', padding: '0.2rem 0.8rem', borderRadius: '1rem', fontSize: '0.8rem', border: '1px solid var(--surface-border)' }}>{projectData.category}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {headerAction && (
            <div ref={drawingMenuRef} style={{ position: 'relative' }}>
              {!isDrawingMenuOpen ? (
                <button 
                  className="btn glass-card"
                  style={{ padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', cursor: 'pointer', height: '100%' }}
                  onClick={() => setIsDrawingMenuOpen(true)}
                  title="Drawing Tools"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
              ) : (
                <div className="fade-in" style={{ display: 'flex', background: 'var(--surface-solid)', padding: '0.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
                  <button 
                    className="btn" 
                    style={{ padding: '0.3rem 0.5rem', background: activeDrawingTool === 'highlighter' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'highlighter' ? 'white' : 'var(--foreground)' }}
                    onClick={() => setActiveDrawingTool(activeDrawingTool === 'highlighter' ? null : 'highlighter')}
                    title="Highlighter"
                  >🖌️</button>
                  <button 
                    className="btn" 
                    style={{ padding: '0.3rem 0.5rem', background: activeDrawingTool === 'pen' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'pen' ? 'white' : 'var(--foreground)' }}
                    onClick={() => setActiveDrawingTool(activeDrawingTool === 'pen' ? null : 'pen')}
                    title="Pen"
                  >🖊️</button>
                  <button 
                    className="btn" 
                    style={{ padding: '0.3rem 0.5rem', background: activeDrawingTool === 'eraser' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'eraser' ? 'white' : 'var(--foreground)' }}
                    onClick={() => setActiveDrawingTool(activeDrawingTool === 'eraser' ? null : 'eraser')}
                    title="Smart Eraser"
                  >🧽</button>
                </div>
              )}
            </div>
          )}
          {headerAction}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        {showManagement ? (
          <div className="fade-in" style={{ minHeight: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-border)', paddingRight: '1rem' }}>
              <div className="scrollable-tabs" style={{ display: 'flex', flex: 1, borderBottom: 'none', background: 'transparent' }}>
                {[
                  { id: 'Reading', label: 'Reading', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> },
                  { id: 'Import', label: 'Import', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
                  { id: 'SRS', label: 'SRS', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> },
                  { id: 'Book', label: 'Book', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> },
                ].map(mtab => (
                  <button 
                    key={mtab.id}
                    onClick={() => setManagementTab(mtab.id)}
                    title={mtab.label}
                    style={{ 
                      padding: '0.8rem 1.2rem', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: managementTab === mtab.id ? '2px solid var(--primary)' : 'none',
                      fontWeight: managementTab === mtab.id ? 600 : 400,
                      color: managementTab === mtab.id ? 'var(--primary)' : 'var(--foreground)',
                      opacity: managementTab === mtab.id ? 1 : 0.7,
                      display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                  >
                    {mtab.icon}
                    <span className="hide-on-mobile">{mtab.label}</span>
                  </button>
                ))}
              </div>
              <BackupMenu project={projectData} pages={pages} />
            </div>
            {managementTab === 'Reading' && <ReadingSetup projectId={id} currentReadings={projectData.readings || []} />}
            {managementTab === 'Import' && <UploadScans projectId={id} pages={pages} onUploadComplete={() => { fetchData(); setManagementTab('Book'); }} />}
            {managementTab === 'SRS' && <SRS projectId={id} currentIntervals={projectData.srsIntervals} />}
            {managementTab === 'Book' && <BookTab pages={pages} onUpdate={fetchData} />}
          </div>
        ) : (
          <div style={{ minHeight: '400px' }}>
            <StudyTab projectId={id} projectData={projectData} onUpdate={fetchData} setHeaderAction={setHeaderAction} activeDrawingTool={activeDrawingTool} mode={mode} readingTitle={searchParams.get('reading')} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading...</div>}>
      <ProjectContent />
    </Suspense>
  );
}
