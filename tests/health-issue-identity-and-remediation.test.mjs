import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS Health Engine v2 — Issue Identity, Zero-False-Green Remediation & Observational Safety", async (t) => {
  // 1. Explicit Identity Contract & Non-UUID Guard in actions.ts
  await t.test("1. actions.ts strictly isolates DETECTOR vs INCIDENT and protects UUID RPCs", () => {
    const actionPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    assert.ok(fs.existsSync(actionPath), "lib/diagnostics/actions.ts must exist");
    const content = fs.readFileSync(actionPath, "utf8");

    assert.match(content, /export type DiagnosticIssueKind = "INCIDENT" \| "DETECTOR"/);
    assert.match(content, /export interface DiagnosticIssueIdentity/);
    assert.match(content, /export async function remediateSystemHealthIssueAction/);
    assert.match(content, /export async function verifyAndResolveSystemIssueAction/);

    // Verify UUID check prevents passing non-UUID detector codes to RPC
    assert.match(content, /isUuid\(incidentId\)/);
    assert.match(content, /INVALID_INCIDENT_IDENTITY/);
    assert.match(content, /reconcile_bed_vacancy_drift_atomic/);
    assert.match(content, /is_remediable/);
  });

  // 2. Safe Error Taxonomy & Deduplication in troubleshooter.ts
  await t.test("2. troubleshooter.ts enforces error taxonomy and eliminates fake auto-healed dispatch", () => {
    const tbPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");
    assert.ok(fs.existsSync(tbPath), "lib/diagnostics/troubleshooter.ts must exist");
    const tbContent = fs.readFileSync(tbPath, "utf8");

    assert.match(tbContent, /export function classifyRuntimeError/);
    assert.match(tbContent, /errorDeduplicationMap/);
    assert.match(tbContent, /DEDUP_WINDOW_MS/);

    // Verify fake auto-healed event is strictly removed
    assert.doesNotMatch(tbContent, /status:\s*"RESOLVED_AUTO_HEALED"/, "Must never emit unverified RESOLVED_AUTO_HEALED");
    assert.match(tbContent, /system-health-recovery-attempted/);
    assert.match(tbContent, /RECOVERY_ATTEMPTED/);

    // Verify taxonomy patterns
    assert.match(tbContent, /resizeobserver/i);
    assert.match(tbContent, /chrome-extension/i);
    assert.match(tbContent, /pgrst301/i);
    assert.match(tbContent, /financial_invariants/i);
  });

  // 3. Observational-First UI in SystemHealthAlertBanner.tsx
  await t.test("3. SystemHealthAlertBanner is strictly observational on mount and avoids optimistic hides", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const bannerContent = fs.readFileSync(bannerPath, "utf8");

    // Ensure fetchDiagnostics does not call reconcileBedVacancyAction on mount
    const fetchFuncMatch = bannerContent.match(/const fetchDiagnostics = useCallback\(\(\) => \{([\s\S]*?)\}, \[organizationId\]\);/);
    assert.ok(fetchFuncMatch, "fetchDiagnostics callback must exist");
    assert.doesNotMatch(fetchFuncMatch[1], /reconcileBedVacancyAction/, "fetchDiagnostics must be observational only");

    // Ensure remediation uses remediateSystemHealthIssueAction with issue object
    assert.match(bannerContent, /remediateSystemHealthIssueAction/);
    assert.match(bannerContent, /handleResolveSafeIssues/);
    assert.match(bannerContent, /resolvingId/);
    assert.match(bannerContent, /resolutionError/);
  });

  // 4. Migration 207 Authoritative Bed Drift & Row Locking Contract
  await t.test("4. Migration 207 provides partial unique index and atomic reconciler with row locking", () => {
    const mig207Path = path.join(
      ROOT,
      "supabase/migrations/20261016120000_migration_207_add_doctors_updated_at_and_sync_bed_occupancy.sql"
    );
    assert.ok(fs.existsSync(mig207Path), "Migration 207 must exist");
    const migContent = fs.readFileSync(mig207Path, "utf8");

    assert.match(migContent, /CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_assignments_one_active_per_bed/);
    assert.match(migContent, /CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_assignments_one_active_per_cabin/);
    assert.match(migContent, /reconcile_bed_vacancy_drift_atomic/);
    assert.match(migContent, /FOR UPDATE/);
    assert.match(migContent, /MANUAL_CLINICAL_REVIEW_REQUIRED/);
    assert.match(migContent, /MIGRATION_207_AUTHORITATIVE_POSITIVE_PROOF/);
  });
});
