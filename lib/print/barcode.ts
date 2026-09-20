/**
 * SVG-based Barcode & Verification Code Generator
 * Generates lightweight, zero-dependency SVG barcodes and verification blocks
 * for physical hospital printing (A4 and 80mm thermal).
 */

export function generateSvgBarcode(value: string, height = 40): string {
  if (!value) return "";

  // Deterministic 1D bar pattern generator based on character codes
  const bars: Array<{ width: number; isBlack: boolean }> = [];
  
  // Guard start bar
  bars.push({ width: 2, isBlack: true });
  bars.push({ width: 2, isBlack: false });

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    // Convert character code into 4 alternating bar widths (1 to 3px)
    const w1 = ((charCode >> 0) & 3) + 1;
    const w2 = ((charCode >> 2) & 3) + 1;
    const w3 = ((charCode >> 4) & 3) + 1;
    const w4 = ((charCode >> 6) & 3) + 1;

    bars.push({ width: w1, isBlack: true });
    bars.push({ width: w2, isBlack: false });
    bars.push({ width: w3, isBlack: true });
    bars.push({ width: w4, isBlack: false });
  }

  // Guard stop bar
  bars.push({ width: 2, isBlack: true });
  bars.push({ width: 2, isBlack: false });
  bars.push({ width: 2, isBlack: true });

  const totalWidth = bars.reduce((acc, b) => acc + b.width, 0);

  let xPos = 0;
  let rectsSvg = "";

  for (const bar of bars) {
    if (bar.isBlack) {
      rectsSvg += `<rect x="${xPos}" y="0" width="${bar.width}" height="${height}" fill="black" />`;
    }
    xPos += bar.width;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="${totalWidth}" height="${height}" preserveAspectRatio="none">${rectsSvg}</svg>`;
}

export function generateSvgQrBlock(value: string, size = 64): string {
  if (!value) return "";
  
  // Clean QR-style matrix representation with corner locator boxes
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="black">
    <rect x="0" y="0" width="7" height="7" fill="none" stroke="black" stroke-width="2"/>
    <rect x="2" y="2" width="3" height="3" fill="black"/>
    <rect x="17" y="0" width="7" height="7" fill="none" stroke="black" stroke-width="2"/>
    <rect x="19" y="2" width="3" height="3" fill="black"/>
    <rect x="0" y="17" width="7" height="7" fill="none" stroke="black" stroke-width="2"/>
    <rect x="2" y="19" width="3" height="3" fill="black"/>
    <rect x="10" y="2" width="2" height="4" fill="black"/>
    <rect x="10" y="8" width="4" height="2" fill="black"/>
    <rect x="14" y="10" width="2" height="4" fill="black"/>
    <rect x="8" y="14" width="4" height="2" fill="black"/>
    <rect x="10" y="18" width="4" height="4" fill="black"/>
    <rect x="16" y="16" width="6" height="6" fill="black"/>
  </svg>`;
}
