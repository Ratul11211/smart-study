const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src/app/project/page.tsx');
let content = fs.readFileSync(srcFile, 'utf8');

// Function to extract a component block based on basic counting of curly braces
function extractComponent(content, componentName) {
  const startRegex = new RegExp(`const ${componentName} = .*?=>\\s*{`);
  const match = content.match(startRegex);
  if (!match) return null;
  
  let startIndex = match.index;
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let endIndex = -1;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    
    if (inString) {
      if (char === stringChar && content[i-1] !== '\\') {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && i > startIndex + match[0].length) {
          // Check for trailing semicolon or similar
          endIndex = i + 1;
          if (content[endIndex] === ';') endIndex++;
          break;
        }
      }
    }
  }

  if (endIndex !== -1) {
    return {
      text: content.substring(startIndex, endIndex),
      start: startIndex,
      end: endIndex
    };
  }
  return null;
}

// Ensure dir
const compDir = path.join(__dirname, 'src/components/project');
if (!fs.existsSync(compDir)) {
  fs.mkdirSync(compDir, { recursive: true });
}

// Group 1: UploadScans
const uploadExtract = extractComponent(content, 'UploadScans');
if (uploadExtract) {
  const uploadContent = `"use client";
import { useState, useRef, useCallback } from 'react';
import { collection, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData } from '@/types/project';
import * as pdfjsLib from 'pdfjs-dist';

// Note: pdfjs worker init should be done here
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = \`//cdnjs.cloudflare.com/ajax/libs/pdf.js/\${pdfjsLib.version}/pdf.worker.min.js\`;
}

${uploadExtract.text}

export default UploadScans;
`;
  fs.writeFileSync(path.join(compDir, 'UploadScans.tsx'), uploadContent);
  content = content.replace(uploadExtract.text, '');
}

// Group 2: Study
const studyExtract = extractComponent(content, 'Study');
if (studyExtract) {
  const studyContent = `"use client";
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import DrawingOverlay, { DrawingTool, Stroke } from '@/components/DrawingOverlay';

${studyExtract.text}

export default Study;
`;
  fs.writeFileSync(path.join(compDir, 'Study.tsx'), studyContent);
  content = content.replace(studyExtract.text, '');
}

// Group 3: RevisionView & ActiveRevisionView
const activeRevExtract = extractComponent(content, 'ActiveRevisionView');
const revExtract = extractComponent(content, 'RevisionView');
if (activeRevExtract && revExtract) {
  const revContent = `"use client";
import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ProjectData, ReadingData } from '@/types/project';
import DrawingOverlay, { DrawingTool, Stroke } from '@/components/DrawingOverlay';

${activeRevExtract.text}

${revExtract.text}

export default RevisionView;
`;
  fs.writeFileSync(path.join(compDir, 'RevisionView.tsx'), revContent);
  content = content.replace(activeRevExtract.text, '');
  content = content.replace(revExtract.text, '');
}

// Group 4: ManagementTabs (BookTab, PageItem, SRS, ReadingSetup)
const pageItemExt = extractComponent(content, 'PageItem');
const bookTabExt = extractComponent(content, 'BookTab');
const srsExt = extractComponent(content, 'SRS');
const readingSetupExt = extractComponent(content, 'ReadingSetup');

if (pageItemExt && bookTabExt && srsExt && readingSetupExt) {
  const mgmtContent = `"use client";
import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PageData, ReadingData } from '@/types/project';

${pageItemExt.text}

${bookTabExt.text}

${srsExt.text}

${readingSetupExt.text}

export { BookTab, SRS, ReadingSetup };
`;
  fs.writeFileSync(path.join(compDir, 'ManagementTabs.tsx'), mgmtContent);
  content = content.replace(pageItemExt.text, '');
  content = content.replace(bookTabExt.text, '');
  content = content.replace(srsExt.text, '');
  content = content.replace(readingSetupExt.text, '');
}

// Group 5: StudyTab (needs Study & RevisionView dynamically)
// Wait, StudyTab is currently in page.tsx, let's keep it in page.tsx for now or extract it.
// It's small, we can just replace its contents in page.tsx directly later using regex.

// Write back to page.tsx
fs.writeFileSync(srcFile, content);
console.log('Extraction complete!');
