"use client";
import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData } from '@/types/project';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface StudyProps {
  projectData?: ProjectData;
  projectId: string;
  [key: string]: any;
}

export default function Study({ projectId, ...props }: StudyProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPages() {
      try {
        const q = query(collection(db, 'projects', projectId, 'pages'), orderBy('pageNum', 'asc'));
        const snap = await getDocs(q);
        const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as PageData));
        setPages(loaded);
      } catch (err) {
        console.error("Error loading pages", err);
      } finally {
        setLoading(false);
      }
    }
    loadPages();
  }, [projectId]);

  const [isZoomed, setIsZoomed] = useState(false);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e0e2e5', zIndex: 1000 }}>
        <p style={{ color: '#555' }}>Loading viewer...</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#e0e2e5', zIndex: 1000 }}>
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: false }}
        panning={{ disabled: !isZoomed }}
        onTransform={(ref) => setIsZoomed(ref.state.scale > 1.05)}
      >
        {() => (
          <div style={{ width: '100%', height: '100%', overflowY: isZoomed ? 'hidden' : 'auto', overflowX: 'hidden' }}>
            <TransformComponent wrapperStyle={{ width: '100%', minHeight: '100%' }} contentStyle={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', gap: '4px', paddingBottom: '2rem' }}>
                {pages.map(p => (
                  <img 
                    key={p.id} 
                    src={p.imageUrl} 
                    alt={`Page ${p.pageNum}`} 
                    style={{ width: '100%', display: 'block', background: 'white' }} 
                  />
                ))}
              </div>
            </TransformComponent>
          </div>
        )}
      </TransformWrapper>
    </div>
  );
}
