#!/usr/bin/env node

/**
 * Onnesha Hospital — Forensic Link and Asset Integrity Scanner
 * Scans static export directory (default: out/) for broken internal links,
 * missing images, dead script/stylesheet references, manifest icons, and sitemap parity.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outDir = path.resolve(rootDir, "out");

function log(msg) {
  console.log(`[FORENSIC-ASSETS] ${msg}`);
}

function logError(msg) {
  console.error(`[FORENSIC-ASSETS-ERROR] ${msg}`);
}

if (!fs.existsSync(outDir)) {
  logError(`Static build directory not found: ${outDir}. Please run 'npm run build' first.`);
  process.exit(1);
}

// 1. Collect all files in out/
function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allOutFiles = getAllFiles(outDir);
const htmlFiles = allOutFiles.filter((f) => f.endsWith(".html"));

log(`Discovered ${allOutFiles.length} total files in out/ (${htmlFiles.length} HTML pages)`);

let brokenCount = 0;
let validLinkCount = 0;
let validAssetCount = 0;
let skippedExternalCount = 0;
const errors = [];

function checkTargetExists(targetPath, sourceFile) {
  // Strip fragment and query params
  const clean = targetPath.split("#")[0].split("?")[0].trim();
  if (!clean) return true; // anchor-only link

  // Handle external / special schemes
  if (
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("mailto:") ||
    clean.startsWith("tel:") ||
    clean.startsWith("javascript:") ||
    clean.startsWith("data:")
  ) {
    skippedExternalCount++;
    return true;
  }

  let resolvedPath;
  if (clean.startsWith("/")) {
    // Relative to outDir
    resolvedPath = path.join(outDir, clean);
  } else {
    // Relative to source file's directory
    resolvedPath = path.resolve(path.dirname(sourceFile), clean);
  }

  // 1. Direct file match
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return true;
  }

  // 2. HTML extension resolution (e.g. /doctors -> /doctors.html)
  if (fs.existsSync(`${resolvedPath}.html`) && fs.statSync(`${resolvedPath}.html`).isFile()) {
    return true;
  }

  // 3. Index file in directory (e.g. /doctors -> /doctors/index.html)
  const indexPath = path.join(resolvedPath, "index.html");
  if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
    return true;
  }

  // 4. Git-ignored desktop release installer fallback (validated against authoritative latest.json)
  if (clean.startsWith("/downloads/desktop/") && (clean.endsWith(".exe") || clean.endsWith(".msi"))) {
    const latestJsonPath = path.join(rootDir, "public", "downloads", "desktop", "latest.json");
    if (fs.existsSync(latestJsonPath)) {
      try {
        const latest = JSON.parse(fs.readFileSync(latestJsonPath, "utf-8"));
        const platforms = latest.platforms || {};
        const win = platforms["windows-x86_64"] || {};
        const targetFilename = path.basename(clean);
        const matchesExe = win.installer_exe && win.installer_exe.endsWith(targetFilename);
        const matchesMsi = win.installer_msi && win.installer_msi.endsWith(targetFilename);
        if (matchesExe || matchesMsi) {
          return true;
        }
      } catch {
        // fallback to standard check
      }
    }
  }

  return false;
}

// 2. Scan HTML files
const LINK_HREF_REGEX = /<a\s+[^>]*?href=["']([^"']+)["']/gi;
const IMG_SRC_REGEX = /<img\s+[^>]*?src=["']([^"']+)["']/gi;
const LINK_TAG_REGEX = /<link\s+[^>]*?href=["']([^"']+)["']/gi;
const SCRIPT_SRC_REGEX = /<script\s+[^>]*?src=["']([^"']+)["']/gi;

for (const htmlFile of htmlFiles) {
  const relHtml = path.relative(outDir, htmlFile);
  const content = fs.readFileSync(htmlFile, "utf-8");

  // A tags
  let match;
  while ((match = LINK_HREF_REGEX.exec(content)) !== null) {
    const href = match[1];
    if (!checkTargetExists(href, htmlFile)) {
      brokenCount++;
      errors.push({ source: relHtml, type: "BROKEN_LINK", target: href });
    } else {
      validLinkCount++;
    }
  }

  // IMG tags
  while ((match = IMG_SRC_REGEX.exec(content)) !== null) {
    const src = match[1];
    if (!checkTargetExists(src, htmlFile)) {
      brokenCount++;
      errors.push({ source: relHtml, type: "BROKEN_IMG", target: src });
    } else {
      validAssetCount++;
    }
  }

  // LINK tags (stylesheets, icons, canonical)
  while ((match = LINK_TAG_REGEX.exec(content)) !== null) {
    const href = match[1];
    if (!checkTargetExists(href, htmlFile)) {
      brokenCount++;
      errors.push({ source: relHtml, type: "BROKEN_LINK_TAG", target: href });
    } else {
      validAssetCount++;
    }
  }

  // SCRIPT tags
  while ((match = SCRIPT_SRC_REGEX.exec(content)) !== null) {
    const src = match[1];
    if (!checkTargetExists(src, htmlFile)) {
      brokenCount++;
      errors.push({ source: relHtml, type: "BROKEN_SCRIPT", target: src });
    } else {
      validAssetCount++;
    }
  }
}

// 3. Scan Web Manifest
const manifestPath = path.join(outDir, "manifest.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (Array.isArray(manifest.icons)) {
      for (const icon of manifest.icons) {
        if (!checkTargetExists(icon.src, manifestPath)) {
          brokenCount++;
          errors.push({ source: "manifest.json", type: "BROKEN_MANIFEST_ICON", target: icon.src });
        } else {
          validAssetCount++;
        }
      }
    }
  } catch (err) {
    brokenCount++;
    errors.push({ source: "manifest.json", type: "INVALID_JSON", target: String(err) });
  }
} else {
  log("manifest.json not present in outDir, skipping manifest scan.");
}

// 4. Scan Sitemap
const sitemapPath = path.join(outDir, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
  const LOC_REGEX = /<loc>([^<]+)<\/loc>/g;
  let locMatch;
  while ((locMatch = LOC_REGEX.exec(sitemapContent)) !== null) {
    const fullUrl = locMatch[1].trim();
    try {
      const parsedUrl = new URL(fullUrl);
      const pathname = parsedUrl.pathname;
      if (!checkTargetExists(pathname, sitemapPath)) {
        brokenCount++;
        errors.push({ source: "sitemap.xml", type: "BROKEN_SITEMAP_ENTRY", target: pathname });
      } else {
        validLinkCount++;
      }
    } catch {
      // If not a full URL, check directly
      if (!checkTargetExists(fullUrl, sitemapPath)) {
        brokenCount++;
        errors.push({ source: "sitemap.xml", type: "BROKEN_SITEMAP_ENTRY", target: fullUrl });
      } else {
        validLinkCount++;
      }
    }
  }
}

// Output Summary
console.log("\n=======================================================");
console.log("     ONNESHA HOSPITAL STATIC LINK & ASSET FORENSICS     ");
console.log("=======================================================");
console.log(`Scanned HTML Pages:        ${htmlFiles.length}`);
console.log(`Validated Internal Links:  ${validLinkCount}`);
console.log(`Validated Assets/Scripts:  ${validAssetCount}`);
console.log(`Skipped External Links:    ${skippedExternalCount}`);
console.log(`Broken References:         ${brokenCount}`);
console.log("-------------------------------------------------------");

if (errors.length > 0) {
  console.log("\nDETAILED FORENSIC DEFECTS:");
  for (const err of errors) {
    console.error(`❌ [${err.type}] in ${err.source} -> Target: ${err.target}`);
  }
  console.log("=======================================================\n");
  process.exit(1);
} else {
  console.log("✅ ZERO BROKEN REFERENCES DETECTED. ALL INTERNAL LINKS AND ASSETS INTEGRAL.\n");
  process.exit(0);
}
