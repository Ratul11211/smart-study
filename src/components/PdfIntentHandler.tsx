'use client';
import { useEffect } from 'react';
import { PdfIntent } from '@/lib/pdfIntent';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

export function PdfIntentHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handlePdf = (url: string) => {
       if (url) {
           router.push(`/pdf-reader?file=${encodeURIComponent(url)}`);
       }
    };

    // Check if the app was launched with a PDF intent
    PdfIntent.checkIntent().then((res) => {
      if (res.url) handlePdf(res.url);
    });

    // Listen for intents while the app is already open
    let sub: any = null;
    PdfIntent.addListener('onPdfReceived', (info) => {
      handlePdf(info.url);
    }).then((s: any) => {
      sub = s;
    });

    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, [router]);

  return null;
}
