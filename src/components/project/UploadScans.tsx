"use client";
import { useState, useRef, useCallback, useEffect } from 'react';
import { collection, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData } from '@/types/project';

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

export default UploadScans;
