#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use parking_lot::Mutex;
use std::{
    env,
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{broadcast, mpsc, oneshot};
use mouse_position::mouse_position::Mouse;
use rdev::{listen, Event, EventType, Button};
use xcap::{Monitor, Window};

const RECORDING_DIR_NAME: &str = "clips-recordings";

// Frame data structure for NAPI
#[napi(object)]
#[derive(Clone)]
pub struct FrameData {
    pub width: u32,
    pub height: u32,
    pub timestamp_ms: i64,
    pub buffer: Buffer,
    pub mouse_x: Option<i32>,
    pub mouse_y: Option<i32>,
}

// Desktop source info
#[napi(object)]
pub struct DesktopSource {
    pub id: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub source_type: String,
}

// Recording options
#[napi(object)]
#[derive(Clone)]
pub struct RecordingOptions {
    pub target_id: String,
    pub capture_type: String,
    pub include_cursor: bool,
    pub frame_rate: u32,
    pub file_name: Option<String>,
}

// Internal frame DTO for broadcast (not exposed to NAPI)
#[derive(Clone)]
struct InternalFrame {
    width: u32,
    height: u32,
    timestamp_ms: u64,
    pixels: Vec<u8>,
    mouse_x: Option<i32>,
    mouse_y: Option<i32>,
}

// Helper to get current mouse position
fn get_mouse_position() -> (Option<i32>, Option<i32>) {
    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (Some(x), Some(y)),
        Mouse::Error => (None, None),
    }
}

// Capture target (internal)
#[derive(Clone)]
struct CaptureTarget {
    id: String,
    capture_type: String,
}

// Mouse button state
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MouseButtonState {
    None,
    LeftDown,
    LeftUp,
    RightDown,
    RightUp,
    MiddleDown,
    MiddleUp,
}

// Mouse event record for NAPI
#[napi(object)]
#[derive(Clone)]
pub struct MouseEventRecord {
    pub timestamp_ms: i64,
    pub x: i32,
    pub y: i32,
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub button_state: String, // "none", "left_down", "left_up", "right_down", "right_up", "middle_down", "middle_up"
    pub is_pressed: bool, // true if any button is currently pressed
}

// Recording session (internal)
struct RecordingSession {
    file_path: String,
    stop_tx: Option<std::sync::mpsc::Sender<()>>,
    join_handle: Option<thread::JoinHandle<std::result::Result<(), String>>>,
}

// Internal mouse event for storage
#[derive(Clone)]
struct InternalMouseEvent {
    timestamp_unix_ms: u64,
    x: i32,
    y: i32,
    screen_width: u32,
    screen_height: u32,
    button_state: MouseButtonState,
    is_pressed: bool,
}

// Capture state (internal)
struct CaptureState {
    is_running: bool,
    frame_rate: u32,
    target: Option<CaptureTarget>,
    frame_tx: Option<broadcast::Sender<InternalFrame>>,
    stop_tx: Option<oneshot::Sender<()>>,
    recording_file_path: Option<String>,
    recording_session: Option<RecordingSession>,
    recording_frame_tx: Option<mpsc::Sender<InternalFrame>>,
    recording_start_time: Option<u64>,
    mouse_events: Vec<InternalMouseEvent>,
    // Mouse button tracking
    left_button_pressed: bool,
    right_button_pressed: bool,
    middle_button_pressed: bool,
    last_button_state: MouseButtonState,
    // Cached screen dimensions for normalization
    current_screen_width: u32,
    current_screen_height: u32,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            is_running: false,
            frame_rate: 30,
            target: None,
            frame_tx: None,
            stop_tx: None,
            recording_file_path: None,
            recording_session: None,
            recording_frame_tx: None,
            recording_start_time: None,
            mouse_events: Vec::new(),
            left_button_pressed: false,
            right_button_pressed: false,
            middle_button_pressed: false,
            last_button_state: MouseButtonState::None,
            current_screen_width: 1920,
            current_screen_height: 1080,
        }
    }
}

// Global state
lazy_static::lazy_static! {
    static ref CAPTURE_STATE: Arc<Mutex<CaptureState>> = Arc::new(Mutex::new(CaptureState::default()));
    static ref TOKIO_RUNTIME: tokio::runtime::Runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("Failed to create Tokio runtime");
    // Flag to track if rdev listener is running
    static ref RDEV_LISTENER_STARTED: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
}

