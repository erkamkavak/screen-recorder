use parking_lot::Mutex;
use std::{sync::Arc, thread};
use tokio::runtime::{Builder, Runtime};

#[derive(Clone)]
pub struct InternalFrame {
    pub width: u32,
    pub height: u32,
    pub timestamp_ms: u64,
    pub pixels: Vec<u8>,
    pub mouse_x: Option<i32>,
    pub mouse_y: Option<i32>,
    pub origin_x: i32,
    pub origin_y: i32,
}

#[derive(Clone)]
pub struct InternalMouseEvent {
    pub timestamp_unix_ms: u64,
    pub x: i32,
    pub y: i32,
    pub screen_width: u32,
    pub screen_height: u32,
    pub button_state: MouseButtonState,
    pub is_pressed: bool,
    pub cursor_shape: String,
}

#[derive(Clone)]
pub struct CaptureTarget {
    pub id: String,
    pub capture_type: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MouseButtonState {
    None,
    LeftDown,
    LeftUp,
    RightDown,
    RightUp,
    MiddleDown,
    MiddleUp,
}

pub struct RecordingSession {
    pub file_path: String,
    pub stop_tx: Option<std::sync::mpsc::Sender<()>>,
    pub join_handle: Option<thread::JoinHandle<std::result::Result<(), String>>>,
}

pub struct CaptureState {
    pub is_running: bool,
    pub frame_rate: u32,
    pub target: Option<CaptureTarget>,
    pub frame_tx: Option<tokio::sync::broadcast::Sender<InternalFrame>>,
    pub stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub recording_file_path: Option<String>,
    pub recording_session: Option<RecordingSession>,
    pub recording_frame_tx: Option<tokio::sync::mpsc::Sender<InternalFrame>>,
    pub recording_start_time: Option<u64>,
    pub mouse_events: Vec<InternalMouseEvent>,
    pub left_button_pressed: bool,
    pub right_button_pressed: bool,
    pub middle_button_pressed: bool,
    pub last_button_state: MouseButtonState,
    pub current_screen_width: u32,
    pub current_screen_height: u32,
    pub current_origin_x: i32,
    pub current_origin_y: i32,
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
            current_origin_x: 0,
            current_origin_y: 0,
        }
    }
}

lazy_static::lazy_static! {
    pub static ref CAPTURE_STATE: Arc<Mutex<CaptureState>> = Arc::new(Mutex::new(CaptureState::default()));
    pub static ref TOKIO_RUNTIME: Runtime = Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("Failed to create Tokio runtime");
    pub static ref RDEV_LISTENER_STARTED: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
}
