# Icons for Cross-Platform Builds

You'll need to add icon files here for proper packaging:

- `icon.png` (512x512) - Base icon file
- `icon.ico` - Windows icon (generated from PNG)
- `icon.icns` - macOS icon (generated from PNG)

## Quick Setup (Linux)

1. Create a 512x512 PNG icon:

```bash
# Add your app icon here
cp your-icon.png resources/icon.png
```

1. Install electron-builder's icon converter:

```bash
pnpm add -D electron-builder-icon-converter
```

1. Generate platform-specific icons (optional - electron-builder can do this automatically):

```bash
npx electron-builder-icon-converter -i resources/icon.png -o resources/
```

## Note

If you don't provide icons, electron-builder will use default Electron icons.
For production builds, create proper icons for each platform.