// Start the global mouse button listener (called once)
fn start_mouse_button_listener() {
    let mut started = RDEV_LISTENER_STARTED.lock();
    if *started {
        return;
    }
    *started = true;
    drop(started);
    
    thread::spawn(|| {
        let callback = |event: Event| {
            let mut state = CAPTURE_STATE.lock();
            match event.event_type {
                EventType::ButtonPress(button) => {
                    let button_state = match button {
                        Button::Left => {
                            state.left_button_pressed = true;
                            MouseButtonState::LeftDown
                        }
                        Button::Right => {
                            state.right_button_pressed = true;
                            MouseButtonState::RightDown
                        }
                        Button::Middle => {
                            state.middle_button_pressed = true;
                            MouseButtonState::MiddleDown
                        }
                        _ => MouseButtonState::None,
                    };
                    state.last_button_state = button_state;
                    
                    // If recording, add a click event
                    if state.recording_frame_tx.is_some() {
                        let (mouse_x, mouse_y) = get_mouse_position();
                        if let (Some(mx), Some(my)) = (mouse_x, mouse_y) {
                            let timestamp = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            
                            // Use cached screen dimensions for consistent normalization
                            let sw = state.current_screen_width;
                            let sh = state.current_screen_height;
                            
                            // Compute is_pressed before pushing to avoid borrow issues
                            let is_pressed = state.left_button_pressed || state.right_button_pressed || state.middle_button_pressed;
                            state.mouse_events.push(InternalMouseEvent {
                                timestamp_unix_ms: timestamp,
                                x: mx,
                                y: my,
                                screen_width: sw,
                                screen_height: sh,
                                button_state,
                                is_pressed,
                            });
                        }
                    }
                }
                EventType::ButtonRelease(button) => {
                    let button_state = match button {
                        Button::Left => {
                            state.left_button_pressed = false;
                            MouseButtonState::LeftUp
                        }
                        Button::Right => {
                            state.right_button_pressed = false;
                            MouseButtonState::RightUp
                        }
                        Button::Middle => {
                            state.middle_button_pressed = false;
                            MouseButtonState::MiddleUp
                        }
                        _ => MouseButtonState::None,
                    };
                    state.last_button_state = button_state;
                    
                    // If recording, add a release event
                    if state.recording_frame_tx.is_some() {
                        let (mouse_x, mouse_y) = get_mouse_position();
                        if let (Some(mx), Some(my)) = (mouse_x, mouse_y) {
                            let timestamp = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            
                            // Use cached screen dimensions for consistent normalization
                            let sw = state.current_screen_width;
                            let sh = state.current_screen_height;
                            
                            // Compute is_pressed before pushing to avoid borrow issues
                            let is_pressed = state.left_button_pressed || state.right_button_pressed || state.middle_button_pressed;
                            state.mouse_events.push(InternalMouseEvent {
                                timestamp_unix_ms: timestamp,
                                x: mx,
                                y: my,
                                screen_width: sw,
                                screen_height: sh,
                                button_state,
                                is_pressed,
                            });
                        }
                    }
                }
                _ => {}
            }
        };
        
        // This blocks forever, listening for events
        if let Err(e) = listen(callback) {
            eprintln!("rdev listen error: {:?}", e);
        }
    });
}

fn get_recording_dir() -> PathBuf {
    let mut base = env::temp_dir();
    base.push(RECORDING_DIR_NAME);
    fs::create_dir_all(&base).ok();
    base
}

fn timestamped_name(file_name: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{}-{}", now, file_name)
}

// Internal capture functions that return Result<_, String>
fn capture_monitor_frame_internal(monitor_id: &str) -> std::result::Result<InternalFrame, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    let index: usize = monitor_id
        .strip_prefix("monitor:")
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "Invalid monitor ID format".to_string())?;

    let monitor = monitors
        .get(index)
        .ok_or_else(|| format!("Monitor {} not found", index))?;

    // Capture mouse position at the same instant as the frame
    let (mouse_x, mouse_y) = get_mouse_position();
    
    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System time error".to_string())?
        .as_millis() as u64;

    Ok(InternalFrame {
        width: image.width(),
        height: image.height(),
        timestamp_ms: timestamp,
        pixels: image.to_vec(),
        mouse_x,
        mouse_y,
    })
}

