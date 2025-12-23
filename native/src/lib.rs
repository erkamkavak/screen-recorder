#![deny(clippy::all)]

mod capture;
mod cursor_shape;
mod mouse_events;
mod recording;
#[path = "transcription/mod.rs"]
mod transcription;
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
pub use transcription::{
    transcription_cancel, transcription_get_job, transcription_get_result,
    transcription_list_providers, transcription_submit, SubmitTranscriptionRequest, Transcript,
    TranscriptSegment, TranscriptionJobInfo, TranscriptionJobSnapshot,
};
pub use transcription::model_manager::{
    model_cancel_download, model_delete, model_download, model_get_info, model_get_path,
    model_list_available, model_refresh_status, DownloadProgress, ModelInfo,
};
