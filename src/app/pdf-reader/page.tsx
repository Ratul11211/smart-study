'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

function PdfReaderContent() {
  const searchParams = useSearchParams();
  const fileUri = searchParams.get('file');
  const router = useRouter();
  
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileUri) return;
    
    let url = fileUri;
    if (Capacitor.isNativePlatform()) {
      url = Capacitor.convertFileSrc(fileUri);
    }
    
    const loadPdf = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        renderFirstFewPages(pdf);
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Failed to load PDF.");
      }
    };
    
    loadPdf();
  }, [fileUri]);

  const renderFirstFewPages = async (pdf: any) => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    
    // Render all pages for reading
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.marginBottom = '16px';
      canvas.style.borderRadius = '8px';
      canvas.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      containerRef.current.appendChild(canvas);
      
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  };

  const compressToTargetSize = (canvas: HTMLCanvasElement): string => {
    return canvas.toDataURL('image/jpeg', 0.6);
  };

  const handleCreateProject = async () => {
    if (!pdfDoc) return;
    
    const title = prompt("Enter a name for this project:");
    if (!title) return;
    
    const subjectId = prompt("Enter Subject ID (leave empty if none):") || "";
    
    setIsProcessing(true);
    
    try {
      const pagesData = [];
      
      // Process all pages
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const compressedBase64 = compressToTargetSize(canvas);
        
        pagesData.push({
          id: 'page-' + Date.now() + '-' + i,
          imageUrl: compressedBase64,
          pageNum: i,
          category: 'BOOK',
          createdAt: new Date().toISOString()
        });
      }
      
      // Save to Firebase
      const projectData = {
        title,
        description: "Created from PDF",
        subjectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pageCount: pagesData.length,
        pages: pagesData,
        settings: {
          testIntervals: [1, 3, 7, 14, 30],
          isArchived: false,
        }
      };
      
      const docRef = await addDoc(collection(db, 'projects'), projectData);
      
      setIsProcessing(false);
      alert("Project created successfully!");
      router.push('/project/' + docRef.id);
      
    } catch (err) {
      console.error(err);
      alert("Error creating project.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="bg-white dark:bg-gray-800 shadow p-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="font-bold text-lg text-gray-900 dark:text-white">PDF Reader</h1>
        <button
          onClick={handleCreateProject}
          disabled={isProcessing || !pdfDoc}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50"
        >
          {isProcessing ? 'Converting...' : 'Create Project from PDF'}
        </button>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        <div ref={containerRef} className="max-w-3xl mx-auto flex flex-col items-center">
          {!pdfDoc && <div className="text-gray-500 animate-pulse">Loading PDF...</div>}
        </div>
      </div>
      
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-medium text-gray-900 dark:text-white">Processing {numPages} pages...</p>
            <p className="text-sm text-gray-500 mt-1">This might take a minute.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PdfReaderPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
      <PdfReaderContent />
    </Suspense>
  );
}
