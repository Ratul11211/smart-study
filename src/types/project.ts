import type { Stroke } from '@/components/DrawingOverlay';

export interface PageData { 
  id: string; 
  pageNum: number; 
  imageUrl: string;   // fs:// path (filesystem) or base64 dataURL (in-memory)
  status: string;     // 'pending' | 'read'
  category?: string;
  drawings?: Stroke[];
}

export interface ReadingData { 
  id: string; 
  title: string; 
  startPage: number; 
  leftOffPage?: number; 
  deletedAt?: string;
}

export interface ProjectData { 
  id: string;
  name: string;           // Real book name
  category: string;       // Legacy field (keep for compatibility)
  
  // New metadata fields
  bookClass: string;      // e.g. 'SSC', 'HSC', 'Class 6', 'University'
  bookType: string;       // e.g. 'NCTB', 'Guide', 'Notes', 'Reference'
  version: string;        // e.g. 'বাংলা মিডিয়াম', 'English Medium', 'English Version'
  subject: string;        // e.g. 'পদার্থ', 'রসায়ন', 'Math', 'English'
  coverImageUrl?: string; // First page image (fs:// path or dataURL)

  // Drive backup info
  driveFileId?: string;   // Google Drive file ID for updating existing backup
  isShared?: boolean;     // Whether this book has been shared publicly
  
  srsIntervals: number[];
  maxUnlockedPage: number;
  readings: ReadingData[];
  srsTasks?: any[];
  createdAt?: string;
  deletedAt?: string;
}
