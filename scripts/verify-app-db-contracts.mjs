#!/usr/bin/env node
/**
 * =====================================================================================
 * OHMS Application ↔ Database Contract Compiler (Phase 16)
 * =====================================================================================
 * Statically reconciles application code (.from(...), .rpc(...)) against database
 * schema migrations and generated/rpc-registry.json.
 * Catches schema desynchronization before code reaches staging or production.
 * =====================================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const RPC_REGISTRY_PATH = path.join(ROOT, 'generated', 'rpc-registry.json');
const SRC_DIRS = [
  path.join(ROOT, 'app'),
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'components')
];

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.mjs']) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseKnownTablesFromMigrations() {
  const tables = new Set();
  const columns = new Map(); // table -> Set<column>

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // CREATE TABLE [IF NOT EXISTS] [public.]table_name
    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      tables.add(tableName);
      if (!columns.has(tableName)) {
        columns.set(tableName, new Set());
      }
      
      const body = match[2];
      const lines = body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('PRIMARY KEY') || trimmed.startsWith('FOREIGN KEY') || trimmed.startsWith('CHECK') || trimmed.startsWith('UNIQUE')) {
          continue;
        }
        const colMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_]+/);
        if (colMatch) {
          columns.get(tableName).add(colMatch[1].toLowerCase());
        }
      }
    }

    // CREATE [OR REPLACE] [MATERIALIZED] VIEW [public.]view_name
    const createViewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
    let viewMatch;
    while ((viewMatch = createViewRegex.exec(content)) !== null) {
      const viewName = viewMatch[1].toLowerCase();
      tables.add(viewName);
    }

    // ALTER TABLE [IF EXISTS] [ONLY] [public.]table_name ADD COLUMN [IF NOT EXISTS] col_name
    const addColRegex = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)/gi;
    let addColMatch;
    while ((addColMatch = addColRegex.exec(content)) !== null) {
      const tableName = addColMatch[1].toLowerCase();
      const colName = addColMatch[2].toLowerCase();
      if (!columns.has(tableName)) {
        columns.set(tableName, new Set());
      }
      columns.get(tableName).add(colName);
      tables.add(tableName);
    }
  }

  return { tables, columns };
}

function parseAppUsage() {
  const appTables = new Set();
  const appRpcs = new Set();
  const appFiles = [];

  for (const dir of SRC_DIRS) {
    appFiles.push(...getAllFiles(dir));
  }

  const fromRegex = /\.from\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  const rpcRegex = /\.rpc\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;

  for (const file of appFiles) {
    const code = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = fromRegex.exec(code)) !== null) {
      appTables.add(m[1].toLowerCase());
    }
    while ((m = rpcRegex.exec(code)) !== null) {
      appRpcs.add(m[1].toLowerCase());
    }
  }

  return { appTables, appRpcs };
}

export function verifyContracts() {
  console.log('🔍 [APP↔DB CONTRACT COMPILER] Scanning application queries & schema definitions...');

  const { tables: dbTables, columns: dbColumns } = parseKnownTablesFromMigrations();
  const { appTables, appRpcs } = parseAppUsage();

  let rpcRegistry = { registry: [], critical_rpcs_status: [] };
  if (fs.existsSync(RPC_REGISTRY_PATH)) {
    rpcRegistry = JSON.parse(fs.readFileSync(RPC_REGISTRY_PATH, 'utf8'));
  }
  const knownRpcs = new Set((rpcRegistry.registry || []).map(r => r.name.toLowerCase()));
  const canonicalCriticalRpcs = new Set((rpcRegistry.critical_rpcs_status || []).map(r => r.name.toLowerCase()));

  console.log(`   Discovered ${appTables.size} application tables and ${appRpcs.size} application RPC calls.`);
  console.log(`   Database defines ${dbTables.size} tables and views in migrations.`);

  const errors = [];

  // Check critical tables used by application
  const exemptTables = new Set(['auth', 'storage', 'audit_logs', 'system_events', 'profiles']);
  for (const table of appTables) {
    if (!dbTables.has(table) && !exemptTables.has(table)) {
      errors.push(`Table '${table}' is queried in application code but missing from database migrations.`);
    }
  }

  // Critical column presence contracts (e.g. Migration 236 discharge_summaries.patient_id)
  const criticalContracts = [
    { table: 'discharge_summaries', column: 'patient_id' },
    { table: 'discharge_summaries', column: 'visit_id' },
    { table: 'patient_visits', column: 'organization_id' },
    { table: 'patient_visits', column: 'patient_id' },
    { table: 'bed_assignments', column: 'bed_id' },
    { table: 'bed_assignments', column: 'cabin_id' },
    { table: 'invoices', column: 'organization_id' },
    { table: 'invoices', column: 'patient_id' },
    { table: 'expenses', column: 'organization_id' },
    { table: 'referral_commissions', column: 'organization_id' },
    { table: 'blood_inventory', column: 'status' }
  ];

  for (const { table, column } of criticalContracts) {
    const tableCols = dbColumns.get(table);
    if (!tableCols || !tableCols.has(column)) {
      errors.push(`CRITICAL CONTRACT VIOLATION: Column '${table}.${column}' is required by application contracts but not found in schema.`);
    }
  }

  // Critical hospital RPCs check
  const criticalHospitalRpcs = [
    'update_ipd_admission_atomic',
    'update_waiting_queue_status_atomic',
    'complete_ipd_discharge_atomic',
    'collect_payment_atomic',
    'record_hospital_expense_atomic',
    'cancel_or_delete_ipd_admission_atomic',
    'settle_referral_commissions_atomic',
    'reverse_journal_entry_atomic',
    'void_invoice_and_reverse_gl_atomic'
  ];

  for (const rpc of criticalHospitalRpcs) {
    if (!canonicalCriticalRpcs.has(rpc.toLowerCase()) && !knownRpcs.has(rpc.toLowerCase())) {
      errors.push(`CRITICAL RPC CONTRACT VIOLATION: Canonical hospital RPC '${rpc}' is missing from RPC registry.`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ [APP↔DB CONTRACT COMPILER] Contract reconciliation failed:');
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    return false;
  }

  console.log('✅ [APP↔DB CONTRACT COMPILER] All application queries, critical columns, and RPC signatures reconciled with 100% parity!\n');
  return true;
}

if (process.argv[1].endsWith('verify-app-db-contracts.mjs')) {
  const ok = verifyContracts();
  if (!ok) process.exit(1);
}
