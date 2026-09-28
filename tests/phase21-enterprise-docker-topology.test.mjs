import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 21 Enterprise Docker & Infrastructure Topology (10 Scenarios)", () => {

  test("1. Dockerfile contains no fake default Supabase URLs or placeholder keys", () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    assert.ok(!dockerfile.includes("onnesha-hospital.supabase.co"), "No fake fallback Supabase domain allowed");
    assert.ok(!dockerfile.includes("sb_publishable_placeholder"), "No fake placeholder key allowed in production build args");
  });

  test("2. Dockerfile enforces fail-closed validation for required build arguments", () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    assert.ok(dockerfile.includes("FATAL [OHMS-DOCKER]"), "Fail-closed error handler required in Dockerfile");
    assert.ok(dockerfile.includes("NEXT_PUBLIC_SUPABASE_URL"), "Supabase URL validation check required");
    assert.ok(dockerfile.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "Publishable key validation check required");
  });

  test("3. Docker Compose removes hardcoded production passwords and enforces fail-closed parameters", () => {
    const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    assert.ok(!compose.includes("ChangeMeInProduction"), "Zero insecure default database passwords allowed");
    assert.ok(!compose.includes("RedisSecureToken"), "Zero insecure default Redis passwords allowed");
    assert.ok(compose.includes("POSTGRES_PASSWORD:?"), "Fail-closed check required for POSTGRES_PASSWORD");
    assert.ok(compose.includes("REDIS_PASSWORD:?"), "Fail-closed check required for REDIS_PASSWORD");
  });

  test("4. Docker Compose isolates PostgreSQL and Redis to internal network without host port exposure", () => {
    const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    assert.ok(!compose.includes('"5432:5432"'), "PostgreSQL must not bind 5432 directly to host in production compose");
    assert.ok(!compose.includes('"6379:6379"'), "Redis must not bind 6379 directly to host in production compose");
    assert.ok(compose.includes('expose:\n      - "5432"') || compose.includes('expose:\n      - 5432') || compose.includes('- "5432"'), "Internal expose directive expected");
  });

  test("5. Docker Compose defines isolated internal bridge network", () => {
    const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    assert.ok(compose.includes("ohms-internal-network"), "Internal bridge network required");
    assert.ok(compose.includes("driver: bridge"), "Bridge driver required");
  });

  test("6. Deploy workflow passes genuine Supabase URL secrets to container build, not Pages URL", () => {
    const deployWf = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    assert.ok(!deployWf.includes("NEXT_PUBLIC_SUPABASE_URL=https://onnesha-hospital.pages.dev"), "Cloudflare Pages URL must never be sent as Supabase endpoint");
    assert.ok(deployWf.includes("NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL"), "Supabase URL secret reference required");
  });

  test("7. Deploy workflow documents container job as verification build with push disabled", () => {
    const deployWf = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    assert.ok(deployWf.includes("Docker Container Verification Build"), "Accurate job label required");
    assert.ok(deployWf.includes("push: false"), "Local verification build must have push: false");
  });

  test("8. Enterprise specification avoids false offline claims and documents cloud authoritative backend", () => {
    const spec = fs.readFileSync(path.join(ROOT, "docs/ENTERPRISE_SYSTEM_SPECIFICATION.md"), "utf8");
    assert.ok(!spec.includes("Enables completely offline local hospital intranet operation"), "False complete offline claim must not be present");
    assert.ok(spec.includes("Supabase Cloud"), "Supabase Cloud documented as authoritative backend");
    assert.ok(spec.includes("PHASE_19_BUSINESS_CONTINUITY.md"), "Manual downtime continuity protocol referenced");
  });

  test("9. Hardened Nginx configuration serves unprivileged with healthcheck endpoint", () => {
    const nginxConf = fs.readFileSync(path.join(ROOT, "docker/nginx.conf"), "utf8");
    assert.ok(nginxConf.includes("location = /healthz"), "Healthcheck endpoint required");
    assert.ok(nginxConf.includes("Content-Security-Policy"), "CSP header required");
    assert.ok(nginxConf.includes("X-Frame-Options \"DENY\""), "Frame protection required");
  });

  test("10. Development seeder script safely connects with parameterized tenant configuration", () => {
    const seeder = fs.readFileSync(path.join(ROOT, "scripts/seed-development-data.mjs"), "utf8");
    assert.ok(seeder.includes("runSeed"), "Seeder entrypoint required");
    assert.ok(seeder.includes("NEXT_PUBLIC_SUPABASE_URL"), "Supabase environment configuration consumed");
  });
});
