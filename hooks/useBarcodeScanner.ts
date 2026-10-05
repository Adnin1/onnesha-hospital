"use client";

import { useEffect, useRef, useCallback } from "react";

export type BarcodeCategory = "PATIENT" | "SAMPLE" | "INVOICE" | "MEDICINE" | "GENERIC";

export interface BarcodeScanEvent {
  barcode: string;
  category: BarcodeCategory;
  timestamp: number;
  interKeyAverageMs: number;
}

export interface UseBarcodeScannerOptions {
  onScan?: (event: BarcodeScanEvent) => void;
  maxInterKeyDelayMs?: number; // threshold to distinguish human typing (>80ms) from scanner (<40ms)
  minBarcodeLength?: number;
  ignoreInInputs?: boolean;
  playAudioBeep?: boolean;
  enabled?: boolean;
  duplicateDebounceMs?: number; // sliding window suppression for accidental double-triggers (default: 500ms)
  suffix?: "Enter" | "Tab" | "Both"; // termination character (default: Both)
}

/**
 * Classifies barcode string according to OHMS clinical identifiers
 */
export function classifyBarcode(raw: string): BarcodeCategory {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.startsWith("ONN-P-") || trimmed.startsWith("P-") || /^P\d{6,}/.test(trimmed)) {
    return "PATIENT";
  }
  if (
    trimmed.startsWith("SMP-") ||
    trimmed.startsWith("LAB-") ||
    trimmed.startsWith("SAMP-") ||
    /^S\d{6,}/.test(trimmed)
  ) {
    return "SAMPLE";
  }
  if (
    trimmed.startsWith("INV-") ||
    trimmed.startsWith("REC-") ||
    trimmed.startsWith("BILL-") ||
    /^INV\d{4,}/.test(trimmed)
  ) {
    return "INVOICE";
  }
  if (
    trimmed.startsWith("MED-") ||
    /^\d{12,14}$/.test(trimmed) // EAN-13, UPC-A, GTIN-14 pharmaceutical barcode
  ) {
    return "MEDICINE";
  }
  return "GENERIC";
}

/**
 * Synthesizes a high-frequency confirmation beep via Web Audio API
 */
export function playScannerBeep(frequency = 1760, durationSeconds = 0.08): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, (durationSeconds + 0.1) * 1000);
  } catch {
    // AudioContext might be blocked until user gesture, safely ignore
  }
}

/**
 * React hook for catching hardware Keyboard-Wedge Barcode / QR Scanners
 */
export function useBarcodeScanner({
  onScan,
  maxInterKeyDelayMs = 50,
  minBarcodeLength = 3,
  ignoreInInputs = true,
  playAudioBeep = true,
  enabled = true,
  duplicateDebounceMs = 500,
  suffix = "Both",
}: UseBarcodeScannerOptions = {}) {
  const bufferRef = useRef<string>("");
  const timestampsRef = useRef<number[]>([]);
  const onScanRef = useRef(onScan);
  const lastScanCodeRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true");

      const now = performance.now();
      const lastTime = timestampsRef.current[timestampsRef.current.length - 1] || 0;
      const diff = now - lastTime;

      // Handle barcode completion on 'Enter' or 'Tab'
      const isEnter = e.key === "Enter" || e.keyCode === 13;
      const isTab = e.key === "Tab" || e.keyCode === 9;
      const matchesSuffix =
        (suffix === "Enter" && isEnter) ||
        (suffix === "Tab" && isTab) ||
        (suffix === "Both" && (isEnter || isTab));

      if (matchesSuffix) {
        const barcode = bufferRef.current.trim();
        const timestamps = [...timestampsRef.current];

        // Reset buffers
        bufferRef.current = "";
        timestampsRef.current = [];

        if (barcode.length >= minBarcodeLength) {
          // Calculate average inter-key speed
          let totalDiff = 0;
          for (let i = 1; i < timestamps.length; i++) {
            totalDiff += timestamps[i] - timestamps[i - 1];
          }
          const avgDiff = timestamps.length > 1 ? totalDiff / (timestamps.length - 1) : 0;

          // If typed too slowly (human typing) and currently in an input, don't hijack Enter/Tab
          if (isInput && avgDiff > maxInterKeyDelayMs) {
            return;
          }

          // Sliding window duplicate scan debounce
          const currentTimeMs = Date.now();
          if (
            barcode === lastScanCodeRef.current &&
            currentTimeMs - lastScanTimeRef.current < duplicateDebounceMs
          ) {
            return; // Duplicate scan suppressed
          }

          lastScanCodeRef.current = barcode;
          lastScanTimeRef.current = currentTimeMs;

          // Hardware scanner confirmed: prevent form submission or focus loss
          e.preventDefault();
          e.stopPropagation();

          const category = classifyBarcode(barcode);
          const scanEvent: BarcodeScanEvent = {
            barcode,
            category,
            timestamp: currentTimeMs,
            interKeyAverageMs: avgDiff,
          };

          if (playAudioBeep) {
            playScannerBeep();
          }

          // Dispatch DOM custom event so any modal or widget can listen globally
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("ohms:barcode-scanned", {
                detail: scanEvent,
                bubbles: true,
              })
            );
          }

          if (onScanRef.current) {
            onScanRef.current(scanEvent);
          }
        }
        return;
      }

      // Filter non-printable single character keys
      if (e.key.length !== 1) {
        return;
      }

      // If typing in an input field and inter-key delay is too long, clear buffer
      if (isInput && ignoreInInputs && diff > maxInterKeyDelayMs && bufferRef.current.length > 0) {
        bufferRef.current = "";
        timestampsRef.current = [];
        return;
      }

      // If delay since last character is greater than timeout, start a new scan sequence
      if (timestampsRef.current.length > 0 && diff > maxInterKeyDelayMs * 3) {
        bufferRef.current = "";
        timestampsRef.current = [];
      }

      bufferRef.current += e.key;
      timestampsRef.current.push(now);
    },
    [duplicateDebounceMs, enabled, ignoreInInputs, maxInterKeyDelayMs, minBarcodeLength, playAudioBeep, suffix]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * WebHID Scanner Exploration Support
 */
export async function checkWebHidSupport(): Promise<boolean> {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export async function requestHidScannerDevice(): Promise<{
  success: boolean;
  deviceName?: string;
  vendorId?: number;
  productId?: number;
  error?: string;
}> {
  if (typeof navigator === "undefined" || !("hid" in navigator)) {
    return {
      success: false,
      error: "WebHID is not supported in this browser environment.",
    };
  }

  try {
    const navHid = (navigator as unknown as { hid: { requestDevice: (o: object) => Promise<unknown[]> } }).hid;
    const devices = (await navHid.requestDevice({
      filters: [
        { usagePage: 0x01, usage: 0x06 }, // Keyboard / Keypad
        { usagePage: 0x8c }, // Bar Code Scanner Usage Page
      ],
    })) as Array<{ productName?: string; vendorId?: number; productId?: number }>;

    if (devices.length > 0) {
      const dev = devices[0];
      return {
        success: true,
        deviceName: dev.productName || "HID Barcode Scanner",
        vendorId: dev.vendorId,
        productId: dev.productId,
      };
    }

    return {
      success: false,
      error: "No HID scanner device selected by user.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "WebHID request error";
    return {
      success: false,
      error: msg,
    };
  }
}
