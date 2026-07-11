const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf8');

// Remove top level import and config
content = content.replace("import * as pdfjsLib from 'pdfjs-dist';", "");
content = content.replace("if (typeof window !== 'undefined') {\n  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;\n}", "");
content = content.replace("if (typeof window !== 'undefined') {\r\n  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;\r\n}", "");

// Remove the dynamic fallback we added earlier since we fixed the root cause
const endReplacement = `    </Suspense>
  );
}

export default dynamic(() => Promise.resolve(ProjectPage), { ssr: false });`;
const originalEnd = `    </Suspense>
  );
}`;

content = content.replace(endReplacement, originalEnd);

// Also remove dynamic import at top if it was added
content = content.replace("import dynamic from 'next/dynamic';\n\nfunction ProjectPage() {", "export default function ProjectPage() {");

fs.writeFileSync('src/app/project/page.tsx', content);
console.log('Fixed pdfjsLib top level import');
