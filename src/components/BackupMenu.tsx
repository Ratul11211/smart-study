import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData } from '@/types/project';

export default function BackupMenu({ project, pages }: { project: ProjectData, pages: PageData[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const generatePDF = async () => {
    if (pages.length === 0) throw new Error("No pages to backup.");
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Sort pages
    const sorted = [...pages].sort((a,b) => a.pageNum - b.pageNum);
    
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) pdf.addPage();
      const page = sorted[i];
      // Assuming images are base64 webp or jpeg
      // Load image to get dimensions
      const img = new Image();
      img.src = page.imageUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const ratio = Math.min(pdfWidth / img.width, pdfHeight / img.height);
      const imgX = (pdfWidth - img.width * ratio) / 2;
      const imgY = (pdfHeight - img.height * ratio) / 2;
      
      pdf.addImage(page.imageUrl, 'WEBP', imgX, imgY, img.width * ratio, img.height * ratio);
    }
    
    return pdf.output('blob');
  };

  const uploadToDrive = async (blob: Blob, share: boolean) => {
    const token = localStorage.getItem('google_access_token');
    if (!token) {
      alert("Please login with Google first to backup to Drive.");
      return;
    }

    const metadata = {
      name: `${project.name || 'SmartStudy_Book'}.pdf`,
      mimeType: 'application/pdf',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: form
    });

    let responseText = await res.text();
    if (!res.ok) {
      console.error('Drive API Error:', responseText);
      if (res.status === 401) {
        throw new Error("Google session expired. Please logout and login again to backup.");
      }
      throw new Error("Failed to upload to Google Drive. Check console for details.");
    }

    const data = JSON.parse(responseText || "{}");

    
    if (share) {
      // Set permissions to anyone with link can view
      await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });

      // Fetch the updated file to get the webViewLink (sometimes it's only available after sharing)
      const linkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}?fields=webViewLink`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const linkData = await linkRes.json();
      
      // Add to global shared_books collection
      await addDoc(collection(db, 'shared_books'), {
        originalProjectId: project.id,
        name: project.name,
        category: project.category,
        driveLink: linkData.webViewLink || data.webViewLink,
        sharedAt: serverTimestamp()
      });
    }

    return data;
  };

  const handleBackup = async (share: boolean) => {
    setIsProcessing(true);
    setIsOpen(false);
    try {
      const blob = await generatePDF();
      await uploadToDrive(blob, share);
      alert(share ? "Successfully backed up and shared!" : "Successfully backed up to your Google Drive!");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to backup. Make sure you are logged in.");
    }
    setIsProcessing(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="fade-in"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
        style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.8rem 1.2rem', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--foreground)', opacity: 0.7,
        }}
        title="Backup Options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span className="hide-on-mobile">{isProcessing ? '...' : 'Backup'}</span>
      </button>

      {isOpen && (
        <div className="fade-in" style={{ 
          position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
          background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--surface-border)', boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          zIndex: 100, minWidth: '150px', overflow: 'hidden'
        }}>
          <button 
            className="btn"
            style={{ width: '100%', textAlign: 'left', padding: '0.8rem 1rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--surface-border)', color: 'var(--foreground)' }}
            onClick={() => handleBackup(false)}
          >
            Drive Backup
          </button>
          <button 
            className="btn"
            style={{ width: '100%', textAlign: 'left', padding: '0.8rem 1rem', background: 'transparent', border: 'none', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => handleBackup(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            Backup & Share
          </button>
        </div>
      )}
    </div>
  );
}
