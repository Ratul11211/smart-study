"use client";
import Link from 'next/link';
import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getProjectById, saveProject, getPages, savePageWithImage, loadPageImage, updatePageNum, deletePage, updatePageDrawings, generateId } from '@/lib/localDB';
import Study from '@/components/project/Study';
import dynamic from 'next/dynamic';
import { ProjectData, PageData, ReadingData } from '@/types/project';
import { useAuth } from '@/hooks/useAuth';
import BackupMenu from '@/components/BackupMenu';


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
        await savePageWithImage(projectId, { id: generateId(), pageNum: Number(startPageNum) + i, imageUrl: page.imageUrl, status: page.status, category: uploadCategory });
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



const ActiveRevisionView = ({ projectId, projectData, groupName, groupTasks, onUpdate, setHeaderAction }: { projectId: string, projectData: ProjectData, groupName: string, groupTasks: any[], onUpdate: ()=>void, setHeaderAction: (node: React.ReactNode | null) => void }) => {
  const router = useRouter();
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
        const allPages = await getPages(projectId);
        const chunkPages = allPages.filter(p => chunk.includes(p.pageNum));
        const loadedPages = await Promise.all(chunkPages.map(p => loadPageImage(p)));
        allFetched = [...allFetched, ...loadedPages];
      }
      setPages(allFetched);
      setLoading(false);
    };
    fetchRevPages();
  }, [projectId, groupTasks]);

  const handleMarkRevisionDone = useCallback(async () => {
    const taskIds = groupTasks.map(t => t.id);
    const updatedTasks = (projectData.srsTasks || []).map((t: any) => 
      taskIds.includes(t.id) ? { ...t, status: 'done' } : t
    );
    await saveProject({ ...projectData, srsTasks: updatedTasks });
    onUpdate();
    alert(`Great job! You have completed your ${groupName}.`);
  }, [groupTasks, projectData, projectId, groupName, onUpdate, router]);

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
                <img 
                  src={pageData.imageUrl} 
                  alt={`Page ${task.page}`} 
                  style={{ width: '100%', display: 'block' }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RevisionView = ({ projectId, projectData, onUpdate, activeReading, setHeaderAction }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, activeReading: ReadingData, setHeaderAction: (node: React.ReactNode | null) => void }) => {
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



const PageItem = ({ projectId, p, onUpdate, labelPrefix } : { projectId: string, p: PageData, onUpdate: ()=>void, labelPrefix: string }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(p.pageNum);

  const handleSave = async () => {
    if(num !== p.pageNum) {
      await updatePageNum(projectId, p.id, Number(num));
    }
    setEditing(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if(confirm('Delete this page?')) {
      await deletePage(projectId, p.id);
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

const BookTab = ({ projectId, pages, onUpdate }: { projectId: string, pages: PageData[], onUpdate: ()=>void }) => {
  const boiPages = pages.filter(p => p.category === 'BOOK' || p.category === 'Boi' || !p.category).sort((a,b)=>a.pageNum - b.pageNum);
  const unassigned = pages.filter(p => p.category !== 'BOOK' && p.category !== 'Boi' && p.category).sort((a,b)=>a.pageNum - b.pageNum);
  return (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h3 style={{ marginBottom: '1rem' }}>BOOK</h3>
    <div style={{ display: 'grid', gap: '2rem', justifyItems: 'center' }}>
      {boiPages.length === 0 && <p style={{ opacity: 0.7 }}>No pages found.</p>}
      {boiPages.map(p => <PageItem key={p.id} projectId={projectId} p={p} onUpdate={onUpdate} labelPrefix="Page" />)}
      {unassigned.map(p => <PageItem key={p.id} projectId={projectId} p={p} onUpdate={onUpdate} labelPrefix="File" />)}
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
      const proj = await getProjectById(projectId);
      if(proj) await saveProject({ ...proj, srsIntervals: updated });
    }
  };

  const removeInterval = async (index: number) => {
    const updated = intervals.filter((_, i) => i !== index);
    setIntervals(updated);
    const proj = await getProjectById(projectId);
      if(proj) await saveProject({ ...proj, srsIntervals: updated });
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
      getProjectById(projectId).then(proj => { if(proj) saveProject({ ...proj, readings: updated }) });
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
      const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });
    }
  };

  const saveEdit = async (id: string) => {
    const updated = readings.map(r => r.id === id ? { ...r, title: editTitle } : r);
    setReadings(updated);
    setEditingId(null);
    const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });
  };

  const deleteReading = async (readingId: string) => {
    if (!window.confirm('Are you sure you want to move this reading plan to the Recycle Bin?')) return;
    const deletedAt = new Date().toISOString();
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt } : r);
    setReadings(updated);
    setEditingId(null);
    const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });
  };

  const restoreReading = async (readingId: string) => {
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt: undefined } : r);
    setReadings(updated);
    const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });
  };

  const permanentDeleteReading = async (readingId: string) => {
    if (!window.confirm('Permanently delete this reading plan? This cannot be undone.')) return;
    const updated = readings.filter(r => r.id !== readingId);
    setReadings(updated);
    const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });
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




