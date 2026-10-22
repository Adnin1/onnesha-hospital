import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("scripts/generate-version.mjs", "utf8");

test("version generator prefers highest explicit migration ordinal over timestamp sorting", () => {
  assert.match(source, /migration_\(\\d\+\)/i);
  assert.match(source, /Number\.parseInt\(match\[1\], 10\)/);
  assert.match(source, /numbered\.sort\(\(a, b\) => a\.ordinal - b\.ordinal/);
});

test("version generator keeps timestamp filename ordering as a fallback", () => {
  assert.match(source, /const files = fs\.readdirSync\(migrationsDir\).*\.sort\(\)/s);
  assert.match(source, /let latestFile = files\[files\.length - 1\] \|\| null/);
});

test("current repository migration head resolves to Migration 258 rather than older migrations", () => {
  const files = fs
    .readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const numbered = files
    .map((file) => {
      const match = file.match(/(?:^|_)migration_(\d+)(?:_|\.sql$)/i);
      return match ? { file, ordinal: Number.parseInt(match[1], 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ordinal - b.ordinal || a.file.localeCompare(b.file));

  assert.ok(numbered.length > 0);
  const head = numbered[numbered.length - 1];

  assert.equal(head.ordinal, 258);
  assert.equal(
    head.file,
    "20261022202320_migration_258_permission_authoritative_rpc_and_anon_grant_hardening.sql"
  );
});
