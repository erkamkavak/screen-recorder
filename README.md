## About this project

This project is built on top of the open-source repository https://github.com/FormidableLabs/clips. It preserves the original goals while adding more control over recording, camera, microphone, and post-processing.

The app has been converted from a pure web app to an Electron app to enable more reliable global mouse/keyboard event tracking during recording.

## Added features

- More camera controls
- More microphone controls
- Post-processing for video
  - Foundations for zoom-to-cursor and related editing utilities in the review workflow

## Technology used

- The UI is built using [Svelte](https://svelte.dev/).
- Uses [`MediaDevices` API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices) for capturing screen, webcam, and mic.
- Uses [`AudioContext` API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) for audio visualizations.
- Uses HTML canvas for drawing the video and audio visualizations, and `CanvasRenderingContext2D`'s `captureStream` for capturing the canvas as a media stream.
- Uses [`MediaRecorder` API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) for recording the media stream as a WebM.

