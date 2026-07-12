"use client";
import { useState, useEffect } from 'react';
import { PageData, ProjectData } from '@/types/project';
import { getPages, loadPageImage } from '@/lib/localDB';

interface StudyProps {
  projectData?: ProjectData;
  projectId: string;
  [key: string]: any;
}

export default function Study({ projectId, ...props }: StudyProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);

  // Enable native pinch-to-zoom when this component mounts
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    let originalContent = '';
    
    if (meta) {
      originalContent = meta.getAttribute('content') || '';
      // Allow scaling up to 5x natively
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes');
    }

    return () => {
      // Revert back to original viewport settings when component unmounts
      if (meta && originalContent) {
        meta.setAttribute('content', originalContent);
      }
    };
  }, []);

  useEffect(() => {
    async function loadPages() {
      try {
        const allPages = await getPages(projectId);
        const sorted = allPages.sort((a, b) => a.pageNum - b.pageNum);
        const loadedPages = await Promise.all(sorted.map(p => loadPageImage(p)));
        setPages(loadedPages);
      } catch (err) {
        console.error("Error loading pages", err);
      } finally {
        setLoading(false);
      }
    }
    loadPages();
  }, [projectId]);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e0e2e5', zIndex: 1000 }}>
        <p style={{ color: '#555' }}>Loading viewer...</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#e0e2e5', zIndex: 1000, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', gap: '4px', paddingBottom: '50vh' }}>
        {pages.map(p => (
          <img 
            key={p.id} 
            src={p.imageUrl} 
            alt={`Page ${p.pageNum}`} 
            style={{ width: '100%', display: 'block', background: 'white' }} 
          />
        ))}
      </div>
    </div>
  );
}
