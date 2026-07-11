const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf-8');

// 1. Imports
content = content.replace(
  /import \{ doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc \} from 'firebase\/firestore';\nimport \{ db \} from '@\/lib\/firebase';/,
  `import { getProjectById, saveProject, getPages, savePageWithImage, loadPageImage, updatePageNum, deletePage, updatePageDrawings, generateId } from '@/lib/localDB';`
);

// 2. UploadScans - savePageWithImage
content = content.replace(
  /await addDoc\(collection\(db, 'pages'\), \{\n\s*projectId,\n\s*pageNum: Number\(startPageNum\) \+ i,\n\s*imageUrl: page.imageUrl,\n\s*status: page.status,\n\s*category: uploadCategory\n\s*\}\);/g,
  `await savePageWithImage(projectId, { id: generateId(), pageNum: Number(startPageNum) + i, imageUrl: page.imageUrl, status: page.status, category: uploadCategory });`
);

// 3. Study - fetchPagesBatch
content = content.replace(
  /const q = query\(collection\(db, 'pages'\), where\('projectId', '==', projectId\), where\('pageNum', 'in', chunk\)\);\n\s*const pSnap = await getDocs\(q\);\n\s*allFetched = \[\.\.\.allFetched, \.\.\.pSnap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as PageData\)\)\];/g,
  `const allPages = await getPages(projectId);
        const chunkPages = allPages.filter(p => chunk.includes(p.pageNum));
        const loadedPages = await Promise.all(chunkPages.map(p => loadPageImage(p)));
        allFetched = [...allFetched, ...loadedPages];`
);

// 4. Study - toggleDone
content = content.replace(
  /await updateDoc\(doc\(db, 'pages', p\.id\), updateData\);/g,
  `await savePageWithImage(projectId, { ...p, ...updateData } as any);`
);

// 5. handleDoneForToday - update project
content = content.replace(
  /const \{ auth \} = await import\('@\/lib\/firebase'\);\n\s*const user = auth\.currentUser;\n\s*if \(user\) await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, projectId\), \{ maxUnlockedPage: nextMax \}\);/g,
  `const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, maxUnlockedPage: nextMax });`
);

content = content.replace(
  /if \(user\) \{\n\s*await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, projectId\), \{ \n\s*srsTasks: updatedTasks,\n\s*readings: updatedReadings \n\s*\}\);\n\s*\}/g,
  `const proj2 = await getProjectById(projectId);
    if(proj2) await saveProject({ ...proj2, srsTasks: updatedTasks, readings: updatedReadings });`
);

// 6. ActiveRevisionView - fetchRevPages
content = content.replace(
  /const q = query\(collection\(db, 'pages'\), where\('projectId', '==', projectId\), where\('pageNum', 'in', chunk\)\);\n\s*const snap = await getDocs\(q\);\n\s*allFetched = \[\.\.\.allFetched, \.\.\.snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as PageData\)\)\];/g,
  `const allPages = await getPages(projectId);
        const chunkPages = allPages.filter(p => chunk.includes(p.pageNum));
        const loadedPages = await Promise.all(chunkPages.map(p => loadPageImage(p)));
        allFetched = [...allFetched, ...loadedPages];`
);

// 7. ActiveRevisionView - handleMarkRevisionDone
content = content.replace(
  /await updateDoc\(doc\(db, 'pages', pageId\), \{ drawings \}\);/g,
  `await updatePageDrawings(projectId, pageId, drawings);`
);

content = content.replace(
  /const \{ auth \} = await import\('@\/lib\/firebase'\);\n\s*const user = auth\.currentUser;\n\s*if \(user\) await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, projectId\), \{ srsTasks: updatedTasks \}\);/g,
  `const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, srsTasks: updatedTasks });`
);

// 8. PageItem - handleSave & handleDelete
content = content.replace(
  /await updateDoc\(doc\(db, 'pages', p\.id\), \{ pageNum: Number\(num\) \}\);/g,
  `await updatePageNum(projectId, p.id, Number(num));`
);

