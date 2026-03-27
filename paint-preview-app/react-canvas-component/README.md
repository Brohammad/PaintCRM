# Hybrid Wall Recolor Component (React / Next.js)

This folder includes a client-side canvas component that combines:

- Color-based region selection from clicked seed pixels
- Edge-aware flood fill to avoid crossing sharp boundaries
- Optional ML wall assist using DeepLab (TensorFlow.js)

## Files

- `WallRecolorCanvas.tsx`
- `pixelUtils.ts`
- `next-app-router-example/page.tsx`
- `next-pages-router-example/index.tsx`

## Install Dependencies

In your React/Next.js project:

```bash
npm install @tensorflow/tfjs @tensorflow-models/deeplab
```

## Use In Next.js (App Router)

1. Copy `WallRecolorCanvas.tsx` and `pixelUtils.ts` into a components folder (example: `src/components/wall-recolor/`).
2. Copy the example page from `next-app-router-example/page.tsx`.

## Use In Next.js (Pages Router)

1. Copy `WallRecolorCanvas.tsx` and `pixelUtils.ts` into your components folder.
2. Copy the example page from `next-pages-router-example/index.tsx`.

## Notes

- Component is marked with `"use client"` and must run on client side.
- For large images, model inference is downscaled for performance.
- If ML model load fails, the component still works in edge + color mode.
