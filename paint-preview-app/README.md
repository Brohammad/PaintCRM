# Paint Preview App V1

A no-dependency MVP that implements the first app-focused milestone:

- Room image upload
- Shade suggestions from dominant image color
- Instant color overlay preview
- Natural recolor mode (HSL-based) for better texture and lighting preservation
- Before/after toggle
- Compare mode
- Export and native share (when supported)

## Run locally

This app is static HTML/CSS/JS, so you can run it with any static file server.

Option 1 (Python):

```bash
cd paint-preview-app
python3 -m http.server 8080
```

Then open http://localhost:8080

Option 2:

Open `index.html` directly in browser for quick testing.

## Notes

- Smart wall mask uses software-only region growing seeded in likely wall zones.
- Natural recolor mode shifts hue/saturation while largely preserving source luminance.
- Next step is adding optional manual brush mask + AI segmentation fallback.
