# OHMS ERP: Cloudflare Pages Live Verification & Edge Telemetry (2026)

**Project:** `onnesha-hospital`
**Production Host:** [https://onnesha-hospital.pages.dev](https://onnesha-hospital.pages.dev)
**Verification Date:** September 22, 2026
**Auditor Mode:** Cloudflare Pages & Edge Security Engineer
**Authoritative Git SHA:** `c1bf49af9ed1e996ad17a46356dd796afcd486ee`

---

## 1. Live Deployment Details

- **Deployment URL:** `https://bd31383a.onnesha-hospital.pages.dev`
- **Canonical Edge Alias:** `https://onnesha-hospital.pages.dev`
- **Static Asset Count:** 285 total assets / 43 prerendered routes
- **Deployment Status:** **PASS (Active Live Production)**

---

## 2. Real Browser Performance Verification (Empirically Measured)

Measured on actual live URL using browser `PerformanceObserver` (zero derivation/estimation):

| Metric | Target | Measured Live Value | Status |
|---|---|---|---|
| **TTFB (Time to First Byte)** | $\le 200$ ms | **37 ms** | **PASS** |
| **First Contentful Paint (FCP)** | $\le 1800$ ms | **60 ms** | **PASS** |
| **Largest Contentful Paint (LCP)** | $\le 2500$ ms | **60 ms** | **PASS** |
| **Cumulative Layout Shift (CLS)** | $< 0.10$ | **0.0016** | **PASS** |
| **DOM Content Loaded** | $\le 1000$ ms | **44 ms** | **PASS** |
| **Load Complete** | $\le 2000$ ms | **56 ms** | **PASS** |
| **DOM Elements** | $\le 1500$ | **407 elements** | **PASS** |
| **Total Requests** | $\le 50$ | **23 requests** | **PASS** |

---

## 3. Edge Routing, Custom Domains & DNS Status

- `onnesha-hospital.pages.dev`: **LIVE (PASS)**
- `onneshahospital.com`: **N/A (Unpurchased; Cleanly Decoupled)**
  - Unpurchased custom domain aliases removed from Cloudflare Pages project.
  - Zero pending domain errors on Cloudflare Pages project.
  - Can be attached when apex domain is acquired by owner.
