export async function processImageToHighQualityWebP(
  canvas: HTMLCanvasElement,
  targetWidth: number = 2400
): Promise<string> {
  // If the original canvas is smaller, we keep its aspect ratio
  // If it's larger, we scale it down to targetWidth
  let width = canvas.width;
  let height = canvas.height;
  
  if (width > targetWidth) {
    height = Math.round(height * (targetWidth / width));
    width = targetWidth;
  }
  
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const ctx = offscreenCanvas.getContext('2d');
  
  if (ctx) {
    // Apply CamScanner-like B&W polish filter
    // grayscale(100%) makes it B&W
    // contrast(180%) increases contrast (makes text darker, shadows lighter)
    // brightness(120%) pushes light grays (paper background) to pure white
    ctx.filter = 'grayscale(100%) contrast(180%) brightness(120%)';
    ctx.drawImage(canvas, 0, 0, width, height);
  }
  
  // Use a fixed high quality for WebP. 
  // 0.85 provides excellent quality while keeping file sizes reasonable (usually < 300KB)
  const dataUrl = offscreenCanvas.toDataURL('image/webp', 0.85);
  
  // Cleanup
  offscreenCanvas.width = 0;
  offscreenCanvas.height = 0;
  
  return dataUrl;
}
