#!/usr/bin/env node
/**
 * OHMS RPC Registry Generator & CI Gate
 * Analyzes authoritative migration SQL definitions in chronological order.
 * Generates generated/rpc-registry.json.
 * Enforces zero ambiguous overloads on critical hospital RPCs.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const KNOWN_TYPES = [
  'uuid', 'text', 'varchar', 'character', 'boolean', 'bool',
  'int', 'bigint', 'numeric', 'decimal', 'json', 'jsonb',
  'date', 'time', 'timestamp', 'timestamptz', 'void', 'record'
];

function normalizeParam(raw) {
  let cleaned = raw.trim();
  const defIdx = cleaned.search(/\s+DEFAULT\s+/i);
  if (defIdx !== -1) cleaned = cleaned.substring(0, defIdx).trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  let typePart = '';
  if (tokens.length === 1) {
    typePart = tokens[0];
  } else {
    const firstLower = tokens[0].toLowerCase();
    if (tokens[0].startsWith('p_') || tokens[0].startsWith('v_') || !KNOWN_TYPES.includes(firstLower)) {
      typePart = tokens.slice(1).join(' ');
    } else {
      typePart = tokens.join(' ');
    }
  }
  return typePart.toLowerCase()
    .replace(/character\s+varying/g, 'varchar')
    .replace(/integer/g, 'int')
    .replace(/timestamp\s+with\s+time\s+zone/g, 'timestamptz')
    .replace(/timestamp\s+without\s+time\s+zone/g, 'timestamp')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSignature(argsStr) {
  if (!argsStr || !argsStr.trim()) return '';
  return argsStr.split(',').map(normalizeParam).join(', ');
}

async function generateRpcRegistry() {
  console.log('📋 [RPC REGISTRY] Generating RPC registry from chronological migration analysis...\n');

  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  const functions = new Map();
  const grants = new Map();
  const revokes = new Map();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Chronological statement execution
    const stmtRegex = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\s+AS\s+[\$']|DROP\s+FUNCTION\s+IF\s+EXISTS\s+(?:public\.)?(\w+)\s*\(([^)]*)\))/gi;
    let m;
    while ((m = stmtRegex.exec(sql)) !== null) {
      if (m[1]) {
        // CREATE FUNCTION
        const name = m[1];
        const args = m[2].trim();
        const sig = normalizeSignature(args);
        const key = `${name}(${sig})`;
        const secMatch = m[3].match(/SECURITY\s+(DEFINER|INVOKER)/i);
        const security = secMatch ? `SECURITY_${secMatch[1].toUpperCase()}` : 'SECURITY_INVOKER';
        functions.set(key, { name, arguments: args, sig, security });
      } else if (m[4]) {
        // DROP FUNCTION
        const name = m[4];
        const args = m[5].trim();
        const sig = normalizeSignature(args);
        const key = `${name}(${sig})`;
        functions.delete(key);
      }
    }

    // Process GRANTs in this migration
    const grantRegex = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)(?:\([^)]*\))?\s+TO\s+([^;]+)/gi;
    while ((m = grantRegex.exec(sql)) !== null) {
      const name = m[1];
      const roles = m[2].split(',').map(r => r.trim().toLowerCase());
      grants.set(name, roles);
    }

    // Process REVOKEs in this migration
    const revokeRegex = /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)(?:\([^)]*\))?\s+FROM\s+([^;]+)/gi;
    while ((m = revokeRegex.exec(sql)) !== null) {
      const name = m[1];
      const roles = m[2].split(',').map(r => r.trim().toLowerCase());
      revokes.set(name, roles);
    }
  }

  // Critical RPCs that must have exactly ONE canonical signature
  const criticalRpcs = [
    'update_ipd_admission_atomic',
    'update_waiting_queue_status_atomic',
    'complete_ipd_discharge_atomic',
    'collect_payment_atomic',
    'record_hospital_expense_atomic',
    'cancel_or_delete_ipd_admission_atomic',
    'settle_referral_commissions_atomic',
    'reverse_journal_entry_atomic',
    'void_invoice_and_reverse_gl_atomic',
  ];

  const registry = [];
  const securityFindings = [];

  // Certified public RPCs permitted to be invoked anonymously
  const certifiedPublic = [
    'public_health_probe',
    'get_public_doctor_directory',
    'get_public_online_booking_metadata',
    'get_public_doctor_available_slots',
    'get_public_verified_doctors',
    'create_public_online_appointment_booking',
    'track_public_online_booking_status',
    'book_online_appointment',
    'get_public_live_queue',
    'submit_public_contact_inquiry',
    'get_public_doctors_directory',
    'get_public_doctor_schedules',
    'get_public_token_status'
  ];

  for (const [key, func] of functions) {
    const grantedRoles = grants.get(func.name) || [];
    const revokedRoles = revokes.get(func.name) || [];
    const effectiveRoles = grantedRoles.filter(r => !revokedRoles.includes(r));

    const isAnon = effectiveRoles.includes('anon');
    const entry = {
      name: func.name,
      signature: func.sig,
      arguments: func.arguments,
      security_mode: func.security,
      granted_to: effectiveRoles,
      anon_executable: isAnon,
      is_critical: criticalRpcs.includes(func.name),
    };

    registry.push(entry);

    if (func.security === 'SECURITY_DEFINER' && isAnon && !certifiedPublic.includes(func.name)) {
      securityFindings.push({
        severity: 'HIGH',
        function: func.name,
        issue: 'SECURITY DEFINER function executable by anon role without certified public exemption',
        recommendation: 'Revoke anon access or convert to SECURITY INVOKER'
      });
    }
  }

  // Check for unexpected overloads on critical RPCs
  const overloadFindings = [];
  for (const rpcName of criticalRpcs) {
    const overloads = registry.filter(r => r.name === rpcName);
    if (overloads.length > 1) {
      overloadFindings.push({
        severity: 'CRITICAL',
        function: rpcName,
        overload_count: overloads.length,
        signatures: overloads.map(o => o.signature),
        issue: `Critical RPC has ${overloads.length} overloads — ambiguous dispatch risk`
      });
    }
  }

  // Write output
  const outputDir = path.join(ROOT, 'generated');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    generated_at: new Date().toISOString(),
    source: 'chronological_migration_analysis',
    migration_count: migrationFiles.length,
    migration_head: migrationFiles[migrationFiles.length - 1],
    total_functions: registry.length,
    security_definer_count: registry.filter(r => r.security_mode === 'SECURITY_DEFINER').length,
    anon_executable_count: registry.filter(r => r.anon_executable).length,
    critical_rpc_overload_count: overloadFindings.length,
    security_findings: securityFindings,
    overload_findings: overloadFindings,
    critical_rpcs_status: criticalRpcs.map(name => {
      const matched = registry.filter(r => r.name === name);
      return {
        name,
        count: matched.length,
        status: matched.length === 1 ? 'CANONICAL' : (matched.length === 0 ? 'MISSING' : 'OVERLOADED'),
        signature: matched[0]?.signature || null
      };
    }),
    registry: registry.sort((a, b) => a.name.localeCompare(b.name)),
  };

  const registryPath = path.join(outputDir, 'rpc-registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`✅ RPC Registry generated: ${registryPath}`);
  console.log(`   Total active functions:     ${output.total_functions}`);
  console.log(`   SECURITY DEFINER:          ${output.security_definer_count}`);
  console.log(`   Anon-executable:           ${output.anon_executable_count}`);
  console.log(`   Critical RPC overloads:    ${output.critical_rpc_overload_count}`);
  console.log(`   Unexempted anon findings:  ${output.security_findings.length}\n`);

  console.log('--- Critical Hospital RPC Signature Status ---');
  for (const cr of output.critical_rpcs_status) {
    const icon = cr.status === 'CANONICAL' ? '✅' : '❌';
    console.log(`  ${icon} ${cr.name.padEnd(40)} : ${cr.status} (${cr.count})`);
  }
  console.log('');

  if (overloadFindings.length > 0) {
    console.error('❌ CI GATE FAILED: Unexpected critical RPC overloads detected!');
    for (const f of overloadFindings) {
      console.error(`   ${f.function}: ${f.overload_count} overloads`);
    }
    if (process.argv.includes('--ci')) process.exit(1);
  }

  return output;
}

generateRpcRegistry().catch(err => {
  console.error('RPC registry generation failed:', err.message);
  process.exit(1);
});
