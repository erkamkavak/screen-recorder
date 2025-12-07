use mouse_position::mouse_position::Mouse;
use std::{
    env, fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

/// Directory used for temporary recording storage.
pub(crate) const RECORDING_DIR_NAME: &str = "clips-recordings";
const MAX_I32_AS_U32: u32 = i32::MAX as u32;

/// Clamp a mouse coordinate to the capture region.
pub(crate) fn clamp_coordinate(value: i32, origin: i32, limit: u32) -> i32 {
    let max_coord = limit.min(MAX_I32_AS_U32) as i32;
    (value - origin).clamp(0, max_coord)
}

/// Return the current mouse position if it can be queried.
pub(crate) fn get_mouse_position() -> (Option<i32>, Option<i32>) {
    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (Some(x), Some(y)),
        Mouse::Error => (None, None),
    }
}

/// Ensure the recording output directory exists.
pub(crate) fn get_recording_dir() -> PathBuf {
    let mut base = env::temp_dir();
    base.push(RECORDING_DIR_NAME);
    fs::create_dir_all(&base).ok();
    base
}

/// Prefix a file name with a millisecond-resolution timestamp.
pub(crate) fn timestamped_name(file_name: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{}-{}", now, file_name)
}
