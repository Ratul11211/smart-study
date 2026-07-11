const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src/components/project');
const pageFile = path.join(__dirname, 'src/app/project/page.tsx');

let upload = fs.readFileSync(path.join(srcDir, 'UploadScans.tsx'), 'utf8');
let study = fs.readFileSync(path.join(srcDir, 'Study.tsx'), 'utf8');
let revision = fs.readFileSync(path.join(srcDir, 'RevisionView.tsx'), 'utf8');
let mgmt = fs.readFileSync(path.join(srcDir, 'ManagementTabs.tsx'), 'utf8');
let page = fs.readFileSync(pageFile, 'utf8');

function extractBody(content) {
    const startIdx = content.search(/(export const|const|export default function|function) (UploadScans|Study|ActiveRevisionView|RevisionView|PageItem|BookTab|SRS|ReadingSetup)/);
    let body = content.substring(startIdx);
    body = body.replace(/export default [^;]+;/g, '');
    body = body.replace(/export {[^}]+};/g, '');
    body = body.replace(/export const /g, 'const ');
    return body;
}

let combined = `"use client";
import Link from 'next/link';
import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import DrawingOverlay, { DrawingTool, Stroke } from '@/components/DrawingOverlay';
import { ProjectData, PageData, ReadingData } from '@/types/project';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = \`//cdnjs.cloudflare.com/ajax/libs/pdf.js/\${pdfjsLib.version}/pdf.worker.min.js\`;
}

${extractBody(upload)}
${extractBody(study)}
${extractBody(revision)}
${extractBody(mgmt)}
`;

let pageBody = page.substring(page.search(/const StudyTab/));

// replace <ManagementTabs ... /> with original mgmt components
pageBody = pageBody.replace(/<ManagementTabs[^>]+>/, 
`{managementTab === 'Reading' && <ReadingSetup projectId={id} currentReadings={projectData.readings || []} />}
            {managementTab === 'Import' && <UploadScans projectId={id} pages={pages} onUploadComplete={() => { fetchData(); setManagementTab('Book'); }} />}
            {managementTab === 'SRS' && <SRS projectId={id} currentIntervals={projectData.srsIntervals} />}
            {managementTab === 'Book' && <BookTab pages={pages} onUpdate={fetchData} />}`);

combined += `\n` + pageBody;

fs.writeFileSync(pageFile, combined);
console.log('Reverted successfully!');
