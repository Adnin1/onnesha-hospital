# Onnesha Hospital Management System (OHMS v1.1.5)
## Final Security Evidence Matrix & Zero-Trust Audit (2026)

**Document ID:** `DOC-SEC-EVIDENCE-2026`  
**Evaluation Date:** September 22, 2026  
**Authoritative Git SHA:** `75188a8d2db316fdcbfa63e905a69c16064a4a3b`  

---

## 1. Security Invariant Verification Matrix

| Vulnerability Class | Attack Vector / Threat Model | Defense Mechanism | Automated Test File | Result |
| :--- | :--- | :--- | :--- | :---: |
| **SQL Injection** | SQL fragment injection in user inputs | Parameterized Supabase client queries & typed plpgsql RPC parameters | `tests/security.test.mjs` | **PASS** |
| **Cross-Tenant Escape** | Tenant B reading/writing Tenant A records | Multi-tenant RLS policies checking `private.get_current_org_id()` | `tests/phase35-case-safe-cash-and-deep-audit.test.mjs` | **PASS** |
| **Search Path Hijacking** | Malicious schema overriding standard functions in `SECURITY DEFINER` | `SET search_path = ''` and schema-qualified references across all privileged functions | `tests/phase56-true-3way-match-and-concurrency.test.mjs` | **PASS** |
| **Double GL Posting Race** | Concurrent requests posting identical invoice | Unique partial index `uq_journal_entries_org_ref` on `(organization_id, reference_type, reference_id)` | `tests/phase56-true-3way-match-and-concurrency.test.mjs` | **PASS** |
| **Cumulative Overpayment Race** | Parallel partial payments exceeding invoice balance | `SELECT ... FOR UPDATE` row locks and cumulative check `(cumulative_paid + new_amount) <= total` | `tests/phase56-true-3way-match-and-concurrency.test.mjs` | **PASS** |
| **3-Way Match Bypass** | Zero-line invoice or price/quantity swapped items | Strict line matching, mandatory PO mapping, cumulative consumption check | `tests/phase57-strict-cumulative-3way-match.test.mjs` | **PASS** |
| **Clickjacking** | Embedding portal in external `<iframe>` | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` | `tests/website-public-security-and-data-integrity.test.mjs` | **PASS** |
| **MIME Sniffing** | Browser interpreting non-executable types as code | `X-Content-Type-Options: nosniff` | `tests/website-public-security-and-data-integrity.test.mjs` | **PASS** |
| **Unsafe Script Execution** | Injection of arbitrary runtime scripts | CSP policy blocks `'unsafe-eval'`; scripts restricted to `'self'` and RSC flight payloads | Probed Live on Cloudflare Edge | **PASS** |
| **Sensitive Cache Leakage** | Caching PHI or authenticated dashboard responses | `Cache-Control: no-store, no-cache, must-revalidate` on `/app/*` routes | Probed Live on Cloudflare Edge | **PASS** |
| **Search Engine Indexing of Auth** | Crawlers indexing login and patient portals | `X-Robots-Tag: noindex, nofollow` on `/login` and `/app/*` | Probed Live on Cloudflare Edge | **PASS** |
| **Unauthenticated API Access** | Direct REST API queries by anonymous users | Supabase RLS rejects anonymous requests on protected clinical/ERP tables | `tests/website-public-security-and-data-integrity.test.mjs` | **PASS** |
| **Unauthenticated File Access** | Direct download of patient medical records | Storage buckets marked private; access requires server-generated signed URLs | `tests/security.test.mjs` | **PASS** |
