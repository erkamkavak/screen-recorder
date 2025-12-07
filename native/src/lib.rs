#![deny(clippy::all)]

mod capture;
mod cursor_shape;
mod mouse_events;
mod recording;
mod state;
mod utils;

pub use capture::{
    list_sources, poll_frame, start_capture, stop_capture, DesktopSource, FrameData,
    RecordingOptions,
};
pub use mouse_events::{
    clear_recording_mouse_events, get_current_mouse_position, get_recording_mouse_events,
};
pub use recording::{start_recording, stop_recording};
