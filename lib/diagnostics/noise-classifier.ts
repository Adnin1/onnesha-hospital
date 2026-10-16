export interface ClientNoiseClassification {
  isNoise: boolean;
  classification?: "CLIENT_EXTENSION_NOISE" | "BENIGN_BROWSER_EVENT";
  reason?: string;
}

/**
 * Authoritative Client-Side Runtime Noise Classifier.
 * Identifies errors that MUST NOT be persisted to system_health_issues_log
 * or affect hospital-wide health scores.
 */
export function classifyClientRuntimeNoise(params: {
  message?: string;
  filename?: string;
  stack?: string;
}): ClientNoiseClassification {
  const msg = (params.message || "").toLowerCase();
  const file = (params.filename || "").toLowerCase();
  const stack = (params.stack || "").toLowerCase();
  const combined = `${msg} ${file} ${stack}`;

  // 1. Browser extension / message-channel noise (must NEVER affect global health)
  if (
    combined.includes("chrome: call method") ||
    combined.includes('window message "chrome:') ||
    combined.includes("window message 'chrome:") ||
    combined.includes("window message chrome:") ||
    combined.includes("chrome-extension://") ||
    combined.includes("moz-extension://") ||
    combined.includes("safari-extension://") ||
    combined.includes("extension context invalidated") ||
    combined.includes("the message port closed") ||
    combined.includes("message port closed") ||
    combined.includes("receiving end does not exist") ||
    combined.includes("runtime.lasterror") ||
    combined.includes("meta pixel") ||
    combined.includes("gtag")
  ) {
    return {
      isNoise: true,
      classification: "CLIENT_EXTENSION_NOISE",
      reason: "Confirmed non-first-party browser extension/message-channel noise",
    };
  }

  // 2. Benign browser DOM / navigation lifecycle events
  if (
    combined.includes("resizeobserver loop") ||
    combined.includes("resizeobserver") ||
    combined.includes("script error") ||
    combined.includes("aborterror") ||
    combined.includes("navigation cancelled") ||
    combined.includes("network request cancelled because of navigation") ||
    combined.includes("failed to fetch") ||
    combined.includes("networkerror") ||
    combined.includes("load failed")
  ) {
    return {
      isNoise: true,
      classification: "BENIGN_BROWSER_EVENT",
      reason: "Benign browser DOM or network lifecycle event",
    };
  }

  return { isNoise: false };
}
