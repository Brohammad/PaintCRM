# Paint Preview App V1

A no-dependency MVP that implements the first app-focused milestone:

- Room image upload
- Shade suggestions from dominant image color
- Instant color overlay preview
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

- The wall mask is heuristic-based (saturation + brightness threshold) for MVP speed.
- Next step is replacing heuristic masking with user brush/mask or segmentation model.
