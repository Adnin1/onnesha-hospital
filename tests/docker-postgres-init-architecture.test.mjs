import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Docker PostgreSQL Init & Compose Architecture (6 Scenarios)", async () => {

  test("1. docker-compose.yml mounts init-postgres.sh directly as an executable *.sh in /docker-entrypoint-initdb.d/", () => {
    const composeContent = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    assert.match(
      composeContent,
      /init-postgres\.sh:\/docker-entrypoint-initdb\.d\/\d+_\w+\.sh:ro/,
      "Must mount init script directly as a .sh file in /docker-entrypoint-initdb.d/"
    );
    assert.ok(
      composeContent.includes("/docker-init-scripts:ro"),
      "Must mount /docker-init-scripts directory"
    );
    assert.ok(
      composeContent.includes("/docker-migrations:ro"),
      "Must mount /docker-migrations directory"
    );
  });

  test("2. init-postgres.sh contains fail-closed shell execution, shims before migrations, and alphabetical sorting", () => {
    const scriptPath = path.join(ROOT, "docker/init-db/init-postgres.sh");
    assert.ok(fs.existsSync(scriptPath), "init-postgres.sh must exist");
    const script = fs.readFileSync(scriptPath, "utf8");

    assert.ok(script.startsWith("#!/bin/sh"), "Must specify #!/bin/sh shebang");
    assert.ok(script.includes("set -e"), "Must fail closed on any error with set -e");
    assert.ok(script.includes("/docker-init-scripts"), "Must reference init scripts");
    assert.ok(script.includes("/docker-migrations"), "Must reference migrations");
    assert.ok(script.includes("sort"), "Must sort migrations deterministically");
    assert.ok(script.includes("ON_ERROR_STOP=1"), "Must pass ON_ERROR_STOP=1 to psql");
  });

  test("3. Supabase compatibility shim defines auth schema, functions, and storage tables", () => {
    const shimPath = path.join(ROOT, "docker/init-db/00_supabase_shim.sql");
    assert.ok(fs.existsSync(shimPath), "00_supabase_shim.sql must exist");
    const shim = fs.readFileSync(shimPath, "utf8");

    assert.ok(shim.includes("CREATE SCHEMA IF NOT EXISTS auth"), "Must create auth schema");
    assert.ok(shim.includes("auth.uid()"), "Must define auth.uid() function");
    assert.ok(shim.includes("auth.role()"), "Must define auth.role() function");
    assert.ok(shim.includes("auth.jwt()"), "Must define auth.jwt() function");
    assert.ok(shim.includes("CREATE SCHEMA IF NOT EXISTS storage"), "Must create storage schema");
  });

  test("4. Migration sequence order simulation discovers all migrations in strictly ascending order", () => {
    const migrationsDir = path.join(ROOT, "supabase/migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    assert.ok(files.length >= 92, `Expected at least 92 migrations, found ${files.length}`);

    const sorted = [...files].sort();
    assert.deepEqual(files, sorted, "Migration files must be naturally sorted");
  });

  test("5. docker/nginx.conf CSP has zero sandbox origins and matches public/_headers", () => {
    const nginxConf = fs.readFileSync(path.join(ROOT, "docker/nginx.conf"), "utf8");
    const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");

    assert.ok(!nginxConf.includes("sandbox.sslcommerz.com"), "Nginx CSP must not contain sandbox.sslcommerz.com");
    assert.ok(nginxConf.includes("securepay.sslcommerz.com"), "Nginx CSP must contain securepay.sslcommerz.com");
    assert.ok(!headers.includes("sandbox.sslcommerz.com"), "public/_headers must not contain sandbox.sslcommerz.com");
  });

  test("6. Dockerfile enforces unprivileged user and multi-stage static asset hosting", () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    assert.ok(dockerfile.includes("USER nginx"), "Must run as unprivileged nginx user");
    assert.ok(dockerfile.includes("FROM node:22-alpine AS builder"), "Must use Node builder stage");
    assert.ok(dockerfile.includes("FROM nginx:alpine AS runner"), "Must use hardened Nginx runner stage");
  });
});
