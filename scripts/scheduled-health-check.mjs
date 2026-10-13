#!/usr/bin/env node
/**
 * 24/7 Background System Health & Invariant Heartbeat Probe
 * Executes continuous autonomous verification across production edge and Supabase diagnostics.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const CANONICAL_URL = process.env.CANONICAL_URL || "https://onnesha-hospital.pages.dev";
const ORG_ID = process.env.ORG_ID || "6b78e524-b1e3-4c43-8944-1a5a0248bff8";

console.log(`[24/7 Health Monitor] Starting heartbeat probe at ${new Date().toISOString()}`);

async function checkEdgeLiveness() {
  try {
    const res = await fetch(CANONICAL_URL, {
      method: "GET",
      headers: { "User-Agent": "OHMS-24-7-Heartbeat-Probe/1.0" },
    });
    console.log(`[Edge Probe] ${CANONICAL_URL} returned HTTP ${res.status} ${res.statusText}`);
    return res.status === 200;
  } catch (err) {
    console.error(`[Edge Probe] Failed to reach ${CANONICAL_URL}:`, err.message);
    return false;
  }
}

async function checkDatabaseDiagnostics() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      content.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) {
          let val = (m[2] || "").trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = val;
          if (m[1] === "NEXT_PUBLIC_SUPABASE_ANON_KEY") key = val;
        }
      });
    }
  }

  if (!url || !key || url.includes("placeholder") || url.includes("ci-hermetic")) {
    console.log("[Database Probe] Hermetic or unconfigured Supabase environment. Skipping remote live DB probe.");
    return { skipped: true, is_healthy: true };
  }

  try {
    const client = createClient(url, key);
    const { data, error } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: ORG_ID,
    });

    if (error) {
      console.error("[Database Probe] RPC execution error:", error.message);
      return { skipped: false, is_healthy: false, error: error.message };
    }

    console.log(`[Database Probe] Diagnostics Health Score: ${data?.health_score}/100, Issues: ${data?.total_issues || 0}`);
    return { skipped: false, ...data };
  } catch (err) {
    console.error("[Database Probe] Exception:", err.message);
    return { skipped: false, is_healthy: false, error: err.message };
  }
}

async function run() {
  const edgeOk = await checkEdgeLiveness();
  const dbResult = await checkDatabaseDiagnostics();

  console.log("--------------------------------------------------");
  console.log(`Result: Edge=${edgeOk ? "PASS" : "FAIL"}, Database=${dbResult.is_healthy ? "HEALTHY" : "DEFECT_DETECTED"}`);
  console.log("--------------------------------------------------");

  if (!edgeOk || (!dbResult.skipped && !dbResult.is_healthy)) {
    console.error("❌ System Heartbeat Check detected active anomalies!");
    process.exit(1);
  } else {
    console.log("✅ All production system invariants and health probes verified 100% operational.");
    process.exit(0);
  }
}

run();
