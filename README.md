# Clip Flow
 
# About this project
This project is built on top of the open-source repository [clips](https://github.com/FormidableLabs/clips). It preserves the original goals while adding more control over recording, camera, microphone, and post-processing.

The app has been converted from a pure web app to an Electron app to enable more reliable global mouse/keyboard event tracking during recording and now uses a native Rust backend for desktop capture and recording.

## Added features

- More camera controls
- More microphone controls
- Native screen/window capture and recording via Rust instead of the browser MediaRecorder API
- Post-processing stage for recorded clips
  - Zoom/spotlight effects centered on mouse clicks
  - Ability to change and emphasize the mouse cursor during playback
- Optimized rendering/export pipeline for smoother previews and more reliable output

## Technology used

- The UI is built using [Svelte](https://svelte.dev/).
- Native desktop capture and recording is implemented in [Rust](https://www.rust-lang.org/) and exposed to the app via [napi-rs](https://napi.rs/).
- Uses [xcap](https://crates.io/crates/xcap) for cross-platform screen and window capture.
- Uses global mouse tracking (e.g. `mouse_position`, `rdev`) to record cursor position, button state, and cursor shape for use in post-processing.
- Uses [`MediaDevices` API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices) for capturing webcam and microphone.
- Uses [`AudioContext` API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) for audio visualizations.
- Uses HTML canvas for drawing the video and audio visualizations and for feeding frames into the rendering pipeline.

## Prerequisites

- Node.js and pnpm installed
- Rust toolchain (for building the native module)
- `ffmpeg` available on your PATH (used for encoding the recorded video)

## Running locally

Install dependencies and build the native Rust module, then start the app:

```bash
pnpm install
pnpm build:native
pnpm dev
```

### Platform support / limitations

- Developed and tested primarily on **Linux** (X11) and **Windows**.
- macOS is **not tested** and may require additional work or permissions.
- The **mouse cursor shape/change feature is currently only supported on Linux X11**; other platforms will fall back to a simpler cursor experience.

### Linux system requirements

To build the native Rust module (e.g. `xcap` and related crates) on Linux, you may need to install additional system packages.

- **Debian / Ubuntu**:
  
  ```bash
  sudo apt-get install pkg-config libclang-dev libxcb1-dev libxrandr-dev libdbus-1-dev libpipewire-0.3-dev libwayland-dev libegl-dev
  ```
  
- **Alpine**:
  
  ```bash
  sudo apk add pkgconf llvm19-dev clang19-dev libxcb-dev libxrandr-dev dbus-dev pipewire-dev wayland-dev mesa-dev
  ```

- **Arch Linux**:
  
  ```bash
  sudo pacman -S base-devel clang libxcb libxrandr dbus libpipewire
  ```

## Contributing

This is my first maintained open-source project. I will be really happy if you:

- Open issues for bugs, crashes, or confusing behavior
- Suggest improvements to the recording pipeline, post-processing, or platform support

Feedback and contributions (even small ones) are very welcome.
