const fs = require('fs');
let content = fs.readFileSync('src/lib/localDB.ts', 'utf-8');
content += `
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
`;
fs.writeFileSync('src/lib/localDB.ts', content);