fn capture_window_frame_internal(window_id: &str) -> std::result::Result<InternalFrame, String> {
    let windows = Window::all().map_err(|e| format!("Failed to get windows: {}", e))?;

    let target_id: u32 = window_id
        .strip_prefix("window:")
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "Invalid window ID format".to_string())?;

    let window = windows
        .into_iter()
        .find(|w| w.id().unwrap_or(0) == target_id)
        .ok_or_else(|| format!("Window {} not found", target_id))?;

    // Capture mouse position at the same instant as the frame
    let (mouse_x, mouse_y) = get_mouse_position();
    
    let image = window.capture_image().map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System time error".to_string())?
        .as_millis() as u64;

    Ok(InternalFrame {
        width: image.width(),
        height: image.height(),
        timestamp_ms: timestamp,
        pixels: image.to_vec(),
        mouse_x,
        mouse_y,
    })
}

fn capture_frame_for_target(target: &CaptureTarget) -> std::result::Result<InternalFrame, String> {
    match target.capture_type.as_str() {
        "monitor" => capture_monitor_frame_internal(&target.id),
        "window" => capture_window_frame_internal(&target.id),
        _ => Err("Unknown capture type".to_string()),
    }
}

#[napi]
pub fn list_sources() -> Result<Vec<DesktopSource>> {
    let mut sources = Vec::new();

    // List monitors
    if let Ok(monitors) = Monitor::all() {
        for (index, monitor) in monitors.iter().enumerate() {
            let name = monitor.name().unwrap_or_else(|_| format!("Monitor {}", index));
            
            // Capture thumbnail
            let thumbnail = monitor
                .capture_image()
                .ok()
                .and_then(|img| {
                    use base64::{engine::general_purpose, Engine as _};
                    use image::{DynamicImage, ImageOutputFormat};
                    use std::io::Cursor;

                    let thumb = DynamicImage::ImageRgba8(
                        image::ImageBuffer::from_raw(img.width(), img.height(), img.to_vec())?
                    ).thumbnail(480, 270);

                    let mut encoded = Vec::new();
                    thumb.write_to(&mut Cursor::new(&mut encoded), ImageOutputFormat::Png).ok()?;
                    Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&encoded)))
                });

            sources.push(DesktopSource {
                id: format!("monitor:{}", index),
                name,
                thumbnail,
                source_type: "screen".to_string(),
            });
        }
    }

    // List windows
    if let Ok(windows) = Window::all() {
        for window in windows {
            let id = window.id().unwrap_or(0);
            let name = window.title().unwrap_or_else(|_| "Unknown".to_string());
            
            if name.is_empty() {
                continue;
            }

            let thumbnail = window
                .capture_image()
                .ok()
                .and_then(|img| {
                    use base64::{engine::general_purpose, Engine as _};
                    use image::{DynamicImage, ImageOutputFormat};
                    use std::io::Cursor;

                    let thumb = DynamicImage::ImageRgba8(
                        image::ImageBuffer::from_raw(img.width(), img.height(), img.to_vec())?
                    ).thumbnail(480, 270);

                    let mut encoded = Vec::new();
                    thumb.write_to(&mut Cursor::new(&mut encoded), ImageOutputFormat::Png).ok()?;
                    Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&encoded)))
                });

            sources.push(DesktopSource {
                id: format!("window:{}", id),
                name,
                thumbnail,
                source_type: "window".to_string(),
            });
        }
    }

    Ok(sources)
}

