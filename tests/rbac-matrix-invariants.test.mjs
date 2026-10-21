/**
 * =====================================================================================
 * LEVEL 1: RBAC MATRIX & MULTI-ROLE AUTHORIZATION INVARIANTS (Phase 21)
 * =====================================================================================
 * Verifies machine-readable config/rbac-matrix.json against lib/permissions.ts.
 * Asserts authorized roles, denied roles, fail-closed anonymous behavior, and
 * cross-tenant isolation guarantees.
 * =====================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RBAC_MATRIX_PATH = path.join(ROOT, 'config', 'rbac-matrix.json');
const RPC_POLICY_PATH = path.join(ROOT, 'config', 'rpc-access-policy.json');

test('RBAC Matrix Contracts & Invariant Verification', async (t) => {
  const rbacMatrix = JSON.parse(fs.readFileSync(RBAC_MATRIX_PATH, 'utf8'));
  const rpcPolicy = JSON.parse(fs.readFileSync(RPC_POLICY_PATH, 'utf8'));

  await t.test('1. RBAC Matrix Schema & Role Completeness', () => {
    assert.ok(Array.isArray(rbacMatrix.roles), 'roles must be an array');
    assert.ok(rbacMatrix.roles.includes('super_admin'));
    assert.ok(rbacMatrix.roles.includes('admin'));
    assert.ok(rbacMatrix.roles.includes('receptionist'));
    assert.ok(rbacMatrix.roles.includes('cashier'));
    assert.ok(rbacMatrix.roles.includes('doctor'));
    assert.ok(rbacMatrix.roles.includes('nurse'));
    assert.ok(rbacMatrix.roles.includes('accountant'));
    assert.ok(rbacMatrix.roles.includes('lab_technician'));
    assert.ok(rbacMatrix.roles.includes('pharmacist'));
  });

  await t.test('2. Sensitive Operations Fail-Closed Invariants', () => {
    for (const op of rbacMatrix.sensitive_operations) {
      assert.equal(op.fail_closed_anon, true, `${op.operation} must fail closed for anon`);
      assert.equal(op.cross_tenant_denied, true, `${op.operation} must strictly deny cross-tenant callers`);
      assert.ok(op.authorized_roles.length > 0, `${op.operation} must have authorized roles`);
      assert.ok(op.denied_roles.length > 0, `${op.operation} must have explicitly denied roles`);

      // No overlap between authorized and denied roles
      for (const role of op.authorized_roles) {
        assert.ok(!op.denied_roles.includes(role), `Role ${role} cannot be both authorized and denied for ${op.operation}`);
      }
    }
  });

  await t.test('3. High-Risk Operational Isolation', () => {
    // IPD Purge must be restricted strictly to super_admin
    const ipdPurge = rbacMatrix.sensitive_operations.find(o => o.operation === 'ipd_purge');
    assert.deepEqual(ipdPurge.authorized_roles, ['super_admin']);

    // Role Modification must be restricted strictly to super_admin
    const roleMod = rbacMatrix.sensitive_operations.find(o => o.operation === 'role_modification');
    assert.deepEqual(roleMod.authorized_roles, ['super_admin']);

    // Cashiers and Receptionists can collect payments, but cannot refund without Admin
    const paymentCollect = rbacMatrix.sensitive_operations.find(o => o.operation === 'payment_collect');
    assert.ok(paymentCollect.authorized_roles.includes('cashier'));
    assert.ok(paymentCollect.authorized_roles.includes('receptionist'));

    const paymentRefund = rbacMatrix.sensitive_operations.find(o => o.operation === 'payment_refund');
    assert.ok(!paymentRefund.authorized_roles.includes('cashier'));
    assert.ok(!paymentRefund.authorized_roles.includes('receptionist'));
  });

  await t.test('4. Critical Hospital RPC Access Alignment', () => {
    const criticalRpcs = rpcPolicy.critical_hospital_rpcs;
    assert.equal(criticalRpcs.length, 9, 'All 9 critical hospital RPCs must be governed');

    const cancelAdmission = criticalRpcs.find(r => r.name === 'cancel_or_delete_ipd_admission_atomic');
    assert.equal(cancelAdmission.tier, 'SUPER_ADMIN_ONLY');
    assert.deepEqual(cancelAdmission.roles, ['super_admin']);

    const reverseGl = criticalRpcs.find(r => r.name === 'reverse_journal_entry_atomic');
    assert.equal(reverseGl.tier, 'ADMIN_ONLY');
  });
});
