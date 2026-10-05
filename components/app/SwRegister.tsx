"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let isMounted = true;
    let reg: ServiceWorkerRegistration | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (reg) {
          reg.update().catch((err) => {
            console.warn("[SW] Visibility update check failed:", err);
          });
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

        reg.addEventListener("updatefound", () => {
          const newWorker = reg?.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated" && navigator.serviceWorker.controller && isMounted) {
              // New version available — optionally notify user
              console.log("[SW] New version activated.");
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
    };
  }, []);

  return null;
}

