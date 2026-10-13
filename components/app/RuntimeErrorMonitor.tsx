"use client";

import { useEffect } from "react";
import { getCurrentUserSession } from "@/lib/auth/session";
import { reportSystemRuntimeIncident } from "@/lib/diagnostics/troubleshooter";

/**
 * Captures otherwise-unhandled browser errors while an authenticated hospital
 * session is open. Handled { success: false } results require explicit reporting.
 */
export default function RuntimeErrorMonitor() {
  useEffect(() => {
    const lastReported = new Map<string, number>();
    let reportsInWindow = 0;
    let windowStart = Date.now();

    const report = async (kind: "BROWSER_ERROR" | "UNHANDLED_REJECTION", raw: unknown) => {
      const message = raw instanceof Error ? raw.message : String(raw ?? "Unknown browser error");
      const sanitizedMessage = message.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 500);
      if (/AbortError|The user aborted a request|ResizeObserver loop/i.test(sanitizedMessage)) return;

      const now = Date.now();
      if (now - windowStart > 60_000) {
        windowStart = now;
        reportsInWindow = 0;
      }
      if (reportsInWindow >= 5) return;

      const pagePath = window.location.pathname || "/";
      const key = kind + ":" + pagePath + ":" + sanitizedMessage;
      const previous = lastReported.get(key) || 0;
      if (now - previous < 60_000) return;

      lastReported.set(key, now);
      reportsInWindow += 1;

      try {
        const session = await getCurrentUserSession(true);
        if (!session.userId || !session.organizationId) return;

        await reportSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "BROWSER_RUNTIME",
          location: pagePath,
          severity: "WARNING",
          errorCode: kind,
          title: kind === "BROWSER_ERROR" ? "Browser runtime error detected" : "Unhandled asynchronous error detected",
          reason: sanitizedMessage || "An unhandled browser failure occurred; no detailed message was available.",
          recommendation: "Open the affected workflow, review the related diagnostic entry, and reproduce the action after checking the browser console and database response.",
          details: {
            pathname: pagePath,
            error_kind: kind,
            user_agent: navigator.userAgent.slice(0, 180),
            captured_at: new Date().toISOString(),
          },
        });
      } catch (reportError) {
        console.error("[OHMS Runtime Monitor] Unable to report captured browser error.", reportError);
      }
    };

    const handleError = (event: ErrorEvent) => {
      void report("BROWSER_ERROR", event.error || event.message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void report("UNHANDLED_REJECTION", event.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
