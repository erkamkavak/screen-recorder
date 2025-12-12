use napi::{Error, Result};
use napi_derive::napi;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
};

use crate::{
    capture::RecordingOptions,
    mouse_events::start_mouse_button_listener,
    state::{InternalFrame, MouseButtonState, RecordingSession, CAPTURE_STATE},
    utils::{get_recording_dir, timestamped_name},
};

pub fn start_ffmpeg_recording_internal(
    file_path: PathBuf,
    mut frame_rx: tokio::sync::mpsc::Receiver<InternalFrame>,
) -> Result<u64> {
    let (target, frame_rate) = {
        let state = CAPTURE_STATE.lock();
        let target = state
            .target
            .clone()
            .ok_or_else(|| Error::from_reason("No capture target available"))?;
        (target, state.frame_rate.max(1).min(60))
    };

    let first_frame =
        crate::capture::capture_frame_for_target(&target).map_err(|e| Error::from_reason(e))?;

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
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;

        rt.block_on(async move {
            let mut command = Command::new("ffmpeg");
            command
                .args([
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "rawvideo",
                    "-pixel_format",
                    "rgba",
                    "-video_size",
                    &size_arg,
                    "-framerate",
                    &fps_arg,
                    "-thread_queue_size",
                    "64",
                    "-i",
                    "-",
                    "-an",
                    "-vf",
                    "scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "14",
                    "-maxrate",
                    "16M",
                    "-bufsize",
                    "32M",
                    "-colorspace",
                    "bt709",
                    "-color_primaries",
                    "bt709",
                    "-color_trc",
                    "bt709",
                    "-color_range",
                    "tv",
                    "-pix_fmt",
                    "yuv444p",
                    "-profile:v",
                    "high444",
                    "-movflags",
                    "+faststart",
                    &output_path,
                ])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(target_os = "windows")]
            {
                command.creation_flags(0x08000000);
            }
            let mut child = command
                .spawn()
                .map_err(|e| format!("Failed to launch ffmpeg: {}", e))?;

            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| "Failed to open ffmpeg stdin".to_string())?;

            let mut frame_count: u64 = 0;
            let mut last_pixels = first_frame.pixels.clone();
            let ms_per_frame = 1000.0 / frame_rate as f64;

            stdin
                .write_all(&first_frame.pixels)
                .map_err(|e| format!("Failed to write first frame: {}", e))?;
            frame_count += 1;

            loop {
                if stop_rx.try_recv().is_ok() {
                    eprintln!("Stopping recording after {} frames", frame_count);
                    break;
                }

                let frame = match frame_rx.recv().await {
                    Some(frame) => frame,
                    None => {
                        eprintln!("Frame channel closed");
                        break;
                    }
                };

                if frame.width != width || frame.height != height {
                    eprintln!(
                        "Ignoring frame with unexpected dimensions: {}x{} (expected {}x{})",
                        frame.width, frame.height, width, height
                    );
                    continue;
                }

                let elapsed_ms = frame.timestamp_ms.saturating_sub(start_ts);
                let expected_frames = (elapsed_ms as f64 / ms_per_frame).round() as u64;

                while frame_count < expected_frames {
                    if let Err(err) = stdin.write_all(&last_pixels) {
                        return Err(format!("Failed to pipe duplicate frame: {}", err));
                    }
                    frame_count += 1;
                }

                if let Err(err) = stdin.write_all(&frame.pixels) {
                    return Err(format!("Failed to pipe frame: {}", err));
                }

                last_pixels = frame.pixels;
                frame_count += 1;
            }

            drop(stdin);
            let status = child
                .wait()
                .map_err(|e| format!("ffmpeg wait failed: {}", e))?;
            if !status.success() {
                return Err(format!("ffmpeg exited with status {}", status));
            }
            Ok(())
        })
    });

    let mut state = CAPTURE_STATE.lock();
    state.recording_session = Some(RecordingSession {
        file_path: file_path.to_string_lossy().to_string(),
        stop_tx: Some(stop_tx),
        join_handle: Some(handle),
    });

    Ok(start_ts)
}

#[napi]
pub fn start_recording(options: RecordingOptions) -> Result<String> {
    let recording_dir = get_recording_dir();
    fs::create_dir_all(&recording_dir)
        .map_err(|e| Error::from_reason(format!("Failed to create recording dir: {}", e)))?;

    let file_name = options.file_name.clone().unwrap_or_else(|| {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("recording-{}.mp4", timestamp)
    });

    let file_path = recording_dir.join(timestamped_name(&file_name));
    let file_path_str = file_path.to_string_lossy().to_string();

    {
        let state = CAPTURE_STATE.lock();
        if !state.is_running {
            drop(state);
            crate::capture::start_capture(options.clone())?;
        }
    }

    start_mouse_button_listener();

    let start_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_file_path = Some(file_path_str.clone());
        state.recording_start_time = Some(start_time);
        state.mouse_events.clear();
        state.left_button_pressed = false;
        state.right_button_pressed = false;
        state.middle_button_pressed = false;
        state.last_button_state = MouseButtonState::None;
    }

    let (rec_tx, rec_rx) = tokio::sync::mpsc::channel::<InternalFrame>(120);
    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_frame_tx = Some(rec_tx);
    }

    let start_ts = start_ffmpeg_recording_internal(file_path.clone(), rec_rx)?;

    {
        let mut state = CAPTURE_STATE.lock();
        state.recording_start_time = Some(start_ts);
    }

    Ok(file_path_str)
}

#[napi]
pub fn stop_recording() -> Result<String> {
    eprintln!("stop_recording called");
    let (stop_tx, join_handle, file_path) = {
        let mut state = CAPTURE_STATE.lock();
        eprintln!("stop_recording: checking for active recording session");
        let session = state
            .recording_session
            .take()
            .ok_or_else(|| Error::from_reason("No recording session active"))?;

        let path = state.recording_file_path.clone();
        state.recording_file_path = None;
        state.recording_frame_tx = None;
        eprintln!("stop_recording: found active session, signaling stop");
        (session.stop_tx, session.join_handle, path)
    };

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
