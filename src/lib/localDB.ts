/**
 * localDB.ts - Local Storage Service
 * Replaces Firebase for all project/page data.
 * Uses @capacitor/filesystem for images and @capacitor/preferences for metadata.
 */

import type { ProjectData, PageData, ReadingData } from '@/types/project';
import { db } from './firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const PROJECTS_KEY = 'smart_study_projects';
const LIBRARY_KEY = 'ss_library_cache';
const LIBRARY_SYNC_KEY = 'smart_study_library_last_sync';
const IMG_DIR = 'smartstudy/images';

// ─────────────────────────────────────────────
// CAPACITOR LAZY IMPORTS (client-only)
// ─────────────────────────────────────────────
async function getFilesystem() {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  return { Filesystem, Directory };
}
async function getPreferences() {
  const { Preferences } = await import('@capacitor/preferences');
  return { Preferences };
}

// ─────────────────────────────────────────────
// IMAGE STORAGE (Filesystem)
// ─────────────────────────────────────────────

/** Save a base64 dataURL image to the device filesystem. Returns a fs:// path. */
export async function saveImage(projectId: string, pageId: string, dataUrl: string): Promise<string> {
  if (typeof window === 'undefined') return dataUrl;
  try {
    const { Filesystem, Directory } = await getFilesystem();
    const path = `${IMG_DIR}/${projectId}/${pageId}.webp`;
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    await Filesystem.writeFile({ path, data: base64Data, directory: Directory.Data, recursive: true });
    return `fs://${path}`;
  } catch (e) {
    console.error('saveImage failed, falling back to memory:', e);
    return dataUrl;
  }
}

/** Read an image from fs:// path back to a base64 dataURL. */
export async function readImage(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl || !pathOrUrl.startsWith('fs://')) return pathOrUrl;
  if (typeof window === 'undefined') return '';
  try {
    const { Filesystem, Directory } = await getFilesystem();
    const path = pathOrUrl.replace('fs://', '');
    const result = await Filesystem.readFile({ path, directory: Directory.Data });
    return `data:image/webp;base64,${result.data as string}`;
  } catch (e) {
    console.error('readImage failed:', e);
    return '';
  }
}

/** Delete an image file from filesystem. */
export async function deleteImage(projectId: string, pageId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { Filesystem, Directory } = await getFilesystem();
    await Filesystem.deleteFile({ path: `${IMG_DIR}/${projectId}/${pageId}.webp`, directory: Directory.Data });
  } catch { /* ignore - file may not exist */ }
}

// ─────────────────────────────────────────────
// PROJECTS (Preferences)
// ─────────────────────────────────────────────

export async function getProjects(): Promise<ProjectData[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { Preferences } = await getPreferences();
    const { value } = await Preferences.get({ key: PROJECTS_KEY });
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

export async function getProjectById(id: string): Promise<ProjectData | null> {
  const projects = await getProjects();
  return projects.find(p => p.id === id) || null;
}

export async function saveProject(project: ProjectData): Promise<void> {
  if (typeof window === 'undefined') return;
  const { Preferences } = await getPreferences();
  const projects = await getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.unshift(project); // newest first
  }
  await Preferences.set({ key: PROJECTS_KEY, value: JSON.stringify(projects) });
}

export async function softDeleteProject(id: string): Promise<void> {
  const projects = await getProjects();
  const project = projects.find(p => p.id === id);
  if (!project) return;
  await saveProject({ ...project, deletedAt: new Date().toISOString() });
}

export async function restoreProject(id: string): Promise<void> {
  const projects = await getProjects();
  const project = projects.find(p => p.id === id) as any;
  if (!project) return;
  const { deletedAt, ...rest } = project;
  await saveProject(rest);
}

