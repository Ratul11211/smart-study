"use client";
import Link from 'next/link';
import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function CreateProjectPage() {
  const [bookName, setBookName] = useState('');
  const [bookCategory, setBookCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const submitProject = async () => {
    if (!user) return alert('You must be logged in to create a project.');
    if (!bookName || !bookCategory) return alert('Please fill in Book Name and Category');
    setIsSaving(true);
    try {
      const projectRef = await addDoc(collection(db, `users/${user.uid}/projects`), {
        name: bookName,
        category: bookCategory,
        createdAt: serverTimestamp(),
        srsIntervals: [1, 3, 7],
        maxUnlockedPage: 1
      });
      alert('Project created successfully!');
      router.push(`/project?id=${projectRef.id}`);
    } catch (e) {
      console.error(e);
      alert('Error creating project. Check Firebase permissions.');
    }
    setIsSaving(false);
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-secondary" onClick={() => router.back()} style={{ padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Go Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button className="btn btn-secondary" onClick={() => router.push('/')} style={{ padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Go Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <h1 style={{ fontSize: '2rem', margin: 0 }}>Create New Project</h1>
      </div>
      
      <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Book Name</label>
            <input type="text" value={bookName} onChange={(e) => setBookName(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)' }} placeholder="e.g. History of the World" />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Category</label>
            <input type="text" value={bookCategory} onChange={(e) => setBookCategory(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)' }} placeholder="e.g. History" />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={submitProject} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
