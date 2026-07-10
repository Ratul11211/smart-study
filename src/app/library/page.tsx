"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import dynamic from 'next/dynamic';

const ThemeToggle = dynamic(() => import('@/components/ThemeToggle'), { ssr: false });

export default function GlobalLibrary() {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const q = query(collection(db, 'shared_books'), orderBy('sharedAt', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBooks(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, []);

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '3rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link href="/" className="btn btn-secondary fade-in" style={{ padding: '0.5rem 1.5rem', borderRadius: '25px', fontWeight: 'bold', textDecoration: 'none' }}>
              ← Home
            </Link>
          </div>
          <ThemeToggle />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 className="gradient-text" style={{ fontSize: '3rem', marginBottom: '0.5rem', fontWeight: 800 }}>Global Library</h1>
          <p style={{ opacity: 0.8, fontSize: '1.1rem' }}>Discover books shared by the community.</p>
        </div>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>Loading library...</div>
        ) : books.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.7 }}>
            No books have been shared yet. Be the first to share one!
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {books.map(book => (
              <div key={book.id} className="glass-card fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>{book.name}</h3>
                  <span style={{ opacity: 0.7, fontSize: '0.9rem', background: 'var(--surface-solid)', padding: '0.2rem 0.8rem', borderRadius: '1rem', border: '1px solid var(--surface-border)' }}>
                    {book.category}
                  </span>
                </div>
                <a href={book.driveLink} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.5rem 1rem' }}>
                  Read PDF
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
