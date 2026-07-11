const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf8');
const searchStr = "{managementTab === 'Reading'";
const idx = content.indexOf(searchStr);
if(idx === -1) {
    console.log("Could not find string");
    process.exit(1);
}
const baseContent = content.substring(0, idx);
const newEnd = `{managementTab === 'Reading' && <ReadingSetup projectId={id} currentReadings={projectData.readings || []} />}
            {managementTab === 'Import' && <UploadScans projectId={id} pages={pages} onUploadComplete={() => { fetchData(); setManagementTab('Book'); }} />}
            {managementTab === 'SRS' && <SRS projectId={id} currentIntervals={projectData.srsIntervals} />}
            {managementTab === 'Book' && <BookTab pages={pages} onUpdate={fetchData} />}
          </div>
        ) : (
          <div style={{ minHeight: '400px' }}>
            <StudyTab projectId={id} projectData={projectData} onUpdate={fetchData} setHeaderAction={setHeaderAction} activeDrawingTool={activeDrawingTool} mode={mode} readingTitle={searchParams.get('reading')} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Loading...</div>}>
      <ProjectContent />
    </Suspense>
  );
}
`;
fs.writeFileSync('src/app/project/page.tsx', baseContent + newEnd);
console.log("Fixed!");
