"use client";
import { useState, useEffect } from 'react';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import { getPages, loadPageImage } from '@/lib/localDB';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

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

  useEffect(() => {
    async function loadPages() {
      try {
        const allPages = await getPages(projectId);
        // Only load pages that are relevant to this reading (simplification: sort all by pageNum)
        // In a real app, you might filter by reading bounds if specified.
        const sorted = allPages.sort((a, b) => a.pageNum - b.pageNum);
        
        // Let's filter to only show pages from leftOffPage onwards, to avoid loading everything
        const startPage = activeReading.leftOffPage || 1;
        // Load up to 50 pages at a time to prevent memory crash
        const relevantPages = sorted.filter(p => p.pageNum >= startPage).slice(0, 50);
        
        const loadedPages = await Promise.all(relevantPages.map(p => loadPageImage(p)));
        setPages(loadedPages);
      } catch (err) {
        console.error("Error loading pages", err);
      } finally {
        setLoading(false);
      }
    }
    loadPages();
  }, [projectId, activeReading.leftOffPage]);

  const toggleMarkAsRead = (pageNum: number) => {
    setReadPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageNum)) newSet.delete(pageNum);
      else newSet.add(pageNum);
      return newSet;
    });
  };

  const handleDoneForToday = async () => {
    if (readPages.size === 0) {
      alert("You haven't marked any pages as read yet!");
      return;
    }

    setIsSaving(true);
    try {
      const readArray = Array.from(readPages).sort((a, b) => a - b);
      const maxPageRead = readArray[readArray.length - 1];
      const newLeftOffPage = Math.max(activeReading.leftOffPage || 1, maxPageRead + 1);

      // 1. Update the reading's leftOffPage
      const updatedReadings = (projectData.readings || []).map(r => 
        r.title === activeReading.title ? { ...r, leftOffPage: newLeftOffPage } : r
      );

      // 2. Generate SRS tasks for the newly read pages
      const existingTasks = projectData.srsTasks || [];
      const newTasks: any[] = [];
      const today = new Date();
      
      readArray.forEach(pageNum => {
        // First revision is tomorrow (interval = 1 day)
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + REVISION_INTERVALS[0]);
        
        newTasks.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
          readingTitle: activeReading.title,
          page: pageNum,
          repetitionIndex: 0,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending'
        });
      });

      const finalTasks = [...existingTasks, ...newTasks];

      // Save to Firebase
      await updateDoc(doc(db, 'projects', projectId), {
        readings: updatedReadings,
        srsTasks: finalTasks
      });

      onUpdate();
      alert(`Awesome! You read ${readPages.size} pages today. They've been added to your Revision schedule.`);
      router.push(`/project?id=${projectId}`);
    } catch (err) {
      console.error(err);
      alert("Error saving progress.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    setHeaderAction(
      <button 
        className="btn btn-primary" 
        onClick={handleDoneForToday}
        disabled={isSaving || readPages.size === 0}
      >
        {isSaving ? "Saving..." : "Done for Today"}
      </button>
    );
    return () => setHeaderAction(null);
  }, [handleDoneForToday, setHeaderAction, isSaving, readPages.size]);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e0e2e5', zIndex: 1000 }}>
        <p style={{ color: '#555' }}>Loading viewer...</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#e0e2e5', zIndex: 1000, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', gap: '2rem', paddingBottom: '50vh', paddingTop: '1rem' }}>
        
        {pages.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h3>You have reached the end of this reading!</h3>
            <p>No more pages available.</p>
          </div>
        ) : null}

        {pages.map(p => {
          const isRead = readPages.has(p.pageNum);
          return (
            <div key={p.id} style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              
              <div style={{ width: '100%', background: 'var(--surface-solid)', padding: '1rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>Page {p.pageNum}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={isRead}
                    onChange={() => toggleMarkAsRead(p.pageNum)}
                    style={{ width: '1.2rem', height: '1.2rem' }}
                  />
                  <span>Mark as Read</span>
                </label>
              </div>

              <img 
                src={p.imageUrl} 
                alt={`Page ${p.pageNum}`} 
                style={{ width: '100%', display: 'block', opacity: isRead ? 0.8 : 1 }} 
              />
              
            </div>
          );
        })}
      </div>
    </div>
  );
}
