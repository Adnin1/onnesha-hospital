#!/usr/bin/env node

/**
 * Onnesha Hospital Management System (OHMS)
 * Laboratory Information System (LIS) — Standalone Local Bridge Daemon CLI
 * 
 * Usage:
 *   node scripts/lis-bridge/local-bridge-daemon.mjs --analyzer=MINDRAY-BC5000 --port=5100
 */

import { LocalLisBridge } from "../../lib/lab/lis/local-bridge.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    analyzer: "MINDRAY-BC5000",
    port: 5100,
    host: "0.0.0.0",
    orgId: process.env.OHMS_ORG_ID || "00000000-0000-0000-0000-000000000001",
    cloudUrl: process.env.OHMS_CLOUD_URL || "https://onnesha-hospital.pages.dev/api/lis/ingest",
    token: process.env.OHMS_LIS_TOKEN || "",
  };

  for (const arg of args) {
    if (arg.startsWith("--analyzer=")) params.analyzer = arg.split("=")[1];
    if (arg.startsWith("--port=")) params.port = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--host=")) params.host = arg.split("=")[1];
    if (arg.startsWith("--org-id=")) params.orgId = arg.split("=")[1];
    if (arg.startsWith("--cloud-url=")) params.cloudUrl = arg.split("=")[1];
    if (arg.startsWith("--token=")) params.token = arg.split("=")[1];
  }

  return params;
}

const config = parseArgs();

console.log("=================================================");
console.log("  OHMS LOCAL LIS INSTRUMENT BRIDGE DAEMON        ");
console.log("=================================================");
console.log(`• Target Analyzer:    ${config.analyzer}`);
console.log(`• Listening On:       ${config.host}:${config.port}`);
console.log(`• Organization ID:    ${config.orgId}`);
console.log(`• Cloud Ingest URL:   ${config.cloudUrl}`);
console.log("=================================================");

const bridge = new LocalLisBridge({
  analyzerCode: config.analyzer,
  organizationId: config.orgId,
  transportType: "TCP_IP",
  host: config.host,
  port: config.port,
  cloudIngestUrl: config.cloudUrl,
  apiSecretToken: config.token,
  connectionTimeoutMs: 15000,
  reconnectIntervalMs: 5000,
  maxFrameSizeBytes: 262144,
});

bridge.on("listening", (info) => {
  console.log(`[LIS-BRIDGE] Socket listener active on ${info.host}:${info.port}. Waiting for instrument packets...`);
});

bridge.on("client_connected", (ip) => {
  console.log(`[LIS-BRIDGE] Analyzer instrument connected from IP: ${ip}`);
});

bridge.on("frame", (data) => {
  console.log(`[LIS-BRIDGE] Extracted valid ${data.protocol} frame (${data.rawPayload.length} bytes). Forwarding to cloud...`);
});

bridge.on("checksum_error", () => {
  console.warn(`[LIS-BRIDGE] Checksum error in frame! Sent hardware NAK.`);
});

bridge.on("forwarded", (info) => {
  console.log(`[LIS-BRIDGE] Successfully forwarded analyzer packet for ${info.analyzerCode} to OHMS Cloud.`);
});

bridge.on("forward_error", (err) => {
  console.error(`[LIS-BRIDGE] Cloud forward failed:`, err);
});

bridge.on("state_change", (state) => {
  console.log(`[LIS-BRIDGE] Connection state: ${state}`);
});

process.on("SIGINT", async () => {
  console.log("\n[LIS-BRIDGE] Shutting down listener...");
  await bridge.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await bridge.stop();
  process.exit(0);
});

if (process.argv[1] && process.argv[1].endsWith("local-bridge-daemon.mjs")) {
  void bridge.start();
}

export { bridge, config };
