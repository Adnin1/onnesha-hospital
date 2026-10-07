import fs from 'fs';
import path from 'path';

const publicFiles = [
  'index.html', 'about.html', 'services.html', 'doctors.html',
  'appointment.html', 'check-token.html', 'contact.html',
  'downloads/desktop.html', 'privacy.html', 'terms.html', 'consent.html'
];

let failed = 0;
for (const file of publicFiles) {
  const fullPath = path.join('out', file);
  if (!fs.existsSync(fullPath)) {
    console.error('MISSING:', file);
    failed++;
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const hasH1 = /<h1[^>]*>/i.test(content);
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(content);
  const hasTitle = /<title[^>]*>/i.test(content);
  const hasDesc = /<meta[^>]+name=["']description["']/i.test(content);
  const hasSecret = /service_role|supabase_secret|jwt_secret/i.test(content);
  const canonicalMatch = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : 'NONE';
  
  console.log(`${file.padEnd(24)} Size: ${content.length.toString().padStart(6)} | H1: ${hasH1} | Title: ${hasTitle} | Desc: ${hasDesc} | Canonical: ${canonicalUrl} | Secrets: ${hasSecret ? 'LEAK!' : 'CLEAN'}`);
  if (!hasTitle || !hasCanonical || hasSecret) failed++;
}

if (failed === 0) {
  console.log('\n✅ ALL PUBLIC HTML FILES PASS FORENSIC CONTENT & SEO AUDIT!');
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} public HTML files failed audit.`);
  process.exit(1);
}
