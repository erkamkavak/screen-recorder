use napi::{bindgen_prelude::*, Error};
use napi_derive::napi;
use rdev::{listen, Button, Event, EventType};
use xcap::Monitor;

use crate::{
    cursor_shape,
    state::{InternalMouseEvent, MouseButtonState, CAPTURE_STATE, RDEV_LISTENER_STARTED},
    utils::{clamp_coordinate, get_mouse_position},
};

#[napi(object)]
#[derive(Clone)]
pub struct MouseEventRecord {
    pub timestamp_ms: i64,
    pub x: i32,
    pub y: i32,
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub button_state: String,
    pub is_pressed: bool,
    pub cursor_shape: String,
}

pub(crate) fn start_mouse_button_listener() {
    let mut started = RDEV_LISTENER_STARTED.lock();
    if *started {
        return;
    }
    *started = true;
    drop(started);

    std::thread::spawn(|| {
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

                    if state.recording_frame_tx.is_some() {
                        let (mouse_x, mouse_y) = get_mouse_position();
                        if let (Some(mx), Some(my)) = (mouse_x, mouse_y) {
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);

                            let sw = state.current_screen_width;
                            let sh = state.current_screen_height;
                            let origin_x = state.current_origin_x;
                            let origin_y = state.current_origin_y;

                            let is_pressed = state.left_button_pressed
                                || state.right_button_pressed
                                || state.middle_button_pressed;
                            drop(state);
                            let cursor_shape = cursor_shape::get_cursor_shape();
                            let mut state = CAPTURE_STATE.lock();
                            let local_x = clamp_coordinate(mx, origin_x, sw);
                            let local_y = clamp_coordinate(my, origin_y, sh);
                            state.mouse_events.push(InternalMouseEvent {
                                timestamp_unix_ms: timestamp,
                                x: local_x,
                                y: local_y,
                                screen_width: sw,
                                screen_height: sh,
                                button_state,
                                is_pressed,
                                cursor_shape,
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

                    if state.recording_frame_tx.is_some() {
                        let (mouse_x, mouse_y) = get_mouse_position();
                        if let (Some(mx), Some(my)) = (mouse_x, mouse_y) {
                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);

                            let sw = state.current_screen_width;
                            let sh = state.current_screen_height;
                            let origin_x = state.current_origin_x;
                            let origin_y = state.current_origin_y;

                            let is_pressed = state.left_button_pressed
                                || state.right_button_pressed
                                || state.middle_button_pressed;
                            drop(state);
                            let cursor_shape = cursor_shape::get_cursor_shape();
                            let mut state = CAPTURE_STATE.lock();
                            let local_x = clamp_coordinate(mx, origin_x, sw);
                            let local_y = clamp_coordinate(my, origin_y, sh);
                            state.mouse_events.push(InternalMouseEvent {
                                timestamp_unix_ms: timestamp,
                                x: local_x,
                                y: local_y,
                                screen_width: sw,
                                screen_height: sh,
                                button_state,
                                is_pressed,
                                cursor_shape,
                            });
                        }
                    }
                }
                _ => {}
            }
        };

        if let Err(e) = listen(callback) {
            eprintln!("rdev listen error: {:?}", e);
        }
    });
}

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
                cursor_shape: e.cursor_shape.clone(),
            }
        })
        .collect()
}

#[napi]
pub fn clear_recording_mouse_events() {
    let mut state = CAPTURE_STATE.lock();
    state.mouse_events.clear();
    state.recording_start_time = None;
}

#[napi]
pub fn get_current_mouse_position() -> Result<Option<MouseEventRecord>> {
    let (mouse_x, mouse_y) = get_mouse_position();

    match (mouse_x, mouse_y) {
        (Some(x), Some(y)) => {
            let monitors = Monitor::all().map_err(|e| Error::from_reason(e.to_string()))?;
            let (sw, sh) = monitors
                .first()
                .and_then(|m| m.capture_image().ok())
                .map(|img| (img.width(), img.height()))
                .unwrap_or((1920, 1080));

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            let state = CAPTURE_STATE.lock();
            let is_pressed = state.left_button_pressed
                || state.right_button_pressed
                || state.middle_button_pressed;

            drop(state);
            let cursor_shape = cursor_shape::get_cursor_shape();

            Ok(Some(MouseEventRecord {
                timestamp_ms: timestamp,
                x,
                y,
                normalized_x: x as f64 / sw as f64,
                normalized_y: y as f64 / sh as f64,
                button_state: "none".to_string(),
                is_pressed,
                cursor_shape,
            }))
        }
        _ => Ok(None),
    }
}
