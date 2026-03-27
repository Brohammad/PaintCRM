"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHybridRegionMask,
  createEdgeMap,
  mergeMasksInPlace,
  recolorWithHsl,
  type SeedPoint
} from "./pixelUtils";

type DeepLabModel = {
  segment: (input: HTMLCanvasElement | HTMLImageElement) => Promise<{
    width: number;
    height: number;
    legend: Record<string, [number, number, number]>;
    segmentationMap: Uint8ClampedArray;
  }>;
};

function debounce<T extends (...args: never[]) => void>(fn: T, delayMs: number): T {
  let timeoutId: number | undefined;
  return ((...args: never[]) => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delayMs);
  }) as T;
}

export default function WallRecolorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  const edgeMapRef = useRef<Uint8Array | null>(null);
  const mlMaskRef = useRef<Uint8Array | null>(null);
  const mlModelRef = useRef<DeepLabModel | null>(null);

  const [paintColor, setPaintColor] = useState("#3f8cff");
  const [tolerance, setTolerance] = useState(38);
  const [edgeThreshold, setEdgeThreshold] = useState(55);
  const [showHighlight, setShowHighlight] = useState(true);
  const [enableMlAssist, setEnableMlAssist] = useState(true);
  const [seedPoints, setSeedPoints] = useState<SeedPoint[]>([]);
  const [undoStack, setUndoStack] = useState<SeedPoint[][]>([]);
  const [redoStack, setRedoStack] = useState<SeedPoint[][]>([]);
  const [imageName, setImageName] = useState("No image uploaded");
  const [selectedBaseColor, setSelectedBaseColor] = useState("-");
  const [mlStatus, setMlStatus] = useState("ML model not loaded");

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const drawPreview = useCallback((
    nextSeeds: SeedPoint[],
    nextTolerance: number,
    nextColor: string,
    highlight: boolean,
    nextEdgeThreshold: number,
    mlEnabled: boolean
  ) => {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    const edgeMap = edgeMapRef.current;
    if (!canvas || !original || !edgeMap) return;

    if (!nextSeeds.length) {
      const clean = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.putImageData(clean, 0, 0);
      return;
    }

    const unionMask = new Uint8Array(original.width * original.height);
    const activeMlMask = mlEnabled ? mlMaskRef.current : null;

    for (let s = 0; s < nextSeeds.length; s += 1) {
      const seed = nextSeeds[s];
      const mask = buildHybridRegionMask(
        original.data,
        original.width,
        original.height,
        seed,
        nextTolerance,
        edgeMap,
        nextEdgeThreshold,
        activeMlMask
      );
      mergeMasksInPlace(unionMask, mask);
    }

    const preview = recolorWithHsl(original, unionMask, nextColor, highlight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(preview, 0, 0);
  }, []);

  const debouncedDraw = useMemo(
    () => debounce((
      nextSeeds: SeedPoint[],
      nextTolerance: number,
      nextColor: string,
      highlight: boolean,
      nextEdgeThreshold: number,
      mlEnabled: boolean
    ) => {
      drawPreview(nextSeeds, nextTolerance, nextColor, highlight, nextEdgeThreshold, mlEnabled);
    }, 60),
    [drawPreview]
  );

  const extractMlWallMask = useCallback((
    segmentation: {
      width: number;
      height: number;
      legend: Record<string, [number, number, number]>;
      segmentationMap: Uint8ClampedArray;
    },
    targetWidth: number,
    targetHeight: number
  ): Uint8Array | null => {
    if (!segmentation?.width || !segmentation?.height || !segmentation?.segmentationMap) return null;
    const wallKeys = new Set<string>();
    Object.entries(segmentation.legend || {}).forEach(([label, color]) => {
      if (!color || color.length < 3) return;
      if (/wall|ceiling|building/i.test(label)) {
        wallKeys.add(`${color[0]}:${color[1]}:${color[2]}`);
      }
    });

    if (!wallKeys.size) return null;

    const srcWidth = segmentation.width;
    const srcHeight = segmentation.height;
    const src = segmentation.segmentationMap;
    const srcMask = new Uint8Array(srcWidth * srcHeight);

    for (let p = 0, i = 0; p < srcMask.length; p += 1, i += 4) {
      const key = `${src[i]}:${src[i + 1]}:${src[i + 2]}`;
      if (wallKeys.has(key)) srcMask[p] = 1;
    }

    const out = new Uint8Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y += 1) {
      const sy = Math.min(srcHeight - 1, Math.floor((y / targetHeight) * srcHeight));
      for (let x = 0; x < targetWidth; x += 1) {
        const sx = Math.min(srcWidth - 1, Math.floor((x / targetWidth) * srcWidth));
        out[y * targetWidth + x] = srcMask[sy * srcWidth + sx];
      }
    }

    return out;
  }, []);

  const runMlSegmentation = useCallback(async () => {
    const original = originalRef.current;
    if (!original) return;

    try {
      setMlStatus("Loading ML model...");
      if (!mlModelRef.current) {
        await import("@tensorflow/tfjs");
        const deeplabModule = await import("@tensorflow-models/deeplab");
        mlModelRef.current = await deeplabModule.load({ base: "ade20k", quantizationBytes: 2 }) as DeepLabModel;
      }

      setMlStatus("Running ML wall segmentation...");
      const sampleCanvas = document.createElement("canvas");
      const maxSide = 640;
      const scale = Math.min(1, maxSide / Math.max(original.width, original.height));
      sampleCanvas.width = Math.max(64, Math.round(original.width * scale));
      sampleCanvas.height = Math.max(64, Math.round(original.height * scale));
      const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!sampleCtx) return;

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = original.width;
      sourceCanvas.height = original.height;
      const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      if (!sourceCtx) return;
      sourceCtx.putImageData(original, 0, 0);

      sampleCtx.drawImage(sourceCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const segmentation = await mlModelRef.current.segment(sampleCanvas);
      mlMaskRef.current = extractMlWallMask(segmentation, original.width, original.height);

      if (!mlMaskRef.current) {
        setMlStatus("ML loaded, no wall class found (edge+color only)");
      } else {
        setMlStatus("ML wall mask active");
      }
    } catch {
      mlMaskRef.current = null;
      setMlStatus("ML unavailable, using edge+color mode");
    }

    drawPreview(seedPoints, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist);
  }, [drawPreview, edgeThreshold, enableMlAssist, extractMlWallMask, paintColor, seedPoints, showHighlight, tolerance]);

  useEffect(() => {
    if (!originalRef.current) return;
    if (!enableMlAssist) {
      setMlStatus("ML assist disabled");
      drawPreview(seedPoints, tolerance, paintColor, showHighlight, edgeThreshold, false);
      return;
    }

    runMlSegmentation();
  }, [drawPreview, edgeThreshold, enableMlAssist, paintColor, runMlSegmentation, seedPoints, showHighlight, tolerance]);

  const handleUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageName(file.name);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      originalRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      edgeMapRef.current = createEdgeMap(originalRef.current.data, originalRef.current.width, originalRef.current.height);
      mlMaskRef.current = null;
      setSeedPoints([]);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedBaseColor("-");
      setMlStatus("Image loaded, preparing ML assist...");
      if (enableMlAssist) {
        runMlSegmentation();
      }
      URL.revokeObjectURL(objectUrl);
    };

    img.src = objectUrl;
  }, [enableMlAssist, runMlSegmentation]);

  const saveHistoryAndSetSeeds = useCallback((nextSeeds: SeedPoint[]) => {
    setUndoStack((prev) => [...prev, seedPoints]);
    setRedoStack([]);
    setSeedPoints(nextSeeds);
    debouncedDraw(nextSeeds, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist);
  }, [seedPoints, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist, debouncedDraw]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    if (!canvas || !original) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    const idx = (y * original.width + x) * 4;
    const r = original.data[idx].toString(16).padStart(2, "0");
    const g = original.data[idx + 1].toString(16).padStart(2, "0");
    const b = original.data[idx + 2].toString(16).padStart(2, "0");
    setSelectedBaseColor(`#${r}${g}${b}`);

    const nextSeeds = [...seedPoints, { x, y }];
    saveHistoryAndSetSeeds(nextSeeds);
  }, [seedPoints, saveHistoryAndSetSeeds]);

  const handleUndo = useCallback(() => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);
    const nextRedo = [...redoStack, seedPoints];

    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
    setSeedPoints(previous);
    drawPreview(previous, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist);
  }, [undoStack, redoStack, seedPoints, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist, drawPreview]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);
    const nextUndo = [...undoStack, seedPoints];

    setRedoStack(nextRedo);
    setUndoStack(nextUndo);
    setSeedPoints(next);
    drawPreview(next, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist);
  }, [redoStack, undoStack, seedPoints, tolerance, paintColor, showHighlight, edgeThreshold, enableMlAssist, drawPreview]);

  const handleReset = useCallback(() => {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    if (!canvas || !original) return;
    setUndoStack((prev) => [...prev, seedPoints]);
    setRedoStack([]);
    setSeedPoints([]);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(original.data), original.width, original.height), 0, 0);
  }, [seedPoints]);

  const handleToleranceChange = useCallback((value: number) => {
    setTolerance(value);
    debouncedDraw(seedPoints, value, paintColor, showHighlight, edgeThreshold, enableMlAssist);
  }, [seedPoints, paintColor, showHighlight, edgeThreshold, enableMlAssist, debouncedDraw]);

  const handleEdgeThresholdChange = useCallback((value: number) => {
    setEdgeThreshold(value);
    debouncedDraw(seedPoints, tolerance, paintColor, showHighlight, value, enableMlAssist);
  }, [seedPoints, tolerance, paintColor, showHighlight, enableMlAssist, debouncedDraw]);

  const handlePaintColorChange = useCallback((value: string) => {
    setPaintColor(value);
    debouncedDraw(seedPoints, tolerance, value, showHighlight, edgeThreshold, enableMlAssist);
  }, [seedPoints, tolerance, showHighlight, edgeThreshold, enableMlAssist, debouncedDraw]);

  const handleHighlightToggle = useCallback((checked: boolean) => {
    setShowHighlight(checked);
    debouncedDraw(seedPoints, tolerance, paintColor, checked, edgeThreshold, enableMlAssist);
  }, [seedPoints, tolerance, paintColor, edgeThreshold, enableMlAssist, debouncedDraw]);

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 1100 }}>
      <h2 style={{ margin: 0 }}>Wall Recolor Canvas</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label>
          Upload image:
          <input type="file" accept="image/*" onChange={handleUpload} style={{ marginLeft: 8 }} />
        </label>

        <label>
          Paint color:
          <input
            type="color"
            value={paintColor}
            onChange={(e) => handlePaintColorChange(e.target.value)}
            style={{ marginLeft: 8 }}
          />
        </label>

        <label>
          Tolerance: {tolerance}
          <input
            type="range"
            min={2}
            max={120}
            value={tolerance}
            onChange={(e) => handleToleranceChange(Number(e.target.value))}
            style={{ marginLeft: 8, verticalAlign: "middle" }}
          />
        </label>

        <label>
          Edge lock: {edgeThreshold}
          <input
            type="range"
            min={8}
            max={140}
            value={edgeThreshold}
            onChange={(e) => handleEdgeThresholdChange(Number(e.target.value))}
            style={{ marginLeft: 8, verticalAlign: "middle" }}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={enableMlAssist}
            onChange={(e) => setEnableMlAssist(e.target.checked)}
          />
          Use ML wall assist
        </label>

        <label>
          <input
            type="checkbox"
            checked={showHighlight}
            onChange={(e) => handleHighlightToggle(e.target.checked)}
          />
          Highlight selection
        </label>

        <button type="button" onClick={handleUndo} disabled={!canUndo}>Undo</button>
        <button type="button" onClick={handleRedo} disabled={!canRedo}>Redo</button>
        <button type="button" onClick={handleReset}>Reset selection</button>
      </div>

      <p style={{ margin: 0, color: "#666" }}>
        Image: {imageName} | Base color: {selectedBaseColor} | {mlStatus}
      </p>

      <p style={{ margin: 0, color: "#666" }}>
        Hybrid mode: click wall pixels to grow region by color similarity, constrained by edge boundaries and optional ML wall mask.
      </p>

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          width: "100%",
          maxHeight: "70vh",
          objectFit: "contain",
          border: "1px solid #d6d6d6",
          borderRadius: 10,
          cursor: "crosshair",
          background: "#f6f6f6"
        }}
      />
    </section>
  );
}
