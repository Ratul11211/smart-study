const fs = require('fs');
const content = fs.readFileSync('src/app/project/page.tsx', 'utf8');

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

const newContent = content.replace('const searchParams = useSearchParams();', missingHooks + '  const searchParams = useSearchParams();');
fs.writeFileSync('src/app/project/page.tsx', newContent);
console.log('Fixed hooks!');
