import { Stroke } from '@/components/DrawingOverlay';

export interface PageData { 
  id: string; 
  pageNum: number; 
  imageUrl: string; 
  status: string; 
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
  id?: string; 
  name: string; 
  category: string; 
  srsIntervals: number[]; 
  maxUnlockedPage: number; 
  readings: ReadingData[]; 
  srsTasks?: any[]; 
  deletedAt?: string;
}