#[napi]
pub fn start_capture(options: RecordingOptions) -> Result<()> {
    let mut state = CAPTURE_STATE.lock();

    if state.is_running {
        return Ok(());
    }

    let target = CaptureTarget {
        id: options.target_id.clone(),
        capture_type: options.capture_type.clone(),
    };

    let (frame_tx, _) = broadcast::channel(60);
    let (stop_tx, mut stop_rx) = oneshot::channel();

    state.is_running = true;
    state.frame_rate = options.frame_rate.max(1).min(60);
    state.target = Some(target.clone());
    state.frame_tx = Some(frame_tx.clone());
    state.stop_tx = Some(stop_tx);
    eprintln!("Starting capture with target: {}, frame_rate: {}", target.id, state.frame_rate);

    let frame_rate = state.frame_rate;
    let capture_target = target.clone();

    TOKIO_RUNTIME.spawn(async move {
        let interval = tokio::time::Duration::from_millis(1000 / frame_rate as u64);
        let mut ticker = tokio::time::interval(interval);
        let mut dropped_frames: u64 = 0;

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    let frame = match capture_target.capture_type.as_str() {
                        "monitor" => capture_monitor_frame_internal(&capture_target.id),
                        "window" => capture_window_frame_internal(&capture_target.id),
                        _ => continue,
                    };

                    if let Ok(frame_data) = frame {
                        // Best-effort preview broadcast (non-blocking)
                        let _ = frame_tx.send(frame_data.clone());

                        // If a recording session is active, feed the recorder queue and store mouse events
                        let (rec_tx, screen_dims) = {
                            let mut state = CAPTURE_STATE.lock();
                            
                            // Update cached dimensions from current frame
                            state.current_screen_width = frame_data.width;
                            state.current_screen_height = frame_data.height;

                            (
                                state.recording_frame_tx.clone(),
                                state.target.as_ref().map(|_| (frame_data.width, frame_data.height)),
                            )
                        };
                        
                        if let Some(rec_tx) = rec_tx {
                            // Store mouse event with frame-aligned timestamp
                            if let (Some(mx), Some(my), Some((sw, sh))) = 
                                (frame_data.mouse_x, frame_data.mouse_y, screen_dims) 
                            {
                                let mut state = CAPTURE_STATE.lock();
                                let is_pressed = state.left_button_pressed || state.right_button_pressed || state.middle_button_pressed;
                                state.mouse_events.push(InternalMouseEvent {
                                    timestamp_unix_ms: frame_data.timestamp_ms,
                                    x: mx,
                                    y: my,
                                    screen_width: sw,
                                    screen_height: sh,
                                    button_state: MouseButtonState::None, // Position events don't have button state
                                    is_pressed,
                                });
                            }
                            
                            if let Err(err) = rec_tx.try_send(frame_data) {
                                match err {
                                    mpsc::error::TrySendError::Full(_) => {
                                        dropped_frames += 1;
                                        if dropped_frames == 1 || dropped_frames % 30 == 0 {
                                            eprintln!("Recorder queue full, dropping frame (total dropped: {})", dropped_frames);
                                        }
                                    }
                                    mpsc::error::TrySendError::Closed(_) => {
                                        // Recording channel closed, ignore
                                    }
                                }
                            }
                        }
                    }
                }
                _ = &mut stop_rx => {
                    break;
                }
            }
        }
    });

    Ok(())
}

#[napi]
pub fn stop_capture() -> Result<()> {
    let mut state = CAPTURE_STATE.lock();

    if !state.is_running {
        return Ok(());
    }

    state.is_running = false;

    if let Some(stop_tx) = state.stop_tx.take() {
        let _ = stop_tx.send(());
    }

    state.target = None;
    state.frame_tx = None;
    state.recording_frame_tx = None;

    Ok(())
}

#[napi]
pub fn is_capture_running() -> bool {
    CAPTURE_STATE.lock().is_running
}

#[napi]
pub async fn poll_frame() -> Result<Option<FrameData>> {
    let mut rx = {
        let state = CAPTURE_STATE.lock();

        if !state.is_running {
            return Ok(None);
        }

        // When a recording session is active, avoid serving preview frames
        // to the frontend. The ffmpeg recording thread already consumes
        // from the capture pipeline, so we return None here to prevent
        // additional polling during recording.
        if state.recording_session.is_some() {
            return Ok(None);
        }

        if let Some(ref tx) = state.frame_tx {
            tx.subscribe()
        } else {
            return Ok(None);
        }
    };

    match rx.recv().await {
        Ok(frame) => Ok(Some(FrameData {
            width: frame.width,
            height: frame.height,
            timestamp_ms: frame.timestamp_ms as i64,
            buffer: Buffer::from(frame.pixels),
            mouse_x: frame.mouse_x,
            mouse_y: frame.mouse_y,
        })),
        Err(_) => Ok(None),
    }
}