content = content.replace(
  /await deleteDoc\(doc\(db, 'pages', p\.id\)\);/g,
  `await deletePage(projectId, p.id);`
);

// We need to pass projectId to PageItem
content = content.replace(
  /const PageItem = \(\{ p, onUpdate, labelPrefix \} : \{ p: PageData, onUpdate: \(\)=>void, labelPrefix: string \}\) => \{/g,
  `const PageItem = ({ projectId, p, onUpdate, labelPrefix }: { projectId: string, p: PageData, onUpdate: ()=>void, labelPrefix: string }) => {`
);
content = content.replace(
  /<PageItem key=\{p\.id\} p=\{p\} onUpdate=\{onUpdate\} labelPrefix="Page" \/>/g,
  `<PageItem key={p.id} projectId={projectId} p={p} onUpdate={onUpdate} labelPrefix="Page" />`
);
content = content.replace(
  /const BookTab = \(\{ pages, onUpdate \}: \{ pages: PageData\[\], onUpdate: \(\)=>void \}\) => \{/g,
  `const BookTab = ({ projectId, pages, onUpdate }: { projectId: string, pages: PageData[], onUpdate: ()=>void }) => {`
);
content = content.replace(
  /<BookTab pages=\{pages\} onUpdate=\{fetchData\} \/>/g,
  `<BookTab projectId={id} pages={pages} onUpdate={fetchData} />`
);

// 9. SRS
content = content.replace(
  /const \{ auth \} = await import\('@\/lib\/firebase'\);\n\s*const user = auth\.currentUser;\n\s*if \(user\) await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, projectId\), \{ srsIntervals: updated \}\);/g,
  `const proj = await getProjectById(projectId);
      if(proj) await saveProject({ ...proj, srsIntervals: updated });`
);

// 10. ReadingSetup
content = content.replace(
  /import\('@\/lib\/firebase'\)\.then\(\(\{ auth \}\) => \{\n\s*if \(auth\.currentUser\) updateDoc\(doc\(db, \`users\/\$\{auth\.currentUser\.uid\}\/projects\`, projectId\), \{ readings: updated \}\)\.catch\(console\.error\);\n\s*\}\);/g,
  `getProjectById(projectId).then(proj => { if(proj) saveProject({ ...proj, readings: updated }) });`
);

content = content.replace(
  /const \{ auth \} = await import\('@\/lib\/firebase'\);\n\s*const user = auth\.currentUser;\n\s*if \(user\) await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, projectId\), \{ readings: updated \}\);/g,
  `const proj = await getProjectById(projectId);
    if(proj) await saveProject({ ...proj, readings: updated });`
);

// 11. ProjectContent - fetchData
content = content.replace(
  /const docSnap = await getDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, id\)\);\n\s*if\(docSnap\.exists\(\)\) \{\n\s*const data = docSnap\.data\(\);\n\s*let readings = data\.readings \|\| \[\];/g,
  `const data = await getProjectById(id);
      if(data) {
        let readings = data.readings || [];`
);

content = content.replace(
  /await updateDoc\(doc\(db, \`users\/\$\{user\.uid\}\/projects\`, id\), \{ readings: validReadings \}\);/g,
  `await saveProject({ ...data, readings: validReadings });`
);

content = content.replace(
  /setProjectData\(\{ id: docSnap\.id, \.\.\.data \} as any\);/g,
  `setProjectData(data as any);`
);

content = content.replace(
  /const q = query\(collection\(db, 'pages'\), where\('projectId', '==', id\)\);\n\s*const pSnap = await getDocs\(q\);\n\s*const pData = pSnap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \} as PageData\)\)\.sort\(\(a,b\)=>a\.pageNum - b\.pageNum\);/g,
  `const pData = (await getPages(id)).sort((a,b)=>a.pageNum - b.pageNum);`
);

fs.writeFileSync('src/app/project/page.tsx', content);
console.log('Regex replacements done.');
