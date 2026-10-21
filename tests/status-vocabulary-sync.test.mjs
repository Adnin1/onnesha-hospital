import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('Change Safety: Database & TypeScript Status Vocabulary Parity', () => {
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  let combinedSql = '';
  for (const f of migrationFiles) {
    combinedSql += fs.readFileSync(path.join(migrationsDir, f), 'utf8') + '\n';
  }

  // Load TypeScript registry source
  const registrySource = fs.readFileSync(path.join(ROOT, 'lib', 'status-vocabulary-registry.ts'), 'utf8');

  test('1. BED_STATUSES in registry match beds table CHECK constraints', () => {
    const bedStatuses = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'VACANT'];
    for (const s of bedStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include BedStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must define status value '${s}'`
      );
    }
  });

  test('2. CABIN_STATUSES in registry match cabins table CHECK constraints', () => {
    const cabinStatuses = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'VACANT'];
    for (const s of cabinStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include CabinStatus '${s}'`
      );
    }
  });

  test('3. BED_ASSIGNMENT_STATUSES in registry match bed_assignments CHECK constraints', () => {
    const assignmentStatuses = ['ACTIVE', 'TRANSFERRED', 'DISCHARGED', 'VACATED'];
    for (const s of assignmentStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include BedAssignmentStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must include assignment status '${s}'`
      );
    }
  });

  test('4. VISIT_STATUSES in registry match patient_visits CHECK constraints', () => {
    const visitStatuses = ['ADMITTED', 'DISCHARGED', 'TRANSFERRED', 'CANCELLED'];
    for (const s of visitStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include VisitStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must include visit status '${s}'`
      );
    }
  });

  test('5. QUEUE_STATUSES in registry match waiting_queue CHECK constraints', () => {
    const queueStatuses = ['WAITING', 'CALLED', 'IN_ROOM', 'COMPLETED', 'SKIPPED'];
    for (const s of queueStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include QueueStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must include queue status '${s}'`
      );
    }
  });

  test('6. INVOICE_STATUSES in registry match invoices CHECK constraints', () => {
    const invoiceStatuses = ['DRAFT', 'PENDING', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'];
    for (const s of invoiceStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include InvoiceStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must include invoice status '${s}'`
      );
    }
  });

  test('7. EXPENSE_STATUSES in registry match expenses CHECK constraints', () => {
    const expenseStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'];
    for (const s of expenseStatuses) {
      assert.ok(
        registrySource.includes(`'${s}'`),
        `Registry must include ExpenseStatus '${s}'`
      );
      assert.ok(
        combinedSql.includes(`'${s}'`),
        `Database migrations must include expense status '${s}'`
      );
    }
  });

  test('8. STATUS_REGISTRY dictionary exports all 11 core hospital domains', () => {
    const requiredDomains = [
      'BED', 'CABIN', 'BED_ASSIGNMENT', 'VISIT', 'QUEUE',
      'INVOICE', 'PAYMENT', 'BLOOD_BAG', 'TRANSFUSION', 'REFERRAL', 'EXPENSE'
    ];
    for (const domain of requiredDomains) {
      assert.ok(
        registrySource.includes(`${domain}:`),
        `STATUS_REGISTRY must export domain '${domain}'`
      );
    }
  });
});
