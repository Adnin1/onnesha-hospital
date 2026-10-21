#!/usr/bin/env node
/**
 * OHMS Security Definer Registry Generator (Phase 24 / Constitution Audit)
 * Analyzes all SECURITY DEFINER functions in the authoritative schema migrations.
 * Audits search_path, permissions, tenant guards, and caller files.
 * Generates generated/security-definer-registry.json.
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

// Find caller files across lib/, app/, tests/, and scripts/
function findCallers(funcName) {
  const callers = [];
  const searchDirs = ['lib', 'app', 'tests', 'scripts'];
  const regex = new RegExp(`\\b${funcName}\\b`);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && item.name !== '.next') walk(full);
      } else if (/\.(ts|tsx|js|mjs)$/.test(item.name)) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (regex.test(content)) {
            callers.push(path.relative(ROOT, full).replace(/\\/g, '/'));
          }
        } catch {}
      }
    }
  }

  for (const d of searchDirs) walk(path.join(ROOT, d));
  return callers;
}

async function generateSecDefRegistry() {
  console.log('🛡️ [SECURITY DEFINER REGISTRY] Auditing all SECURITY DEFINER functions...\n');

  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  const secDefFunctions = new Map();
  const activeGrants = new Map();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Chronological statement regex
    const stmtRegex = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\s+AS\s+[\$']([\s\S]*?)[\$']|DROP\s+FUNCTION\s+IF\s+EXISTS\s+(?:public\.)?(\w+)\s*\(([^)]*)\))/gi;
    let m;
    while ((m = stmtRegex.exec(sql)) !== null) {
      if (m[1]) {
        // CREATE FUNCTION
        const name = m[1];
        const rawArgs = m[2].trim();
        const sig = normalizeSignature(rawArgs);
        const key = `${name}(${sig})`;
        const headerAndBody = m[3] + '\n' + (m[4] || '');
        const isSecDef = /SECURITY\s+DEFINER/i.test(m[3]);

        if (isSecDef) {
          // Extract search path
          const spMatch = m[3].match(/SET\s+search_path\s*=\s*([^;\n]+)/i);
          let searchPath = spMatch ? spMatch[1].trim() : 'MUTABLE';
          if (searchPath === "''" || searchPath === '""' || searchPath === '') searchPath = "'' (EMPTY_SAFE)";

          // Detect guards inside body
          const body = m[4] || '';
          const hasAuthUid = /auth\.uid\(\)/i.test(body);
          const hasTenantGuard = /organization_id|active_organization_id|get_current_org_id/i.test(body);
          const hasRoleGuard = /is_super_admin|has_role|user_roles|profiles\.role/i.test(body);
          const hasPermGuard = /has_permission|role_permissions/i.test(body);
          const isTrigger = /RETURNS\s+TRIGGER/i.test(m[3]);

          secDefFunctions.set(key, {
            name,
            signature: sig,
            arguments: rawArgs,
            defined_in: file,
            search_path: searchPath,
            is_trigger: isTrigger,
            has_auth_uid: hasAuthUid,
            has_tenant_guard: hasTenantGuard,
            has_role_guard: hasRoleGuard,
            has_permission_guard: hasPermGuard,
            body_snippet: body.slice(0, 300).trim()
          });
        } else {
          secDefFunctions.delete(key);
        }
      } else if (m[5]) {
        // DROP FUNCTION
        const name = m[5];
        const sig = normalizeSignature(m[6] || '');
        secDefFunctions.delete(`${name}(${sig})`);
      }
    }

    // Process grants/revokes
    const grantRegex = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)\s*(?:\(([^)]*)\))?\s+TO\s+([^;]+);/gi;
    let gm;
    while ((gm = grantRegex.exec(sql)) !== null) {
      const name = gm[1];
      const sig = gm[2] ? normalizeSignature(gm[2]) : null;
      const roles = gm[3].split(',').map(r => r.trim().toLowerCase());
      const k = sig ? `${name}(${sig})` : name;
      const cur = activeGrants.get(k) || new Set();
      roles.forEach(r => cur.add(r));
      activeGrants.set(k, cur);
    }

    const revokeRegex = /REVOKE\s+(?:ALL|EXECUTE)\s+(?:ON\s+FUNCTION\s+)?(?:public\.)?(\w+)\s*(?:\(([^)]*)\))?\s+FROM\s+([^;]+);/gi;
    let rm;
    while ((rm = revokeRegex.exec(sql)) !== null) {
      const name = rm[1];
      const sig = rm[2] ? normalizeSignature(rm[2]) : null;
      const targets = rm[3].split(',').map(t => t.trim().toLowerCase());
      const k = sig ? `${name}(${sig})` : name;
      const cur = activeGrants.get(k) || new Set();
      targets.forEach(t => {
        cur.delete(t);
        if (t === 'public') {
          cur.delete('anon');
          cur.delete('authenticated');
        }
      });
      activeGrants.set(k, cur);
    }
  }

  const registryRecords = [];
  let anonSecDefCount = 0;
  let mutableSearchPathCount = 0;

  for (const [key, func] of secDefFunctions.entries()) {
    const rolesSet = activeGrants.get(key) || activeGrants.get(func.name) || new Set(['authenticated', 'service_role']);
    const anonExecutable = rolesSet.has('anon') || rolesSet.has('public');
    const authExecutable = rolesSet.has('authenticated');
    const serviceExecutable = rolesSet.has('service_role');

    if (anonExecutable) anonSecDefCount++;
    if (func.search_path === 'MUTABLE') mutableSearchPathCount++;

    // Classify
    let classification = 'AUTHENTICATED_OPERATIONAL';
    if (func.is_trigger) {
      classification = 'TRIGGER_ONLY';
    } else if (!authExecutable && !anonExecutable) {
      classification = 'INTERNAL_ONLY';
    } else if (func.name.includes('purge') || func.name.includes('delete') || func.has_role_guard) {
      classification = func.name.includes('purge') || func.body_snippet.includes('is_super_admin') ? 'SUPER_ADMIN_PRIVILEGED' : 'ADMIN_PRIVILEGED';
    } else if (anonExecutable) {
      classification = 'PUBLIC_SAFE';
    }

    const callers = findCallers(func.name);

    registryRecords.push({
      name: func.name,
      signature: func.signature,
      arguments: func.arguments,
      owner: 'postgres',
      search_path: func.search_path,
      anon_executable: anonExecutable,
      authenticated_executable: authExecutable,
      service_role_executable: serviceExecutable,
      auth_uid_guard: func.has_auth_uid,
      tenant_guard: func.has_tenant_guard,
      role_guard: func.has_role_guard,
      permission_guard: func.has_permission_guard,
      caller_files: callers,
      classification,
      review_result: func.search_path.includes('EMPTY_SAFE') ? 'HARDENED_SAFE' : (func.search_path === 'MUTABLE' ? 'NEEDS_SEARCH_PATH_PIN' : 'APPROVED')
    });
  }

  // Sort alphabetically
  registryRecords.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generated_at: new Date().toISOString(),
    total_secdef_functions: registryRecords.length,
    anon_executable_count: anonSecDefCount,
    mutable_search_path_count: mutableSearchPathCount,
    classifications: {
      TRIGGER_ONLY: registryRecords.filter(r => r.classification === 'TRIGGER_ONLY').length,
      INTERNAL_ONLY: registryRecords.filter(r => r.classification === 'INTERNAL_ONLY').length,
      PUBLIC_SAFE: registryRecords.filter(r => r.classification === 'PUBLIC_SAFE').length,
      AUTHENTICATED_OPERATIONAL: registryRecords.filter(r => r.classification === 'AUTHENTICATED_OPERATIONAL').length,
      ADMIN_PRIVILEGED: registryRecords.filter(r => r.classification === 'ADMIN_PRIVILEGED').length,
      SUPER_ADMIN_PRIVILEGED: registryRecords.filter(r => r.classification === 'SUPER_ADMIN_PRIVILEGED').length
    },
    functions: registryRecords
  };

  const outPath = path.join(ROOT, 'generated', 'security-definer-registry.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`✅ [SECURITY DEFINER REGISTRY] Written to: ${outPath}`);
  console.log(`   Total Functions:            ${payload.total_secdef_functions}`);
  console.log(`   Anon-Executable:            ${payload.anon_executable_count}`);
  console.log(`   Mutable Search Path Count:  ${payload.mutable_search_path_count}`);
  console.log(`   Hardened / Reviewed:        ${registryRecords.filter(r => r.review_result === 'HARDENED_SAFE' || r.review_result === 'APPROVED').length}`);
}

generateSecDefRegistry().catch(err => {
  console.error('❌ Error generating security definer registry:', err);
  process.exit(1);
});
