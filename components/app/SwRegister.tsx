"use client";

import { useEffect } from "react";

const CURRENT_SW_VERSION = "1.1.81";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let isMounted = true;
    let reg: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    // Unconditionally purge outdated or misnamed browser caches
    try {
      if ("caches" in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            if (name.startsWith("ohms-") && name !== `ohms-static-v5-${CURRENT_SW_VERSION}`) {
              caches.delete(name).catch(() => {});
            }
          });
        }).catch(() => {});
      }
      localStorage.setItem("ohms_sw_version", CURRENT_SW_VERSION);
    } catch {
      // Non-fatal
    }

    // Automatically reload on controllerchange to adopt new assets seamlessly
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (reg) {
          reg.update().catch(() => {});
        } else {
          navigator.serviceWorker.getRegistration().then((activeReg) => {
            if (activeReg) {
              reg = activeReg;
              reg.update().catch(() => {});
            }
          }).catch(() => {});
        }
      }
    };

    async function registerSW() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (!isMounted) return;
        reg = registration;

        // Immediately check for updates
        registration.update().catch(() => {});

        reg.addEventListener("updatefound", () => {
          const newWorker = reg?.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Immediately tell new worker to take control
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void registerSW();

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
