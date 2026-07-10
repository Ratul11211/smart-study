"use client";
import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ReadingData } from '@/types/project';

const PageItem = ({ p, onUpdate, labelPrefix }: { p: PageData, onUpdate: ()=>void, labelPrefix: string }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(p.pageNum);

  const handleSave = async () => {
    if(num !== p.pageNum) {
      await updateDoc(doc(db, 'pages', p.id), { pageNum: Number(num) });
    }
    setEditing(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if(confirm('Delete this page?')) {
      await deleteDoc(doc(db, 'pages', p.id));
      onUpdate();
    }
  };

  return (
    <div style={{ maxWidth: '600px', width: '100%' }}>
      <div style={{ background: 'var(--surface-solid)', padding: '0.5rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--surface-border)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>
          {editing ? (
            <input type="number" value={num} onChange={(e)=>setNum(Number(e.target.value))} style={{ width: '80px', padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--primary)' }} autoFocus onBlur={handleSave} onKeyDown={e => e.key === 'Enter' && handleSave()} />
          ) : (
            <span onDoubleClick={() => setEditing(true)}>{labelPrefix} {p.pageNum}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setEditing(!editing)}>{editing ? 'Save' : 'Edit'}</button>
          <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#ff4444', color: 'white', border: 'none' }} onClick={handleDelete}>Delete</button>
        </div>
      </div>
      <img src={p.imageUrl} alt={`${labelPrefix} ${p.pageNum}`} style={{ width: '100%', border: '1px solid var(--surface-border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', background: 'white' }} />
    </div>
  );
};

const BookTab = ({ pages, onUpdate }: { pages: PageData[], onUpdate: ()=>void }) => {
  const boiPages = pages.filter(p => p.category === 'BOOK' || p.category === 'Boi' || !p.category).sort((a,b)=>a.pageNum - b.pageNum);
  return (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h3 style={{ marginBottom: '1rem' }}>BOOK</h3>
    <div style={{ display: 'grid', gap: '2rem', justifyItems: 'center' }}>
      {boiPages.length === 0 && <p style={{ opacity: 0.7 }}>No pages found.</p>}
      {boiPages.map(p => <PageItem key={p.id} p={p} onUpdate={onUpdate} labelPrefix="Page" />)}
    </div>
  </div>
)};

const SRS = ({ projectId, currentIntervals }: { projectId: string, currentIntervals: number[] }) => {
  const [intervals, setIntervals] = useState<number[]>(currentIntervals || []);
  const [isAdding, setIsAdding] = useState(false);
  const [newInterval, setNewInterval] = useState('');

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const addInterval = async () => {
    if(newInterval && !isNaN(Number(newInterval))) {
      const updated = [...intervals, Number(newInterval)];
      setIntervals(updated);
      setNewInterval('');
      setIsAdding(false);
      await updateDoc(doc(db, 'projects', projectId), { srsIntervals: updated });
    }
  };

  const removeInterval = async (index: number) => {
    const updated = intervals.filter((_, i) => i !== index);
    setIntervals(updated);
    await updateDoc(doc(db, 'projects', projectId), { srsIntervals: updated });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>SRS Configuration</h3>
      <p style={{ opacity: 0.8, marginBottom: '2rem' }}>Set your spaced repetition intervals (e.g., 3 days after first reading, 7 days after reading).</p>
      
      {intervals.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          {intervals.map((day, idx) => (
            <div key={idx} style={{ background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{getOrdinal(idx + 1)} Repetition</strong>
              <span>{day} Days later</span>
              <button className="btn" style={{ background: 'transparent', color: '#ff4444', padding: '0.2rem 0.5rem' }} onClick={() => removeInterval(idx)}>✖</button>
            </div>
          ))}
        </div>
      )}

      {isAdding ? (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--surface-solid)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--surface-border)' }}>
          <strong>{getOrdinal(intervals.length + 1)} Repetition: </strong>
          <input type="number" value={newInterval} onChange={(e) => setNewInterval(e.target.value)} placeholder="Days" style={{ padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', width: '100px', background: 'var(--background)', color: 'var(--foreground)' }} autoFocus onKeyDown={e => e.key === 'Enter' && addInterval()} />
          <button className="btn btn-primary" onClick={addInterval}>Save</button>
          <button className="btn btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
          + Add {getOrdinal(intervals.length + 1)} Repetition
        </button>
      )}
    </div>
  );
};

const ReadingSetup = ({ projectId, currentReadings }: { projectId: string, currentReadings: ReadingData[] }) => {
  const [readings, setReadings] = useState<ReadingData[]>(currentReadings || []);
  const [title, setTitle] = useState('');
  const [startPage, setStartPage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  const addReading = async () => {
    if(title && startPage) {
      const newReading: ReadingData = { 
        id: `reading-${Date.now()}`, 
        title, 
        startPage: Number(startPage) 
      };
      const updated = [...readings, newReading].sort((a,b)=>a.startPage - b.startPage);
      setReadings(updated);
      setTitle('');
      setStartPage('');
      await updateDoc(doc(db, 'projects', projectId), { readings: updated });
    }
  };

  const saveEdit = async (id: string) => {
    const updated = readings.map(r => r.id === id ? { ...r, title: editTitle } : r);
    setReadings(updated);
    setEditingId(null);
    await updateDoc(doc(db, 'projects', projectId), { readings: updated });
  };

  const deleteReading = async (readingId: string) => {
    if (!window.confirm('Are you sure you want to move this reading plan to the Recycle Bin?')) return;
    const deletedAt = new Date().toISOString();
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt } : r);
    setReadings(updated);
    setEditingId(null);
    await updateDoc(doc(db, 'projects', projectId), { readings: updated });
  };

  const restoreReading = async (readingId: string) => {
    const updated = readings.map(r => r.id === readingId ? { ...r, deletedAt: undefined } : r);
    setReadings(updated);
    await updateDoc(doc(db, 'projects', projectId), { readings: updated });
  };

  const permanentDeleteReading = async (readingId: string) => {
    if (!window.confirm('Permanently delete this reading plan? This cannot be undone.')) return;
    const updated = readings.filter(r => r.id !== readingId);
    setReadings(updated);
    await updateDoc(doc(db, 'projects', projectId), { readings: updated });
  };

  const activeReadings = readings.filter(r => !r.deletedAt);
  const deletedReadings = readings.filter(r => r.deletedAt);
  const displayedReadings = showRecycleBin ? deletedReadings : activeReadings;

  return (
    <div style={{ padding: '2rem' }}>
      <div className="flex-responsive" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>{showRecycleBin ? 'Recycle Bin' : 'Reading Plan'}</h3>
        <button 
          className="btn btn-secondary" 
          onClick={() => setShowRecycleBin(!showRecycleBin)}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
        >
          {showRecycleBin ? 'View Active Readings' : 'View Recycle Bin'}
        </button>
      </div>
      
      {!showRecycleBin && (
        <div className="flex-responsive-wrap" style={{ marginBottom: '2rem' }}>
          <input type="text" placeholder="Title (e.g. Chapter 1)" value={title} onChange={(e)=>setTitle(e.target.value)} className="input-responsive" style={{ flex: 1, minWidth: '200px' }} />
          <input type="number" placeholder="Start Page" value={startPage} onChange={(e)=>setStartPage(e.target.value)} className="input-responsive" style={{ width: '120px' }} />
          <button className="btn btn-primary mobile-stretch" onClick={addReading}>Add</button>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {displayedReadings.map((r, i) => (
          <li key={r.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--surface-solid)', marginBottom: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
            {editingId === r.id && !showRecycleBin ? (
              <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                <input type="text" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)' }} autoFocus />
                <button className="btn btn-primary" onClick={() => saveEdit(r.id)} style={{ padding: '0.5rem 1rem' }}>Save</button>
                <button className="btn btn-secondary" onClick={() => deleteReading(r.id)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                <button className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ padding: '0.5rem 1rem' }}>Cancel</button>
              </div>
            ) : (
              <>
                <div>
                  <strong>{r.title}</strong> <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>(Starts from Page {r.startPage})</span>
                  {showRecycleBin && r.deletedAt && (
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.3rem' }}>
                      Deleted on {new Date(r.deletedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {!showRecycleBin ? (
                  <button className="btn btn-secondary" style={{ padding: '0.4rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setEditingId(r.id); setEditTitle(r.title); }} title="Edit Reading">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={() => restoreReading(r.id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Restore</button>
                    <button className="btn btn-secondary" onClick={() => permanentDeleteReading(r.id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {displayedReadings.length === 0 && (
          <p style={{ opacity: 0.5 }}>
            {showRecycleBin ? 'Recycle bin is empty.' : 'No readings planned yet.'}
          </p>
        )}
      </ul>
    </div>
  );
};

export { BookTab, SRS, ReadingSetup };
