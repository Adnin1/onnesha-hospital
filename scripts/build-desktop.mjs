#!/usr/bin/env node
/**
 * Desktop Build & Packaging Automation Script
 * Compiles authentic Windows MSI (WiX 3.11) and NSIS (3.10) installers for Tauri v2.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const WIX_DIR = "C:\\Users\\mahin khan\\wix311";
const NSIS_DIR = "C:\\Users\\mahin khan\\nsis310\\nsis-3.10";

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;

console.log(`\n========================================`);
console.log(`  OHMS DESKTOP COMPILATION (v${version})`);
console.log(`========================================\n`);

const env = { ...process.env };
env.PATH = `${WIX_DIR};${NSIS_DIR};${env.PATH || ""}`;
env.WIX = WIX_DIR;

console.log(`[1/4] Ensuring build environment...`);
console.log(`  • WiX Directory:  ${WIX_DIR}`);
console.log(`  • NSIS Directory: ${NSIS_DIR}`);
console.log(`  • Version:        ${version}`);

console.log(`\n[2/4] Running Tauri build (npx tauri build)...`);
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npx.cmd" : "npx";

const buildProcess = spawn(npmCmd, ["tauri", "build"], {
  cwd: ROOT,
  env,
  shell: true,
  stdio: "inherit",
});

buildProcess.on("close", (code) => {
  if (code !== 0) {
    console.error(`\n❌ Tauri build failed with exit code ${code}`);
    process.exit(code || 1);
  }

  console.log(`\n[3/4] Locating generated installer binaries...`);
  const msiBundleDir = path.join(ROOT, "src-tauri/target/release/bundle/msi");
  const nsisBundleDir = path.join(ROOT, "src-tauri/target/release/bundle/nsis");
  const destDir = path.join(ROOT, "public/downloads/desktop");

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Find MSI matching current version (or newest by mtime)
  let sourceMsi = "";
  const versionedMsi = fs.readdirSync(msiBundleDir).filter((f) => f.endsWith(".msi") && f.includes(version));
  if (versionedMsi.length > 0) {
    sourceMsi = path.join(msiBundleDir, versionedMsi[0]);
  } else {
    const allMsi = fs.readdirSync(msiBundleDir)
      .filter((f) => f.endsWith(".msi"))
      .sort((a, b) => fs.statSync(path.join(msiBundleDir, b)).mtimeMs - fs.statSync(path.join(msiBundleDir, a)).mtimeMs);
    if (allMsi.length === 0) {
      console.error("❌ No MSI file found in bundle/msi directory");
      process.exit(1);
    }
    sourceMsi = path.join(msiBundleDir, allMsi[0]);
  }
  const destMsi = path.join(destDir, `Onnesha-Hospital-${version}.msi`);
  fs.copyFileSync(sourceMsi, destMsi);

  // Find NSIS matching current version (or newest by mtime)
  let sourceExe = "";
  const versionedExe = fs.readdirSync(nsisBundleDir).filter((f) => f.endsWith(".exe") && f.includes(version));
  if (versionedExe.length > 0) {
    sourceExe = path.join(nsisBundleDir, versionedExe[0]);
  } else {
    const allExe = fs.readdirSync(nsisBundleDir)
      .filter((f) => f.endsWith(".exe"))
      .sort((a, b) => fs.statSync(path.join(nsisBundleDir, b)).mtimeMs - fs.statSync(path.join(nsisBundleDir, a)).mtimeMs);
    if (allExe.length === 0) {
      console.error("❌ No NSIS setup EXE found in bundle/nsis directory");
      process.exit(1);
    }
    sourceExe = path.join(nsisBundleDir, allExe[0]);
  }
  const destExe = path.join(destDir, `Onnesha-Hospital-Setup-${version}.exe`);
  fs.copyFileSync(sourceExe, destExe);

  console.log(`\n[4/4] Verifying binary artifacts & computing SHA-256...`);

  function hashFile(filePath) {
    const data = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
    const stats = fs.statSync(filePath);
    return { size: stats.size, hash };
  }

  const msiInfo = hashFile(destMsi);
  const exeInfo = hashFile(destExe);

  console.log(`\n✅ Generated Artifacts for v${version}:`);
  console.log(`  MSI: ${path.basename(destMsi)}`);
  console.log(`    - Size:   ${msiInfo.size.toLocaleString()} bytes`);
  console.log(`    - SHA256: ${msiInfo.hash}`);
  console.log(`  EXE: ${path.basename(destExe)}`);
  console.log(`    - Size:   ${exeInfo.size.toLocaleString()} bytes`);
  console.log(`    - SHA256: ${exeInfo.hash}`);

  // Auto-update latest.json
  const manifestPath = path.join(destDir, "latest.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      // ignore invalid json and reinitialize
    }
  }
  manifest.version = version;
  manifest.pub_date = new Date().toISOString();
  manifest.platforms = manifest.platforms || {};
  manifest.platforms["windows-x86_64"] = {
    installer_exe: `https://onnesha-hospital.pages.dev/downloads/desktop/${path.basename(destExe)}`,
    installer_exe_sha256: exeInfo.hash,
    installer_exe_size: exeInfo.size,
    installer_msi: `https://onnesha-hospital.pages.dev/downloads/desktop/${path.basename(destMsi)}`,
    installer_msi_sha256: msiInfo.hash,
    installer_msi_size: msiInfo.size,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`  Updated ${manifestPath} successfully.`);

  console.log(`\n🎉 Desktop compilation and packaging succeeded!\n`);
});
