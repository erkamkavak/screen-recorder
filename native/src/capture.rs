use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageOutputFormat};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::io::Cursor;
use tokio::sync::{broadcast, oneshot};
use xcap::{Monitor, Window};

use crate::{
    cursor_shape,
    state::{
        CaptureTarget, InternalFrame, InternalMouseEvent, MouseButtonState, CAPTURE_STATE,
        TOKIO_RUNTIME,
    },
    utils::{clamp_coordinate, get_mouse_position},
};

#[napi(object)]
#[derive(Clone)]
pub struct FrameData {
    pub width: u32,
    pub height: u32,
    pub timestamp_ms: i64,
    pub buffer: Buffer,
    pub mouse_x: Option<i32>,
    pub mouse_y: Option<i32>,
    pub origin_x: i32,
    pub origin_y: i32,
}

#[napi(object)]
pub struct DesktopSource {
    pub id: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub source_type: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct RecordingOptions {
    pub target_id: String,
    pub capture_type: String,
    pub include_cursor: bool,
    pub frame_rate: u32,
    pub file_name: Option<String>,
}

fn capture_monitor_frame_internal(monitor_id: &str) -> std::result::Result<InternalFrame, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    let index: usize = monitor_id
        .strip_prefix("monitor:")
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "Invalid monitor ID format".to_string())?;

    let monitor = monitors
        .get(index)
        .ok_or_else(|| format!("Monitor {} not found", index))?;

    let (mouse_x, mouse_y) = get_mouse_position();

    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System time error".to_string())?
        .as_millis() as u64;

    Ok(InternalFrame {
        width: image.width(),
        height: image.height(),
        timestamp_ms: timestamp,
        pixels: image.to_vec(),
        mouse_x,
        mouse_y,
        origin_x: 0,
        origin_y: 0,
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

    let (mouse_x, mouse_y) = get_mouse_position();

    let image = window.capture_image().map_err(|e| e.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System time error".to_string())?
        .as_millis() as u64;

    let origin_x = window.x().map_err(|e| e.to_string())?;
    let origin_y = window.y().map_err(|e| e.to_string())?;

    Ok(InternalFrame {
        width: image.width(),
        height: image.height(),
        timestamp_ms: timestamp,
        pixels: image.to_vec(),
        mouse_x,
        mouse_y,
        origin_x,
        origin_y,
    })
}

pub(crate) fn capture_frame_for_target(
    target: &CaptureTarget,
) -> std::result::Result<InternalFrame, String> {
    match target.capture_type.as_str() {
        "monitor" => capture_monitor_frame_internal(&target.id),
        "window" => capture_window_frame_internal(&target.id),
        _ => Err("Unknown capture type".to_string()),
    }
}

#[napi]
pub fn list_sources() -> Result<Vec<DesktopSource>> {
    let mut sources = Vec::new();

    if let Ok(monitors) = Monitor::all() {
        for (index, monitor) in monitors.iter().enumerate() {
            let name = monitor
                .name()
                .unwrap_or_else(|_| format!("Monitor {}", index));

            let thumbnail = monitor.capture_image().ok().and_then(|img| {
                let thumb = DynamicImage::ImageRgba8(image::ImageBuffer::from_raw(
                    img.width(),
                    img.height(),
                    img.to_vec(),
                )?)
                .thumbnail(480, 270);

                let mut encoded = Vec::new();
                thumb
                    .write_to(&mut Cursor::new(&mut encoded), ImageOutputFormat::Png)
                    .ok()?;
                Some(format!(
                    "data:image/png;base64,{}",
                    general_purpose::STANDARD.encode(&encoded)
                ))
            });

            sources.push(DesktopSource {
                id: format!("monitor:{}", index),
                name,
                thumbnail,
                source_type: "screen".to_string(),
            });
        }
    }

    if let Ok(windows) = Window::all() {
        for window in windows {
            let id = window.id().unwrap_or(0);
            let name = window.title().unwrap_or_else(|_| "Unknown".to_string());

            if name.is_empty() {
                continue;
            }

            let thumbnail = window.capture_image().ok().and_then(|img| {
                let thumb = DynamicImage::ImageRgba8(image::ImageBuffer::from_raw(
                    img.width(),
                    img.height(),
                    img.to_vec(),
                )?)
                .thumbnail(480, 270);

                let mut encoded = Vec::new();
                thumb
                    .write_to(&mut Cursor::new(&mut encoded), ImageOutputFormat::Png)
                    .ok()?;
                Some(format!(
                    "data:image/png;base64,{}",
                    general_purpose::STANDARD.encode(&encoded)
                ))
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
    eprintln!(
        "Starting capture with target: {}, frame_rate: {}",
        target.id, state.frame_rate
    );

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
                        let _ = frame_tx.send(frame_data.clone());

                        let (rec_tx, screen_dims) = {
                            let mut state = CAPTURE_STATE.lock();
                            state.current_screen_width = frame_data.width;
                            state.current_screen_height = frame_data.height;
                            state.current_origin_x = frame_data.origin_x;
                            state.current_origin_y = frame_data.origin_y;

                            (
                                state.recording_frame_tx.clone(),
                                state.target.as_ref().map(|_| (frame_data.width, frame_data.height)),
                            )
                        };

                        if let Some(rec_tx) = rec_tx {
                            if let (Some(mx), Some(my), Some((sw, sh))) =
                                (frame_data.mouse_x, frame_data.mouse_y, screen_dims)
                            {
                                let cursor_shape = cursor_shape::get_cursor_shape();
                                let mut state = CAPTURE_STATE.lock();
                                let is_pressed = state.left_button_pressed
                                    || state.right_button_pressed
                                    || state.middle_button_pressed;
                                let local_x = clamp_coordinate(mx, frame_data.origin_x, sw);
                                let local_y = clamp_coordinate(my, frame_data.origin_y, sh);
                                state.mouse_events.push(InternalMouseEvent {
                                    timestamp_unix_ms: frame_data.timestamp_ms,
                                    x: local_x,
                                    y: local_y,
                                    screen_width: sw,
                                    screen_height: sh,
                                    button_state: MouseButtonState::None,
                                    is_pressed,
                                    cursor_shape,
                                });
                            }

                            if let Err(err) = rec_tx.try_send(frame_data) {
                                match err {
                                    tokio::sync::mpsc::error::TrySendError::Full(_) => {
                                        dropped_frames += 1;
                                        if dropped_frames == 1 || dropped_frames % 30 == 0 {
                                            eprintln!("Recorder queue full, dropping frame (total dropped: {})", dropped_frames);
                                        }
                                    }
                                    tokio::sync::mpsc::error::TrySendError::Closed(_) => {}
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
pub async fn poll_frame() -> Result<Option<FrameData>> {
    let mut rx = {
        let state = CAPTURE_STATE.lock();

        if !state.is_running {
            return Ok(None);
        }

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
            origin_x: frame.origin_x,
            origin_y: frame.origin_y,
        })),
        Err(_) => Ok(None),
    }
}
