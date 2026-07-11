"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProject, generateId } from '@/lib/localDB';
import dynamic from 'next/dynamic';

const ThemeToggle = dynamic(() => import('@/components/ThemeToggle'), { ssr: false });

const CLASS_OPTIONS = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9-10 (SSC)','Class 11-12 (HSC)','Degree / Honours','Masters'];
const TYPE_OPTIONS = ['NCTB পাঠ্যবই','গাইড / হেল্পার','নোট / লেকচার শিট','রেফারেন্স বই','প্র্যাকটিস বই'];
const VERSION_OPTIONS = ['বাংলা মিডিয়াম','English Medium','English Version'];
const SUBJECT_OPTIONS = ['বাংলা','English','গণিত (Math)','পদার্থবিজ্ঞান (Physics)','রসায়ন (Chemistry)','জীববিজ্ঞান (Biology)','ইতিহাস (History)','ভূগোল (Geography)','অর্থনীতি (Economics)','হিসাববিজ্ঞান (Accounting)','তথ্য ও যোগাযোগ প্রযুক্তি (ICT)','ইসলাম শিক্ষা','সমাজবিজ্ঞান','পরিসংখ্যান (Statistics)','অন্যান্য (Other)'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--surface-border)', background: 'var(--background)',
  color: 'var(--foreground)', fontSize: '1rem', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' };

export default function CreateProjectPage() {
  const [bookName, setBookName] = useState('');
  const [bookClass, setBookClass] = useState('');
  const [bookType, setBookType] = useState('');
  const [version, setVersion] = useState('');
  const [subject, setSubject] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const isValid = bookName.trim() && bookClass && bookType && version && subject;

  const submitProject = async () => {
    if (!isValid) return alert('সব ঘর পূরণ করুন।');
    setIsSaving(true);
    try {
      const newProject = {
        id: generateId(),
        name: bookName.trim(),
        category: subject,   // keep category for compat
        bookClass,
        bookType,
        version,
        subject,
        srsIntervals: [1, 3, 7],
        maxUnlockedPage: 1,
        readings: [],
        createdAt: new Date().toISOString(),
      };
      await saveProject(newProject);
      router.push(`/project?id=${newProject.id}`);
    } catch (e) {
      console.error(e);
      alert('Error creating project.');
    }
    setIsSaving(false);
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => router.back()} style={{ padding: '0.6rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>নতুন প্রজেক্ট</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="glass-card" style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem', display: 'grid', gap: '1.5rem' }}>
        
        {/* Book Name */}
        <div>
          <label style={labelStyle}>📖 বইয়ের নাম <span style={{ color: 'var(--primary)' }}>*</span></label>
          <input
            type="text"
            value={bookName}
            onChange={e => setBookName(e.target.value)}
            style={inputStyle}
            placeholder="যেমন: পদার্থবিজ্ঞান ১ম পত্র"
          />
        </div>

        {/* Class */}
        <div>
          <label style={labelStyle}>🏫 শ্রেণী <span style={{ color: 'var(--primary)' }}>*</span></label>
          <select value={bookClass} onChange={e => setBookClass(e.target.value)} style={inputStyle}>
            <option value="">-- শ্রেণী বেছে নিন --</option>
            {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Book Type */}
        <div>
          <label style={labelStyle}>📚 বইয়ের ধরন <span style={{ color: 'var(--primary)' }}>*</span></label>
          <select value={bookType} onChange={e => setBookType(e.target.value)} style={inputStyle}>
            <option value="">-- ধরন বেছে নিন --</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Version */}
        <div>
          <label style={labelStyle}>🌐 ভার্সন <span style={{ color: 'var(--primary)' }}>*</span></label>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            {VERSION_OPTIONS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVersion(v)}
                className="btn"
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid',
                  borderColor: version === v ? 'var(--primary)' : 'var(--surface-border)',
                  background: version === v ? 'var(--primary)' : 'transparent',
                  color: version === v ? 'white' : 'var(--foreground)',
                  fontWeight: version === v ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >{v}</button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label style={labelStyle}>🔬 বিষয় <span style={{ color: 'var(--primary)' }}>*</span></label>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle}>
            <option value="">-- বিষয় বেছে নিন --</option>
            {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Submit */}
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '0.5rem', opacity: isValid ? 1 : 0.5 }}
          onClick={submitProject}
          disabled={isSaving || !isValid}
        >
          {isSaving ? 'তৈরি হচ্ছে...' : '✓ প্রজেক্ট তৈরি করুন'}
        </button>
      </div>
    </div>
  );
}
