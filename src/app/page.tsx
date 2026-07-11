"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProjects, saveProject, softDeleteProject, restoreProject, hardDeleteProject } from '@/lib/localDB';
import { ProjectData } from '@/types/project';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';

const ThemeToggle = dynamic(() => import('@/components/ThemeToggle'), { ssr: false });

export default function Home() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  
  // Edit fields
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editType, setEditType] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editVersion, setEditVersion] = useState('');

  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const { user, loading: authLoading, signIn, signOut } = useAuth();

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const fetchedProjects = await getProjects();
        
        const now = new Date().getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const validProjects = [];
        
        for (const proj of fetchedProjects) {
          if (proj.deletedAt) {
            const deletedTime = new Date(proj.deletedAt).getTime();
            if (now - deletedTime > thirtyDaysMs) {
              await hardDeleteProject(proj.id);
              continue;
            }
          }
          validProjects.push(proj);
        }
        
        setProjects(validProjects);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching projects: ", error);
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleEdit = (project: ProjectData, e: React.MouseEvent) => {
    e.preventDefault();
    setEditingProjectId(project.id!);
    setEditName(project.name || '');
    setEditClass(project.bookClass || '');
    setEditType(project.bookType || '');
    setEditSubject(project.subject || project.category || '');
    setEditVersion(project.version || '');
  };

  const handleSave = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const project = projects.find(p => p.id === id);
    if (!project) return;
    try {
      const updatedProject = {
        ...project,
        name: editName,
        bookClass: editClass,
        bookType: editType,
        subject: editSubject,
        category: editSubject, // legacy compat
        version: editVersion,
      };
      await saveProject(updatedProject);
      setProjects(projects.map(p => p.id === id ? updatedProject : p));
      setEditingProjectId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update project');
    }
  };

  const handleRestore = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await restoreProject(id);
      setProjects(projects.map(p => p.id === id ? { ...p, deletedAt: undefined } : p));
    } catch (err) {
      console.error(err);
      alert('Failed to restore project');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (showRecycleBin) {
        if (confirm("Are you sure you want to permanently delete this project?")) {
          await hardDeleteProject(id);
          setProjects(projects.filter(p => p.id !== id));
        }
      } else {
        if (confirm('Are you sure you want to move this project to the Recycle Bin?')) {
          await softDeleteProject(id);
          setProjects(projects.map(p => p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p));
        }
      }
      setEditingProjectId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to delete project');
    }
  };

  const activeProjects = projects.filter(p => !p.deletedAt);
  const deletedProjects = projects.filter(p => p.deletedAt);
  const displayedProjects = showRecycleBin ? deletedProjects : activeProjects;

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '3rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!user ? (
              <button
                onClick={signIn}
                className="btn btn-primary fade-in"
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: '25px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }}
              >
                {authLoading ? "Loading..." : "Login with Google"}
              </button>
            ) : (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    padding: 0, border: '2px solid var(--primary)',
                    background: 'var(--surface-solid)',
                    overflow: 'hidden', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="Profile"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  )}
                </button>

                {showProfileMenu && (
                  <div className="fade-in" style={{
                    position: 'absolute',
                    top: '100%', left: 0, marginTop: '0.5rem',
                    background: 'var(--surface-solid)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    minWidth: '220px',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{user.displayName || 'User'}</div>
                      <div style={{ fontSize: '0.9rem', opacity: 0.7, wordBreak: 'break-all' }}>{user.email}</div>
                    </div>
                    <div style={{ height: '1px', background: 'var(--surface-border)' }}></div>
                    <button
                      onClick={() => {
                        signOut();
                        setShowProfileMenu(false);
                      }}
                      className="btn btn-secondary"
                      style={{ 
                        width: '100%', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        color: '#ef4444'
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
            <Link
              href="/library"
              className="btn btn-secondary fade-in"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '40px', height: '40px', borderRadius: '50%', padding: 0,
                background: 'var(--surface-solid)',
                color: 'var(--foreground)',
                border: '1px solid var(--surface-border)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                textDecoration: 'none'
              }}
              title="Global Library"
            >
              {/* Globe / Library Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <ThemeToggle />
            <button
              className="btn btn-secondary"
              onClick={() => setIsEditMode(!isEditMode)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '40px', height: '40px', borderRadius: '50%', padding: 0,
                background: isEditMode ? 'var(--primary)' : 'var(--surface-solid)',
                color: isEditMode ? 'white' : 'var(--foreground)',
                border: '1px solid var(--surface-border)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}
              title="Edit Projects"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1V6a2 2 0 0 0-2-2H8V4z" />
                <path d="M4 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8zm3.5 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm2.5-2a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2h-4zm-2.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm2.5-2a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2h-4zm-2.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm2.5-2a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2h-4z" />
              </svg>
            </button>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 className="gradient-text" style={{ fontSize: 'clamp(3.5rem, 8vw, 5.5rem)', marginBottom: '0.5rem', fontWeight: 900, lineHeight: 1.1 }}>Smart Study</h1>
          <p style={{ opacity: 0.8, fontSize: '1.1rem' }}>Master your subjects with Spaced Repetition.</p>
        </div>
      </header>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="glass-card fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>

          {showRecycleBin && (
            <div className="flex-responsive" style={{ justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Recycle Bin</h2>
            </div>
          )}

          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>

            {isEditMode && !showRecycleBin && (
              <li className="fade-in-delayed" style={{ display: 'flex', gap: '1rem' }}>
                <Link href="/projects/create" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--primary)', transition: 'border-color 0.2s', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                  + Create a new project
                </Link>
                <button
                  onClick={() => setShowRecycleBin(true)}
                  style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem',
                    background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--foreground)',
                    opacity: 0.8, cursor: 'pointer', color: 'var(--foreground)'
                  }}
                  title="View Recycle Bin"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}>
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Recycle Bin
                </button>
              </li>
            )}

            {showRecycleBin && (
              <li className="fade-in-delayed" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => setShowRecycleBin(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}
                >
                  ← Back to Active Projects
                </button>
              </li>
            )}

            {loading && (
              <>
                {[1, 2, 3].map(i => (
                  <li key={i} style={{ animationDelay: `${i * 0.1}s` }} className="fade-in">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '1.2rem', width: `${60 + i * 10}%`, background: 'var(--surface-border)', borderRadius: '0.5rem', marginBottom: '0.5rem', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ height: '0.9rem', width: '40%', background: 'var(--surface-border)', borderRadius: '0.5rem', opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </li>
                ))}
              </>
            )}

            {!loading && displayedProjects.length === 0 && (
              <p style={{ opacity: 0.5, textAlign: 'center', padding: '2rem' }}>
                {showRecycleBin ? 'Recycle bin is empty.' : "You don't have any projects yet. Click Edit to create one."}
              </p>
            )}

            {!loading && displayedProjects.map((project, idx) => (
              <li key={project.id} className="fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                {editingProjectId === project.id ? (
                  <div style={{ display: 'block', padding: '1rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '1px solid var(--primary)' }}>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Project Name" className="input-responsive" style={{ marginBottom: '0.5rem' }} autoFocus />
                    <input type="text" value={editClass} onChange={(e) => setEditClass(e.target.value)} placeholder="Class" className="input-responsive" style={{ marginBottom: '0.5rem' }} />
                    <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Subject" className="input-responsive" style={{ marginBottom: '1rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary" onClick={(e) => handleSave(project.id!, e)} style={{ flex: 1, padding: '0.5rem' }}>Save</button>
                      <button className="btn btn-secondary" onClick={(e) => handleDelete(e, project.id!)} style={{ flex: 1, padding: '0.5rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                      <button className="btn btn-secondary" onClick={(e) => { e.preventDefault(); setEditingProjectId(null); }} style={{ flex: 1, padding: '0.5rem' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <Link href={`/project?id=${project.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1rem', background: 'var(--surface-solid)', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', transition: 'transform 0.2s, box-shadow 0.2s', textDecoration: 'none', color: 'inherit', pointerEvents: showRecycleBin ? 'none' : 'auto', opacity: showRecycleBin ? 0.7 : 1 }} className="project-link">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>{project.name}</div>
                      <div style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.3rem' }}>{project.bookClass ? `${project.bookClass} - ${project.subject}` : project.category}</div>
                      {showRecycleBin && project.deletedAt && (
                        <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.3rem' }}>
                          Deleted on {new Date(project.deletedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {isEditMode && !showRecycleBin && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
                        onClick={(e) => handleEdit(project, e)}
                        title="Edit Project"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    )}
                    {showRecycleBin && (
                      <div style={{ display: 'flex', gap: '0.5rem', pointerEvents: 'auto' }}>
                        <button className="btn btn-primary" onClick={(e) => handleRestore(e, project.id!)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Restore</button>
                        <button className="btn btn-secondary" onClick={(e) => handleDelete(e, project.id!)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: '#ef4444', color: 'white', border: 'none' }}>Delete</button>
                      </div>
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
