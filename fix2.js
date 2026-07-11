const fs = require('fs');
let content = fs.readFileSync('src/app/project/page.tsx', 'utf8');

const missingHooks = `  const [showManagement, setShowManagement] = useState(false);
  const [headerAction, setHeaderAction] = useState<React.ReactNode | null>(null);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [isDrawingMenuOpen, setIsDrawingMenuOpen] = useState(false);
  const [managementTab, setManagementTab] = useState('Reading');
  const drawingMenuRef = useRef<HTMLDivElement>(null);
  const isLongPress = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const handlePressStart = () => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      router.push('/');
    }, 500);
  };

  const handlePressCancel = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

`;

// 1. Remove it from StudyTab
content = content.replace(missingHooks + '  const searchParams = useSearchParams();', '  const searchParams = useSearchParams();');

// 2. Add it to ProjectContent
// We know ProjectContent starts at `function ProjectContent() {`
const idx = content.indexOf('function ProjectContent() {');
if (idx !== -1) {
    const afterIdx = idx + 'function ProjectContent() {'.length;
    content = content.substring(0, afterIdx) + '\n' + missingHooks + content.substring(afterIdx);
} else {
    console.log("Could not find ProjectContent");
    process.exit(1);
}

fs.writeFileSync('src/app/project/page.tsx', content);
console.log('Fixed hooks precisely!');
