const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf8');

const idx = content.indexOf('function ProjectContent() {');
if (idx === -1) {
  console.log("Could not find ProjectContent");
  process.exit(1);
}

const base = content.substring(0, idx);

const lastSearchIdx = content.lastIndexOf('const searchParams = useSearchParams();');
if (lastSearchIdx === -1) {
  console.log("Could not find searchParams");
  process.exit(1);
}

const correctBody = content.substring(lastSearchIdx);

const fixed = base + 'function ProjectContent() {\n  ' + correctBody;
fs.writeFileSync('src/app/project/page.tsx', fixed);
console.log('Fixed page.tsx perfectly!');
