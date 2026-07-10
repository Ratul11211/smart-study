'use client';

import { useTheme } from './ThemeProvider';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ width: 40, height: 40 }}></div>;
  }

  const isDark = theme === 'dark';

  return (
    <button 
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      style={{ 
        background: 'var(--surface-solid)',
        color: 'var(--foreground)',
        border: '1px solid var(--surface-border)',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '1.2rem',
        transition: 'all 0.2s',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