#[napi]
pub fn start_recording(options: RecordingOptions) -> Result<String> {
    let recording_dir = get_recording_dir();
    fs::create_dir_all(&recording_dir)
        .map_err(|e| Error::from_reason(format!("Failed to create recording dir: {}", e)))?;

    let file_name = options.file_name.clone().unwrap_or_else(|| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("recording-{}.webm", timestamp)
    });

    let file_path = recording_dir.join(timestamped_name(&file_name));
    let file_path_str = file_path.to_string_lossy().to_string();

    // Start capture if not already running
    {
        let state = CAPTURE_STATE.lock();
        if !state.is_running {
            drop(state);
            start_capture(options.clone())?;
        }
    }

    // Start the mouse button listener (if not already running)
    start_mouse_button_listener();
    
    // Set recording file path and initialize mouse event tracking
    let start_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_file_path = Some(file_path_str.clone());
        state.recording_start_time = Some(start_time);
        state.mouse_events.clear();
        // Reset button states at start of recording
        state.left_button_pressed = false;
        state.right_button_pressed = false;
        state.middle_button_pressed = false;
        state.last_button_state = MouseButtonState::None;
    }

    // Dedicated channel for recording with backpressure
    let (rec_tx, rec_rx) = mpsc::channel::<InternalFrame>(120);
    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_frame_tx = Some(rec_tx);
    }

    // Start ffmpeg recording thread
    let start_ts = start_ffmpeg_recording_internal(file_path.clone(), rec_rx)?;

    // Update recording_start_time to the precise video start timestamp for sync
    // Note: Do NOT clear mouse_events here - they were already cleared above
    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_start_time = Some(start_ts);
    }

    Ok(file_path_str)
}

