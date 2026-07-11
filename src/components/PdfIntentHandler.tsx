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

    let sub: any = null;
    let errSub: any = null;
    
    PdfIntent.addListener('onPdfReceived', (info) => {
      handlePdf(info.url);
    }).then((s: any) => {
      sub = s;
    });

    PdfIntent.addListener('onPdfError', (info) => {
      alert("PDF Error: " + info.error);
    }).then((s: any) => {
      errSub = s;
    });

    return () => {
      if (sub && sub.remove) sub.remove();
      if (errSub && errSub.remove) errSub.remove();
    };
  }, [router]);

  return null;
}
