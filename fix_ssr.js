const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf8');

// Find the export default function ProjectPage
const target = 'export default function ProjectPage() {';
const replacement = `import dynamic from 'next/dynamic';

function ProjectPage() {`;

content = content.replace(target, replacement);

const endTarget = `    </Suspense>
  );
}`;
const endReplacement = `    </Suspense>
  );
}

export default dynamic(() => Promise.resolve(ProjectPage), { ssr: false });`;

content = content.replace(endTarget, endReplacement);
fs.writeFileSync('src/app/project/page.tsx', content);
console.log('Fixed SSR for ProjectPage');