fn start_ffmpeg_recording_internal(
    file_path: PathBuf,
    mut frame_rx: mpsc::Receiver<InternalFrame>,
) -> Result<u64> {
    let (target, frame_rate) = {
        let state = CAPTURE_STATE.lock();
        let target = state
            .target
            .clone()
            .ok_or_else(|| Error::from_reason("No capture target available"))?;
        (target, state.frame_rate.max(1).min(60))
    };

    // Get initial frame for dimensions
    let first_frame = capture_frame_for_target(&target)
        .map_err(|e| Error::from_reason(e))?;

    let width = first_frame.width;
    let height = first_frame.height;
    let start_ts = first_frame.timestamp_ms;

    if width == 0 || height == 0 {
        return Err(Error::from_reason("Invalid frame dimensions"));
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let size_arg = format!("{}x{}", width, height);
    let fps_arg = frame_rate.to_string();
    let output_path = file_path.to_string_lossy().to_string();

    let handle = thread::spawn(move || -> std::result::Result<(), String> {
        // Dedicated runtime for async recv on this thread
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;

        rt.block_on(async move {
            let mut child = Command::new("ffmpeg")
                .args([
                    "-y",
                    "-f", "rawvideo",
                    "-pixel_format", "rgba",
                    "-video_size", &size_arg,
                    "-framerate", &fps_arg,
                    "-thread_queue_size", "512",
                    "-i", "-",
                    "-an",
                    "-c:v", "libvpx-vp9",
                    "-deadline", "realtime",
                    "-cpu-used", "8",
                    "-row-mt", "1",
                    "-b:v", "0",
                    "-crf", "32",
                    "-pix_fmt", "yuv420p",
                    &output_path,
                ])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Failed to launch ffmpeg: {}", e))?;

            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| "Failed to open ffmpeg stdin".to_string())?;

            let mut frame_count: u64 = 0;
            let mut last_pixels = first_frame.pixels.clone();
            let ms_per_frame = 1000.0 / frame_rate as f64;

            // Write initial frame immediately
            stdin
                .write_all(&first_frame.pixels)
                .map_err(|e| format!("Failed to write first frame: {}", e))?;
            frame_count += 1;

            loop {
                if stop_rx.try_recv().is_ok() {
                    eprintln!("Stopping recording after {} frames", frame_count);
                    break;
                }

                // Block until we receive a frame (or channel closes)
                let frame = match frame_rx.recv().await {
                    Some(frame) => frame,
                    None => {
                        eprintln!("Frame channel closed");
                        break;
                    }
                };

                // Ignore unexpected dimension changes
                if frame.width != width || frame.height != height {
                    eprintln!("Ignoring frame with unexpected dimensions: {}x{} (expected {}x{})", frame.width, frame.height, width, height);
                    continue;
                }

                // Calculate how many frames we expect to have written by now based on timestamp
                let elapsed_ms = frame.timestamp_ms.saturating_sub(start_ts);
                let expected_frames = (elapsed_ms as f64 / ms_per_frame).round() as u64;

                // If we are behind, fill with duplicate frames (CFR enforcement)
                // We write up to expected_frames, but at least ensure we write the NEW frame eventually.
                // Actually, we should write duplicates for all frames strictly BEFORE the current one.
                // Then write the current one.
                
                // Example:
                // frame_count = 1 (frame 0 written).
                // New frame at 100ms (fps 30, ~33ms).
                // expected_frames = 100 / 33.33 = 3.
                // We need frames 1 and 2 to be duplicates of frame 0.
                // Then frame 3 is the new frame.
                
                // Note: frame_count is 1-based (number of frames written).
                // expected_frames is 0-based index? No, it's count.
                // If t=0, expected=0. But we wrote 1.
                // Let's use expected_index logic.
                
                // Frame 0: t=0. Written. frame_count=1.
                // Next Frame: t=100. expected_index = 3.
                // We need to write indices 1 and 2.
                // So while frame_count <= expected_index (wait, if expected is 3, we want to write slot 3 with NEW frame).
                // So we want to fill slots 1, 2 with OLD frame.
                // So while frame_count < expected_frames:
                
                while frame_count < expected_frames {
                   if let Err(err) = stdin.write_all(&last_pixels) {
                        return Err(format!("Failed to pipe duplicate frame: {}", err));
                    }
                    frame_count += 1;
                }

                if let Err(err) = stdin.write_all(&frame.pixels) {
                    return Err(format!("Failed to pipe frame: {}", err));
                }
                
                last_pixels = frame.pixels; // Update last pixels for next gap
                frame_count += 1;
            }

            drop(stdin);
            let status = child.wait().map_err(|e| format!("ffmpeg wait failed: {}", e))?;
            if !status.success() {
                return Err(format!("ffmpeg exited with status {}", status));
            }
            Ok(())
        })
    });

    // Store session
    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_session = Some(RecordingSession {
            file_path: file_path.to_string_lossy().to_string(),
            stop_tx: Some(stop_tx),
            join_handle: Some(handle),
        });
    }

    Ok(start_ts)
}

#[napi]
pub fn stop_recording() -> Result<String> {
    eprintln!("stop_recording called");
    // Extract session info and clear state BEFORE waiting to avoid deadlocks
    let (stop_tx, join_handle, file_path) = {
        let mut state = CAPTURE_STATE.lock();

        eprintln!("stop_recording: checking for active recording session");
        let session = state
            .recording_session
            .take()
            .ok_or_else(|| Error::from_reason("No recording session active"))?;

        // Clear state early so producers drop their senders and unblock the recorder
        let path = state.recording_file_path.clone();
        state.recording_file_path = None;
        state.recording_frame_tx = None;

        eprintln!("stop_recording: found active session, signaling stop");
        (session.stop_tx, session.join_handle, path)
    };

    // Signal stop after releasing the lock
    if let Some(stop_tx) = stop_tx {
        let _ = stop_tx.send(());
        eprintln!("stop_recording: stop signal sent");
    }

    eprintln!("stop_recording: waiting for recording thread to finish");
    let thread_result = join_handle.and_then(|handle| match handle.join() {
        Ok(inner) => Some(inner),
        Err(_) => Some(Err("Recording thread panicked".to_string())),
    });
    eprintln!("stop_recording: recording thread finished");

    let final_path = file_path.ok_or_else(|| Error::from_reason("No recording file path"))?;

    eprintln!("stop_recording final_path: {}", final_path);

    if let Some(res) = thread_result {
        res.map_err(|e| Error::from_reason(e))?;
    }

    // Verify file exists
    let meta = fs::metadata(&final_path)
        .map_err(|e| Error::from_reason(format!("Recording missing: {}", e)))?;

    eprintln!("stop_recording file size: {} bytes", meta.len());

    if meta.len() == 0 {
        eprintln!("stop_recording warning: file is empty");
        return Err(Error::from_reason("Recording file is empty"));
    }

    eprintln!("stop_recording completed successfully");
    Ok(final_path)
}

