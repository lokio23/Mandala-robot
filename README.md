# Mandala Drawing App

A browser-based mandala drawing tool. Draw symmetrical patterns with radial replication and optional mirroring.

## Features

- Fullscreen canvas with mouse + touch support
- Radial symmetry with 2–48 segments
- Mirror mode (reflects strokes across each segment centerline)
- Brush controls: size, color, opacity, smoothing
- Undo (20 steps) and clear
- Save as PNG
- Optional guide lines
- High-DPI / Retina support

## Run locally

Serve the project directory with any static file server:

```bash
# Python 3
python3 -m http.server 8000

# Node (npx, no install needed)
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Controls

| Control    | Description                                    |
|------------|------------------------------------------------|
| Segments   | Number of radial slices (2–48)                 |
| Mirror     | Reflect each stroke across the slice centerline|
| Guide lines| Toggle faint radial guide overlay              |
| Size       | Brush diameter (1–60 px)                       |
| Color      | Brush color picker                             |
| Opacity    | Brush opacity (0.05–1.0)                       |
| Smoothing  | Cursor jitter smoothing (0–0.9)                |
| Undo       | Revert last stroke (Ctrl/Cmd+Z also works)     |
| Clear      | Erase everything                               |
| Save PNG   | Download the canvas as a PNG image             |

## Files

```
index.html  – markup and control panel
style.css   – layout and styling
app.js      – drawing engine and event handling
```