export async function hardDeleteProject(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const { Preferences } = await getPreferences();
  const projects = await getProjects();
  await Preferences.set({ key: PROJECTS_KEY, value: JSON.stringify(projects.filter(p => p.id !== id)) });
  await Preferences.remove({ key: `ss_pages_${id}` });
  try {
    const { Filesystem, Directory } = await getFilesystem();
    await Filesystem.rmdir({ path: `${IMG_DIR}/${id}`, directory: Directory.Data, recursive: true });
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// PAGES (Preferences for metadata, Filesystem for images)
// ─────────────────────────────────────────────

export async function getPages(projectId: string): Promise<PageData[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { Preferences } = await getPreferences();
    const { value } = await Preferences.get({ key: `ss_pages_${projectId}` });
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

export async function savePage(projectId: string, page: PageData): Promise<void> {
  if (typeof window === 'undefined') return;
  const { Preferences } = await getPreferences();
  const pages = await getPages(projectId);
  const idx = pages.findIndex(p => p.id === page.id);
  if (idx >= 0) {
    pages[idx] = page;
  } else {
    pages.push(page);
  }
  pages.sort((a, b) => a.pageNum - b.pageNum);
  await Preferences.set({ key: `ss_pages_${projectId}`, value: JSON.stringify(pages) });
}

/**
 * Save a page AND persist its image to filesystem.
 * The imageUrl in the returned PageData is a fs:// path, not a dataURL.
 */
export async function savePageWithImage(projectId: string, page: PageData): Promise<PageData> {
  let savedPage = { ...page };
  if (savedPage.imageUrl && !savedPage.imageUrl.startsWith('fs://')) {
    const fsPath = await saveImage(projectId, savedPage.id, savedPage.imageUrl);
    savedPage = { ...savedPage, imageUrl: fsPath };
  }
  await savePage(projectId, savedPage);
  return savedPage;
}

/** Load the actual image dataURL for a page (from filesystem if needed). */
export async function loadPageImage(page: PageData): Promise<PageData> {
  if (page.imageUrl && page.imageUrl.startsWith('fs://')) {
    const dataUrl = await readImage(page.imageUrl);
    return { ...page, imageUrl: dataUrl };
  }
  return page;
}

export async function deletePage(projectId: string, pageId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const { Preferences } = await getPreferences();
  const pages = await getPages(projectId);
  await Preferences.set({ key: `ss_pages_${projectId}`, value: JSON.stringify(pages.filter(p => p.id !== pageId)) });
  await deleteImage(projectId, pageId);
}

export async function updatePageNum(projectId: string, pageId: string, newNum: number): Promise<void> {
  const pages = await getPages(projectId);
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  await savePage(projectId, { ...page, pageNum: newNum });
}

export async function updatePageDrawings(projectId: string, pageId: string, drawings: any[]): Promise<void> {
  const pages = await getPages(projectId);
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  await savePage(projectId, { ...page, drawings });
}

export async function markPageRead(projectId: string, pageId: string): Promise<void> {
  const pages = await getPages(projectId);
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  await savePage(projectId, { ...page, status: 'read' });
}

// ─────────────────────────────────────────────
// LIBRARY CACHE (from FCM / Firestore push)
// ─────────────────────────────────────────────

export interface SharedBook {
  id: string;
  bookName: string;
  bookClass: string;
  bookType: string;
  version: string;
  subject: string;
  coverImageUrl?: string;
  driveLink: string;
  driveFileId?: string;
  sharedAt: string;
}

export async function getLibraryCache(): Promise<SharedBook[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { Preferences } = await getPreferences();
    const { value } = await Preferences.get({ key: LIBRARY_KEY });
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

export async function addToLibraryCache(book: SharedBook): Promise<void> {
  if (typeof window === 'undefined') return;
  const { Preferences } = await getPreferences();
  const books = await getLibraryCache();
  const existingIdx = books.findIndex(b => b.id === book.id || (book.driveFileId && b.driveFileId === book.driveFileId));
  if (existingIdx >= 0) {
    books[existingIdx] = book;
  } else {
    books.unshift(book);
  }
  await Preferences.set({ key: LIBRARY_KEY, value: JSON.stringify(books) });
}

/** Client-side search/filter - NO server needed. */
export function searchLibrary(books: SharedBook[], searchQuery: string, filters: Partial<Pick<SharedBook, 'bookClass' | 'subject' | 'bookType' | 'version'>>): SharedBook[] {
  let results = [...books];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    results = results.filter(b =>
      b.bookName.toLowerCase().includes(q) ||
      b.subject.toLowerCase().includes(q) ||
      b.bookClass.toLowerCase().includes(q)
    );
  }
  if (filters.bookClass) results = results.filter(b => b.bookClass === filters.bookClass);
  if (filters.subject) results = results.filter(b => b.subject === filters.subject);
  if (filters.bookType) results = results.filter(b => b.bookType === filters.bookType);
  if (filters.version) results = results.filter(b => b.version === filters.version);
  return results;
}

// ─────────────────────────────────────────────
// ID GENERATOR
// ─────────────────────────────────────────────
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getLocalLibrary(): Promise<any[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { Preferences } = await getPreferences();
    const { value } = await Preferences.get({ key: LIBRARY_KEY });
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

export async function syncGlobalLibrary(): Promise<any[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { Preferences } = await getPreferences();
    const { value: lastSyncValue } = await Preferences.get({ key: LIBRARY_SYNC_KEY });
    const lastSync = lastSyncValue ? parseInt(lastSyncValue, 10) : 0;
    
    let q;
    if (lastSync > 0) {
      q = query(collection(db, 'shared_books'), where('sharedAt', '>', new Date(lastSync)), orderBy('sharedAt', 'desc'));
    } else {
      q = query(collection(db, 'shared_books'), orderBy('sharedAt', 'desc'), limit(500));
    }
    
    const snapshot = await getDocs(q);
    const newBooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), sharedAt: doc.data().sharedAt?.toMillis() || Date.now() }));
    
    let allBooks = await getLocalLibrary();
    
    if (newBooks.length > 0) {
      const existingIds = new Set(newBooks.map(b => b.id));
      allBooks = [...newBooks, ...allBooks.filter(b => !existingIds.has(b.id))];
      await Preferences.set({ key: LIBRARY_KEY, value: JSON.stringify(allBooks) });
      await Preferences.set({ key: LIBRARY_SYNC_KEY, value: Date.now().toString() });
    }
    
    return allBooks;
  } catch (e) {
    console.error("Library sync failed", e);
    return await getLocalLibrary();
  }
}
