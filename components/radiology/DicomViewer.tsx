"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  parseDicomBuffer,
  renderDicomToImageData,
  generateSyntheticDicomPhantom,
  ParsedDicomImage,
} from "@/lib/hardware/dicom";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Sliders,
  FileUp,
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";

interface DicomViewerProps {
  initialBuffer?: Uint8Array;
  onMetadataLoaded?: (meta: ParsedDicomImage["metadata"]) => void;
}

export function DicomViewer({ initialBuffer, onMetadataLoaded }: DicomViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [parsedImage, setParsedImage] = useState<ParsedDicomImage | null>(null);
  const [windowCenter, setWindowCenter] = useState<number>(800);
  const [windowWidth, setWindowWidth] = useState<number>(1600);
  const [zoom, setZoom] = useState<number>(1);
  const [invert, setInvert] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; wc: number; ww: number }>({
    x: 0,
    y: 0,
    wc: 800,
    ww: 1600,
  });

  const loadBuffer = useCallback(
    (buf: Uint8Array) => {
      const result = parseDicomBuffer(buf);
      setParsedImage(result);
      if (result.isValidDicom) {
        setWindowCenter(result.metadata.windowCenter);
        setWindowWidth(result.metadata.windowWidth);
        setZoom(1);
        if (onMetadataLoaded) {
          onMetadataLoaded(result.metadata);
        }
      }
    },
    [onMetadataLoaded]
  );

  // Load initial buffer or load default synthetic phantom
  useEffect(() => {
    if (initialBuffer) {
      loadBuffer(initialBuffer);
    } else {
      // Generate synthetic phantom on mount
      const phantom = generateSyntheticDicomPhantom({
        patientId: "ONN-RAD-7842",
        patientName: "TEST^PATIENT",
        modality: "DX",
      });
      loadBuffer(phantom);
    }
  }, [initialBuffer, loadBuffer]);

  // Render to canvas whenever image or window/level/zoom/invert changes
  useEffect(() => {
    if (!parsedImage || !parsedImage.isValidDicom || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imgData = renderDicomToImageData(parsedImage, windowCenter, windowWidth);
    if (!imgData) return;

    // Set canvas dimensions to match image
    canvas.width = parsedImage.metadata.columns;
    canvas.height = parsedImage.metadata.rows;

    // Invert if needed
    if (invert) {
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];         // R
        data[i + 1] = 255 - data[i + 1]; // G
        data[i + 2] = 255 - data[i + 2]; // B
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [parsedImage, windowCenter, windowWidth, invert]);

  // Mouse drag for interactive Window/Level adjustment
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      wc: windowCenter,
      ww: windowWidth,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Horizontal drag changes Window Width (contrast)
    // Vertical drag changes Window Center (brightness)
    const newWw = Math.max(10, Math.round(dragStart.ww + dx * 4));
    const newWc = Math.round(dragStart.wc - dy * 4);

    setWindowWidth(newWw);
    setWindowCenter(newWc);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        loadBuffer(new Uint8Array(arrayBuffer));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePreset = (preset: "default" | "bone" | "soft" | "lung") => {
    switch (preset) {
      case "bone":
        setWindowWidth(2000);
        setWindowCenter(350);
        break;
      case "soft":
        setWindowWidth(400);
        setWindowCenter(40);
        break;
      case "lung":
        setWindowWidth(1500);
        setWindowCenter(-600);
        break;
      default:
        if (parsedImage) {
          setWindowWidth(parsedImage.metadata.windowWidth);
          setWindowCenter(parsedImage.metadata.windowCenter);
        }
    }
  };

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-4">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-sky-400" />
          <span className="font-semibold text-sm tracking-wide">PACS DICOM Medical Viewer</span>
          {parsedImage?.metadata.modality && (
            <span className="bg-sky-950 border border-sky-800 text-sky-300 text-xs px-2 py-0.5 rounded font-mono font-bold">
              {parsedImage.metadata.modality}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Preset Buttons */}
          <button
            onClick={() => handlePreset("default")}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Reset default Window/Level"
          >
            Default
          </button>
          <button
            onClick={() => handlePreset("bone")}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Bone Window (WW: 2000, WC: 350)"
          >
            Bone
          </button>
          <button
            onClick={() => handlePreset("soft")}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Soft Tissue Window (WW: 400, WC: 40)"
          >
            Soft Tissue
          </button>
          <button
            onClick={() => handlePreset("lung")}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Lung Window (WW: 1500, WC: -600)"
          >
            Lung
          </button>

          {/* Invert Button */}
          <button
            onClick={() => setInvert(!invert)}
            className={`text-xs px-2.5 py-1 rounded border transition ${
              invert
                ? "bg-amber-600 border-amber-500 text-white"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Invert
          </button>

          {/* Zoom Buttons */}
          <button
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              handlePreset("default");
              setInvert(false);
            }}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Reset View"
            aria-label="Reset view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Load Sample Phantom Button */}
          <button
            onClick={() => {
              const phantom = generateSyntheticDicomPhantom({
                patientId: `ONN-${Date.now().toString().slice(-4)}`,
                patientName: "CALIBRATION^PHANTOM",
                modality: "DX",
              });
              loadBuffer(phantom);
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-medium transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Reload Phantom
          </button>

          {/* Upload DICOM File */}
          <label className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium cursor-pointer transition">
            <FileUp className="w-3.5 h-3.5" />
            Upload .dcm
            <input
              type="file"
              accept=".dcm,application/dicom"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* Main Viewer Stage */}
      <div className="relative flex items-center justify-center bg-black rounded-xl overflow-hidden min-h-[380px] select-none border border-slate-900">
        {parsedImage && parsedImage.isValidDicom ? (
          <div
            className="relative flex items-center justify-center transition-transform duration-75"
            style={{ transform: `scale(${zoom})` }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-crosshair shadow-2xl max-w-full max-h-[500px] object-contain"
              title="Click and drag horizontally to adjust contrast (WW), vertically for brightness (WC)"
            />
          </div>
        ) : (
          <div className="text-center p-8 text-slate-500">
            <Layers className="w-12 h-12 mx-auto mb-2 text-slate-700" />
            <p className="text-sm font-medium">No DICOM file loaded</p>
            <p className="text-xs text-slate-600 mt-1">Upload a valid medical .dcm file or load synthetic phantom</p>
          </div>
        )}

        {/* HUD Metadata Overlay (Top-Left) */}
        {parsedImage?.metadata && (
          <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-xs text-[11px] font-mono p-2.5 rounded-lg border border-slate-800 text-slate-300 pointer-events-none space-y-0.5">
            <div><span className="text-slate-500">PATIENT:</span> {parsedImage.metadata.patientName || "N/A"}</div>
            <div><span className="text-slate-500">ID:</span> {parsedImage.metadata.patientId || "N/A"}</div>
            <div><span className="text-slate-500">DATE:</span> {parsedImage.metadata.studyDate || "N/A"}</div>
            <div><span className="text-slate-500">MODALITY:</span> {parsedImage.metadata.modality || "DX"}</div>
            <div><span className="text-slate-500">MATRIX:</span> {parsedImage.metadata.columns}x{parsedImage.metadata.rows} ({parsedImage.metadata.bitsStored}-bit)</div>
          </div>
        )}

        {/* HUD Contrast Overlay (Bottom-Right) */}
        <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-xs text-[11px] font-mono p-2 rounded-lg border border-slate-800 text-slate-300 pointer-events-none flex gap-3">
          <div><span className="text-slate-500">WW:</span> {windowWidth}</div>
          <div><span className="text-slate-500">WC:</span> {windowCenter}</div>
          <div><span className="text-slate-500">ZOOM:</span> {Math.round(zoom * 100)}%</div>
        </div>
      </div>

      {/* Bottom Slider Adjustments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <span className="flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> Window Center (Brightness):</span>
            <span className="font-mono text-slate-200">{windowCenter}</span>
          </div>
          <input
            type="range"
            min="-1000"
            max="3000"
            value={windowCenter}
            onChange={(e) => setWindowCenter(parseInt(e.target.value, 10))}
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <span className="flex items-center gap-1"><Sliders className="w-3.5 h-3.5" /> Window Width (Contrast):</span>
            <span className="font-mono text-slate-200">{windowWidth}</span>
          </div>
          <input
            type="range"
            min="10"
            max="4000"
            value={windowWidth}
            onChange={(e) => setWindowWidth(parseInt(e.target.value, 10))}
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
