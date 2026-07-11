import { registerPlugin } from '@capacitor/core';

export interface PdfIntentPlugin {
  checkIntent(): Promise<{ url: string | null }>;
  addListener(
    eventName: 'onPdfReceived',
    listenerFunc: (info: { url: string }) => void
  ): any;
  addListener(
    eventName: 'onPdfError',
    listenerFunc: (info: { error: string }) => void
  ): any;
}

export const PdfIntent = registerPlugin<PdfIntentPlugin>('PdfIntent');
