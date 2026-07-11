"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { syncGlobalLibrary, getLocalLibrary } from '@/lib/localDB';
import dynamic from 'next/dynamic';

const ThemeToggle = dynamic(() => import('@/components/ThemeToggle'), { ssr: false });

export default function GlobalLibrary() {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedType, setSelectedType] = useState('');

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        // Optimistically load from local first
        const localData = await getLocalLibrary();
        if (localData.length > 0) {
          setBooks(localData);
          setLoading(false);
        }
        
        // Background sync to fetch newly shared books
        const syncedData = await syncGlobalLibrary();
        setBooks(syncedData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, []);

  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        (book.name || '').toLowerCase().includes(q) || 
        (book.subject || '').toLowerCase().includes(q) ||
        (book.category || '').toLowerCase().includes(q);
      
      const matchesClass = !selectedClass || book.bookClass === selectedClass;
      const matchesType = !selectedType || book.bookType === selectedType;

      return matchesSearch && matchesClass && matchesType;
    });
  }, [books, searchQuery, selectedClass, selectedType]);

  const uniqueClasses = Array.from(new Set(books.map(b => b.bookClass).filter(Boolean)));
  const uniqueTypes = Array.from(new Set(books.map(b => b.bookType).filter(Boolean)));

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
        <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--surface-solid)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
          <input 
            type="text" 
            placeholder="Search by book name or subject..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-responsive"
          />
          <div className="flex-responsive" style={{ gap: '1rem' }}>
            <select 
              value={selectedClass} 
              onChange={(e) => setSelectedClass(e.target.value)}
              style={{ flex: 1, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)' }}
            >
              <option value="">All Classes</option>
              {uniqueClasses.map((cls: any) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
            <select 
              value={selectedType} 
              onChange={(e) => setSelectedType(e.target.value)}
              style={{ flex: 1, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--background)', color: 'var(--foreground)' }}
            >
              <option value="">All Types</option>
              {uniqueTypes.map((type: any) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>Loading library...</div>
        ) : filteredBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.7 }}>
            No books found matching your criteria.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {filteredBooks.map(book => (
              <div key={book.id} className="glass-card fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>{book.name}</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ opacity: 0.7, fontSize: '0.8rem', background: 'var(--surface-solid)', padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '1px solid var(--surface-border)' }}>
                      {book.subject || book.category}
                    </span>
                    {book.bookClass && (
                      <span style={{ opacity: 0.7, fontSize: '0.8rem', background: 'var(--surface-solid)', padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '1px solid var(--surface-border)' }}>
                        Class: {book.bookClass}
                      </span>
                    )}
                    {book.version && (
                      <span style={{ opacity: 0.7, fontSize: '0.8rem', background: 'var(--surface-solid)', padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '1px solid var(--surface-border)' }}>
                        V: {book.version}
                      </span>
                    )}
                  </div>
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
