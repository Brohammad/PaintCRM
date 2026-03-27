# Paint Preview App V1

A no-dependency MVP that implements the first app-focused milestone:

- Room image upload
- Shade suggestions from dominant image color
- Instant color overlay preview
- Natural recolor mode (HSL-based) for better texture and lighting preservation
- Click-to-seed wall targeting (tap to lock the wall region)
- Multiple wall tabs with independent wall targeting and shade assignment
- Brush mask mode for manual wall selection per tab
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
- You can override auto-seeding by tapping a wall area and locking the selection.
- You can paint a manual wall mask with brush mode and brush size control.
- Automatic wall selection is improved using connected-component scoring with an upper-wall bias.
- Natural recolor mode shifts hue/saturation while largely preserving source luminance.
- Testing palette includes drastic and dark shades (black/charcoal) for mask boundary validation.
- Next step is adding optional manual brush mask + AI segmentation fallback.
