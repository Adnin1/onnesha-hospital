"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let isMounted = true;

    async function registerSW() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
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

    void registerSW();

    return () => { isMounted = false; };
  }, []);

  return null;
}