#[napi]
pub fn take_screenshot(target_id: String, capture_type: String) -> Result<String> {
    use base64::{engine::general_purpose, Engine as _};
    use image::{DynamicImage, ImageOutputFormat};
    use std::io::Cursor;

    let frame = if capture_type == "monitor" {
        capture_monitor_frame_internal(&target_id)
    } else if capture_type == "window" {
        capture_window_frame_internal(&target_id)
    } else {
        return Err(Error::from_reason("Invalid capture type"));
    }
    .map_err(|e| Error::from_reason(e))?;

    let rgba_image = DynamicImage::ImageRgba8(
        image::ImageBuffer::from_raw(frame.width, frame.height, frame.pixels)
            .ok_or_else(|| Error::from_reason("Failed to create image buffer"))?,
    );

    let mut encoded = Vec::new();
    rgba_image
        .write_to(&mut Cursor::new(&mut encoded), ImageOutputFormat::Png)
        .map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(&encoded)
    ))
}

/// Get the mouse events captured during the last recording session.
/// Returns normalized coordinates (0.0-1.0) relative to the captured screen.
#[napi]
pub fn get_recording_mouse_events() -> Vec<MouseEventRecord> {
    let state = CAPTURE_STATE.lock();
    let start_time = state.recording_start_time.unwrap_or(0);
    state
        .mouse_events
        .iter()
        .map(|e| {
            let relative_ts = e.timestamp_unix_ms.saturating_sub(start_time);
            let button_state_str = match e.button_state {
                MouseButtonState::None => "none",
                MouseButtonState::LeftDown => "left_down",
                MouseButtonState::LeftUp => "left_up",
                MouseButtonState::RightDown => "right_down",
                MouseButtonState::RightUp => "right_up",
                MouseButtonState::MiddleDown => "middle_down",
                MouseButtonState::MiddleUp => "middle_up",
            };
            MouseEventRecord {
                timestamp_ms: relative_ts as i64,
                x: e.x,
                y: e.y,
                normalized_x: if e.screen_width > 0 {
                    e.x as f64 / e.screen_width as f64
                } else {
                    0.0
                },
                normalized_y: if e.screen_height > 0 {
                    e.y as f64 / e.screen_height as f64
                } else {
                    0.0
                },
                button_state: button_state_str.to_string(),
                is_pressed: e.is_pressed,
            }
        })
        .collect()
}

/// Clear the stored mouse events
#[napi]
pub fn clear_recording_mouse_events() {
    let mut state = CAPTURE_STATE.lock();
    state.mouse_events.clear();
    state.recording_start_time = None;
}

/// Get current mouse position (for real-time cursor tracking)
#[napi]
pub fn get_current_mouse_position() -> Result<Option<MouseEventRecord>> {
    let (mouse_x, mouse_y) = get_mouse_position();
    
    match (mouse_x, mouse_y) {
        (Some(x), Some(y)) => {
            // Get screen dimensions from primary monitor
            let monitors = Monitor::all().map_err(|e| Error::from_reason(e.to_string()))?;
            let (sw, sh) = monitors
                .first()
                .and_then(|m| m.capture_image().ok())
                .map(|img| (img.width(), img.height()))
                .unwrap_or((1920, 1080));
            
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            
            let state = CAPTURE_STATE.lock();
            let is_pressed = state.left_button_pressed || state.right_button_pressed || state.middle_button_pressed;
            
            Ok(Some(MouseEventRecord {
                timestamp_ms: timestamp,
                x,
                y,
                normalized_x: x as f64 / sw as f64,
                normalized_y: y as f64 / sh as f64,
                button_state: "none".to_string(),
                is_pressed,
            }))
        }
        _ => Ok(None),
    }
}
