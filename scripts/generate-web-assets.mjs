import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const iconsDir = path.join(publicDir, "icons");

async function generateAssets() {
  console.log("Generating missing web assets (logo.png, favicon.ico, PNG icons)...");

  const svg512 = fs.readFileSync(path.join(iconsDir, "icon-512.svg"));

  // 1. Generate public/logo.png (512x512 PNG)
  const logoPath = path.join(publicDir, "logo.png");
  await sharp(svg512)
    .resize(512, 512)
    .png()
    .toFile(logoPath);
  console.log("✓ Generated public/logo.png");

  // 2. Generate PNG icons
  await sharp(svg512)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "icon-192.png"));
  console.log("✓ Generated public/icons/icon-192.png");

  await sharp(svg512)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-512.png"));
  console.log("✓ Generated public/icons/icon-512.png");

  // 3. Generate multi-resolution favicon.ico containing 16x16, 32x32, 48x48 PNGs
  const sizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(svg512)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buf });
  }

  // Build ICO container
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + numImages * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  const dirEntries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(item.size, 0); // Width
    entry.writeUInt8(item.size, 1); // Height
    entry.writeUInt8(0, 2); // Palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buf.length, 8); // Image size
    entry.writeUInt32LE(offset, 12); // Image data offset
    dirEntries.push(entry);
    offset += item.buf.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map((p) => p.buf),
  ]);

  const faviconPath = path.join(publicDir, "favicon.ico");
  fs.writeFileSync(faviconPath, icoBuffer);
  console.log("✓ Generated public/favicon.ico (Multi-resolution: 16x16, 32x32, 48x48)");
}

generateAssets().catch((err) => {
  console.error("Failed to generate assets:", err);
  process.exit(1);
});
