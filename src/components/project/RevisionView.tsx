"use client";
import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import DrawingOverlay, { DrawingTool, Stroke } from '@/components/DrawingOverlay';

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
    await updateDoc(doc(db, 'projects', projectId), { srsTasks: updatedTasks });
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

export default RevisionView;