const StudyTab = ({ projectId, projectData, onUpdate, setHeaderAction, mode, readingTitle }: { projectId: string, projectData: ProjectData, onUpdate: ()=>void, setHeaderAction: (node: React.ReactNode | null) => void, mode: string | null, readingTitle: string | null }) => {
  const router = useRouter();

  const readings = projectData.readings || [];
  const activeReading = readings.find(r => r.title === readingTitle) || null;

  if (activeReading && mode === 'reading') {
    return <Study projectId={projectId} projectData={projectData} onUpdate={onUpdate} activeReading={activeReading} setHeaderAction={setHeaderAction} />;
  }

  if (activeReading && mode === 'revision') {
    return <RevisionView projectId={projectId} projectData={projectData} onUpdate={onUpdate} activeReading={activeReading} setHeaderAction={setHeaderAction} />;
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
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const mode = searchParams.get('mode');

  const [showManagement, setShowManagement] = useState(false);
  const [headerAction, setHeaderAction] = useState<React.ReactNode | null>(null);
  type DrawingTool = 'pen' | 'highlighter' | 'eraser';
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [isDrawingMenuOpen, setIsDrawingMenuOpen] = useState(false);
  const drawingMenuRef = useRef<HTMLDivElement | null>(null);
  
  const [isUiVisible, setIsUiVisible] = useState(true);

  useEffect(() => {
    const handleToggle = (e: any) => setIsUiVisible(e.detail.visible);
    document.addEventListener('toggle-header', handleToggle);
    return () => document.removeEventListener('toggle-header', handleToggle);
  }, []);

    const [managementTab, setManagementTab] = useState('Reading');
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
      const data = await getProjectById(id);
      if(data) {
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
          await saveProject({ ...data, readings: validReadings });
          data.readings = validReadings;
        }

        setProjectData(data as any);
      }
      
      if (showManagement) {
        const pData = (await getPages(id)).sort((a,b)=>a.pageNum - b.pageNum);
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
    <div className="container fade-in" style={{ 
      padding: mode ? 0 : '2rem 1rem', 
      margin: mode ? 0 : 'auto', 
      maxWidth: mode ? '100%' : undefined,
      height: mode ? '100vh' : undefined,
      display: mode ? 'flex' : 'block',
      flexDirection: mode ? 'column' : undefined,
      overflow: mode ? 'hidden' : undefined
    }}>
      {!mode || showManagement ? (
        <div className="flex-responsive" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--background)', padding: '1rem 0', marginBottom: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h1 style={{ marginBottom: '0.2rem' }}>{projectData.name}</h1>
                <span style={{ background: 'var(--surface-solid)', padding: '0.2rem 0.8rem', borderRadius: '1rem', fontSize: '0.8rem', border: '1px solid var(--surface-border)' }}>{projectData.category}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Ultra-slim Transparent Header for Study Mode */}
          <div style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100, 
            background: 'linear-gradient(rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
            padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            transform: isUiVisible ? 'translateY(0)' : 'translateY(-100%)', transition: 'transform 0.3s',
            pointerEvents: isUiVisible ? 'auto' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                onClick={() => { window.location.href = `/project?id=${id}`; }}
                className="btn glass-card" 
                style={{ padding: '0.6rem', color: 'white', border: 'none', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}
                title="Back to Reading List"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              {headerAction && (
                <div style={{ position: 'relative' }} ref={drawingMenuRef}>
                  <button 
                    className="btn glass-card" 
                    style={{ 
                      padding: '0.6rem', color: activeDrawingTool ? 'var(--primary)' : 'white', 
                      background: activeDrawingTool ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)', 
                      border: 'none', backdropFilter: 'blur(10px)' 
                    }}
                    onClick={() => setIsDrawingMenuOpen(!isDrawingMenuOpen)}
                    title="Marking Tools"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                  </button>
                  
                  {isDrawingMenuOpen && (
                    <div style={{
                      position: 'absolute', top: '120%', right: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem',
                      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '0.5rem', borderRadius: '1rem',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)'
                    }}>
                      <button 
                        className="btn" 
                        style={{ padding: '0.6rem', borderRadius: '50%', background: activeDrawingTool === 'highlighter' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'highlighter' ? 'white' : 'var(--foreground)', border: 'none' }}
                        onClick={() => { setActiveDrawingTool(activeDrawingTool === 'highlighter' ? null : 'highlighter'); setIsDrawingMenuOpen(false); }}
                        title="Highlighter"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l-4 4a2.828 2.828 0 0 0 4 4l4-4"></path><path d="M12 15l4-4-4-4-4 4z"></path><path d="M16 11l4-4a2.828 2.828 0 1 0-4-4l-4 4"></path></svg>
                      </button>
                      <button 
                        className="btn" 
                        style={{ padding: '0.6rem', borderRadius: '50%', background: activeDrawingTool === 'pen' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'pen' ? 'white' : 'var(--foreground)', border: 'none' }}
                        onClick={() => { setActiveDrawingTool(activeDrawingTool === 'pen' ? null : 'pen'); setIsDrawingMenuOpen(false); }}
                        title="Pen"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                      </button>
                      <button 
                        className="btn" 
                        style={{ padding: '0.6rem', borderRadius: '50%', background: activeDrawingTool === 'eraser' ? 'var(--primary)' : 'transparent', color: activeDrawingTool === 'eraser' ? 'white' : 'var(--foreground)', border: 'none' }}
                        onClick={() => { setActiveDrawingTool(activeDrawingTool === 'eraser' ? null : 'eraser'); setIsDrawingMenuOpen(false); }}
                        title="Smart Eraser"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {headerAction}
            </div>
          </div>
        </>
      )}

      <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: showManagement ? undefined : 'none', background: showManagement ? undefined : 'transparent', boxShadow: showManagement ? undefined : 'none' }}>
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
            {managementTab === 'Book' && <BookTab projectId={id} pages={pages} onUpdate={fetchData} />}
          </div>
        ) : (
          <div style={{ minHeight: '400px' }}>
            <StudyTab projectId={id} projectData={projectData} onUpdate={fetchData} setHeaderAction={setHeaderAction} mode={mode} readingTitle={searchParams.get('reading')} />
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
