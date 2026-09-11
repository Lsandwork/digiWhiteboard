export function estimatedPrintDpi(naturalPixels: number, physicalInches: number) {
  if (physicalInches <= 0) return 0;
  return naturalPixels / physicalInches;
}

export function photoQualityWarning(naturalWidth: number, frameWidthPx: number, canvasDpi: number) {
  if (naturalWidth <= 0 || frameWidthPx <= 0) return null;
  const frameInches = frameWidthPx / canvasDpi;
  const dpi = estimatedPrintDpi(naturalWidth, frameInches);
  if (dpi < 150) {
    return `Photo prints at approximately ${Math.round(dpi)} DPI in this frame (below 150 DPI).`;
  }
  if (dpi < 250) {
    return `Photo prints at approximately ${Math.round(dpi)} DPI. 300 DPI is recommended.`;
  }
  return null;
}

export function wouldUpscale(naturalWidth: number, outputWidthPx: number) {
  return naturalWidth < outputWidthPx;
}
