# Media Generation for GitHub Pages

This directory contains scripts to automatically generate screenshots and videos for the Clip Flow feature gallery.

## Prerequisites

```bash
npm install -g playwright
playwright install chromium
```

## Usage

1. **Start your Clip Flow app:**
   ```bash
   npm run dev
   ```

2. **Run the media generator:**
   ```bash
   node scripts/generate-docs-media.js
   ```

3. **Review the generated media** in `docs/media/`

4. **Commit and push:**
   ```bash
   git add docs/media/
   git commit -m "docs: add feature gallery media"
   git push
   ```

5. **Enable GitHub Pages** in your repository settings (Settings → Pages → Deploy from branch → main → /docs)

## What Gets Generated

The script creates:

- **17 feature screenshots** (PNG) - Component-focused or full-page captures
- **16 feature videos** (MP4) - 5-10 second demos showing interactions
- **Poster images** for video previews

## Features Covered

### Recording
- Native Capture
- Selection & Preview
- Webcam Integration
- Audio Handling
- Notes Overlay
- Floating Controls
- Screenshot Export
- Project Management

### Editing & Review
- Review Workflow (Timeline)
- Smart Zoom
- Cursor Customization
- Visual Styling (Themes)
- Captions
- **Cinematic Effects** ✨ *NEW*

### Export
- Export Options (Formats)
- Presets (Resolution/Frame-rate)
- Render Control

## Customization

Edit `scripts/generate-docs-media.js` to:
- Change selectors (`data-testid` attributes)
- Adjust capture timing
- Add new features
- Modify video actions

## Data Attributes Required

The script looks for these `data-testid` attributes in your app:

```
[data-testid="recorder-view"]
[data-testid="source-selector"]
[data-testid="webcam-preview"]
[data-testid="audio-controls"]
[data-testid="notes-panel"]
[data-testid="floating-bar"]
[data-testid="projects-list"]
[data-testid="review-timeline"]
[data-testid="zoom-editor"]
[data-testid="cursor-style-section"]
[data-testid="layers-tab"]
[data-testid="audio-tab"]
[data-testid="cinema-tab"] ✨ NEW
[data-testid="export-tab"]
[data-testid="render-progress"]
```

Add these attributes to your Svelte components for automatic capture.

## Manual Fallback

If automated capture fails, you can:
1. Manually take screenshots/videos
2. Place them in `docs/media/`
3. Name them according to the pattern: `{feature-id}.png` or `{feature-id}.mp4`
