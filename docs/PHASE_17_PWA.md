# Phase 17 — PWA Implementation

## Manifest
- **File**: `public/manifest.json`
- **Name**: Onnesha Hospital & Diagnostic Complex
- **Short Name**: Onnesha HMS
- **Display**: standalone
- **Start URL**: `/app/dashboard`
- **Scope**: `/`
- **Icons**: 192px SVG, 512px SVG, 512px maskable SVG, favicon.ico
- **Theme**: #0284c7 (Sky-600), Background: #0f172a (Slate-900)

## Service Worker
- **File**: `public/sw.js`
- **Cache**: `ohms-static-v1` (versioned)
- **Install**: Pre-caches static shell (`/`, `/app/dashboard`, manifest, favicon)
- **Activate**: Cleans old caches, claims clients
- **Fetch**:
  - Static assets → cache-first
  - HTML pages → network-first with cache fallback
  - Sensitive data → network-only (NEVER cached)

## Registration
- **File**: `components/app/SwRegister.tsx`
- Registers on mount with isMounted cleanup
- Detects updates via `updatefound` event

## Install UX
- **File**: `components/app/InstallPrompt.tsx`
- Detects `beforeinstallprompt`
- Shows unobtrusive bottom banner
- Respects standalone mode (auto-hides if installed)
- Dismissible with in-memory preference

## Sensitive Data Never Cached
Patient records, prescriptions, diagnoses, invoices, payments, lab results, pharmacy data, HR/payroll, audit logs, notifications — all excluded from service worker cache by pattern matching.
