// Cursor shape detection module
// Platform-specific implementations for capturing the current cursor shape/type

/// Get the current cursor shape name.
/// Returns a normalized cursor shape string like "default", "pointer", "text", etc.
/// Falls back to "default" if detection fails or is unsupported on the current platform.
pub fn get_cursor_shape() -> String {
    #[cfg(target_os = "linux")]
    {
        linux::get_cursor_shape_x11().unwrap_or_else(|| "default".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        windows::get_cursor_shape_win32().unwrap_or_else(|| "default".to_string())
    }
    
    #[cfg(target_os = "macos")]
    {
        macos::get_cursor_shape_cocoa().unwrap_or_else(|| "default".to_string())
    }
    
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "default".to_string()
    }
}

/// Convert cursor serial number to simplified shape category
#[allow(dead_code)]
pub fn normalize_cursor_serial(serial: u32) -> String {
    match serial {
        16619 => "default".to_string(),
        16621 => "text".to_string(), 
        16622 => "pointer".to_string(),
        _ => "default".to_string(), // Default for any other serial
    }
}

// Linux-specific implementation using X11 XFIXES extension
#[cfg(target_os = "linux")]
mod linux {
    use std::sync::OnceLock;
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use x11rb::rust_connection::RustConnection;
    use x11rb::protocol::xfixes::{self};
    
    // Cache the X11 connection to avoid reconnecting on every call
    static X11_CONNECTION: OnceLock<Option<RustConnection>> = OnceLock::new();
    // Cache the last cursor hash to reduce log spam
    static LAST_CURSOR_HASH: std::sync::Mutex<u64> = std::sync::Mutex::new(0);
    
    fn get_connection() -> Option<&'static RustConnection> {
        X11_CONNECTION.get_or_init(|| {
            // Check if running under Wayland
            if std::env::var("WAYLAND_DISPLAY").is_ok() {
                eprintln!("Running under Wayland - X11 cursor names may not be available via XWayland");
            }
            
            match x11rb::connect(None) {
                Ok((conn, _screen_num)) => {
                    // Query XFIXES extension version (required before using it)
                    let version_cookie = xfixes::query_version(&conn, 5, 0);
                    if version_cookie.is_ok() && version_cookie.unwrap().reply().is_ok() {
                        eprintln!("X11 connection established for cursor shape detection");
                        Some(conn)
                    } else {
                        eprintln!("Failed to initialize XFIXES extension");
                        None
                    }
                }
                Err(e) => {
                    eprintln!("Failed to connect to X11 display: {:?}", e);
                    None
                }
            }
        }).as_ref()
    }
    
    /// Get cursor shape from X11 using XFIXES extension.
    /// Returns None if X11 is not available or the operation fails.
    pub fn get_cursor_shape_x11() -> Option<String> {
        // Wrap in catch_unwind to handle any panics from x11rb
        std::panic::catch_unwind(|| {
            get_cursor_shape_x11_inner()
        })
        .ok()
        .flatten()
    }
    
    fn get_cursor_shape_x11_inner() -> Option<String> {
        let conn = get_connection()?;
        
        // Get cursor image and name
        let cursor_cookie = xfixes::get_cursor_image_and_name(conn).ok()?;
        let reply = cursor_cookie.reply().ok()?;
        let cursor_hash = hash_cursor_image(&reply.cursor_image);

        // Try fetching the symbolic cursor name via XFIXES get_cursor_name
        let cursor_name = xfixes::get_cursor_name(conn, reply.cursor_serial)
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|name_reply| String::from_utf8_lossy(&name_reply.name).into_owned())
            .filter(|name| !name.is_empty());

        let normalized = cursor_name
            .as_deref()
            .map(normalize_cursor_atom_name)
            .or_else(|| hash_to_shape(cursor_hash))
            .unwrap_or_else(|| super::normalize_cursor_serial(reply.cursor_serial));

        // Only log when cursor identifier changes to reduce spam
        if let Ok(mut last_hash) = LAST_CURSOR_HASH.lock() {
            if *last_hash != cursor_hash {
                eprintln!("Cursor changed to: {} (cursor name: {:?})", normalized, cursor_name.as_deref());
                *last_hash = cursor_hash;
            }
        }
        
        Some(normalized)
    }

    fn hash_cursor_image(image: &[u32]) -> u64 {
        let mut hasher = DefaultHasher::new();
        image.hash(&mut hasher);
        hasher.finish()
    }

    fn hash_to_shape(hash: u64) -> Option<String> {
        match hash {
            0x897f65b9841ee54e => Some("default".to_string()),
            0xaac1bd00c4f8e6fd => Some("text".to_string()),
            0x9bcb1658bceac2a6 => Some("pointer".to_string()),
            _ => None,
        }
    }

    fn normalize_cursor_atom_name(name: &str) -> String {
        let lower = name.to_ascii_lowercase();
        if lower.contains("ibeam") || lower.contains("text") || lower.contains("xterm") {
            "text".to_string()
        } else if lower.contains("hand") || lower.contains("pointer") || lower.contains("left_ptr") || lower.contains("right_ptr") {
            "pointer".to_string()
        } else if lower.contains("watch") || lower.contains("wait") {
            "wait".to_string()
        } else {
            "default".to_string()
        }
    }
}

// Windows-specific implementation using Win32 API
#[cfg(target_os = "windows")]
mod windows {
    use std::sync::Mutex;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorInfo, CURSORINFO, CURSOR_SHOWING,
        IDC_ARROW, IDC_IBEAM, IDC_WAIT, IDC_CROSS, IDC_UPARROW,
        IDC_SIZENWSE, IDC_SIZENESW, IDC_SIZEWE, IDC_SIZENS, IDC_SIZEALL,
        IDC_NO, IDC_HAND, IDC_APPSTARTING, IDC_HELP,
        LoadCursorW,
    };
    use windows::Win32::Foundation::HINSTANCE;
    use std::sync::OnceLock;
    
    // Cache last cursor handle to reduce log spam
    static LAST_CURSOR_HANDLE: Mutex<isize> = Mutex::new(0);
    // Cache system cursor handles for comparison
    static SYSTEM_CURSORS: OnceLock<SystemCursors> = OnceLock::new();
    
    struct SystemCursors {
        arrow: isize,
        ibeam: isize,
        wait: isize,
        cross: isize,
        uparrow: isize,
        sizenwse: isize,
        sizenesw: isize,
        sizewe: isize,
        sizens: isize,
        sizeall: isize,
        no: isize,
        hand: isize,
        appstarting: isize,
        help: isize,
    }
    
    fn get_system_cursors() -> &'static SystemCursors {
        SYSTEM_CURSORS.get_or_init(|| {
            unsafe {
                SystemCursors {
                    arrow: LoadCursorW(HINSTANCE::default(), IDC_ARROW).map(|h| h.0 as isize).unwrap_or(0),
                    ibeam: LoadCursorW(HINSTANCE::default(), IDC_IBEAM).map(|h| h.0 as isize).unwrap_or(0),
                    wait: LoadCursorW(HINSTANCE::default(), IDC_WAIT).map(|h| h.0 as isize).unwrap_or(0),
                    cross: LoadCursorW(HINSTANCE::default(), IDC_CROSS).map(|h| h.0 as isize).unwrap_or(0),
                    uparrow: LoadCursorW(HINSTANCE::default(), IDC_UPARROW).map(|h| h.0 as isize).unwrap_or(0),
                    sizenwse: LoadCursorW(HINSTANCE::default(), IDC_SIZENWSE).map(|h| h.0 as isize).unwrap_or(0),
                    sizenesw: LoadCursorW(HINSTANCE::default(), IDC_SIZENESW).map(|h| h.0 as isize).unwrap_or(0),
                    sizewe: LoadCursorW(HINSTANCE::default(), IDC_SIZEWE).map(|h| h.0 as isize).unwrap_or(0),
                    sizens: LoadCursorW(HINSTANCE::default(), IDC_SIZENS).map(|h| h.0 as isize).unwrap_or(0),
                    sizeall: LoadCursorW(HINSTANCE::default(), IDC_SIZEALL).map(|h| h.0 as isize).unwrap_or(0),
                    no: LoadCursorW(HINSTANCE::default(), IDC_NO).map(|h| h.0 as isize).unwrap_or(0),
                    hand: LoadCursorW(HINSTANCE::default(), IDC_HAND).map(|h| h.0 as isize).unwrap_or(0),
                    appstarting: LoadCursorW(HINSTANCE::default(), IDC_APPSTARTING).map(|h| h.0 as isize).unwrap_or(0),
                    help: LoadCursorW(HINSTANCE::default(), IDC_HELP).map(|h| h.0 as isize).unwrap_or(0),
                }
            }
        })
    }
    
    pub fn get_cursor_shape_win32() -> Option<String> {
        std::panic::catch_unwind(|| {
            get_cursor_shape_win32_inner()
        })
        .ok()
        .flatten()
    }
    
    fn get_cursor_shape_win32_inner() -> Option<String> {
        unsafe {
            let mut cursor_info: CURSORINFO = std::mem::zeroed();
            cursor_info.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
            
            if GetCursorInfo(&mut cursor_info).is_ok() {
                // Check if cursor is visible
                if cursor_info.flags.0 & CURSOR_SHOWING.0 == 0 {
                    return Some("default".to_string());
                }
                
                let hcursor = cursor_info.hCursor.0 as isize;
                let cursors = get_system_cursors();
                
                // Map cursor handle to known system cursors
                let shape = if hcursor == cursors.arrow {
                    "default"
                } else if hcursor == cursors.ibeam {
                    "text"
                } else if hcursor == cursors.hand {
                    "pointer"
                } else if hcursor == cursors.wait {
                    "wait"
                } else if hcursor == cursors.cross {
                    "crosshair"
                } else if hcursor == cursors.sizeall {
                    "move"
                } else if hcursor == cursors.sizens {
                    "ns-resize"
                } else if hcursor == cursors.sizewe {
                    "ew-resize"
                } else if hcursor == cursors.sizenwse {
                    "nwse-resize"
                } else if hcursor == cursors.sizenesw {
                    "nesw-resize"
                } else if hcursor == cursors.no {
                    "not-allowed"
                } else if hcursor == cursors.help {
                    "help"
                } else if hcursor == cursors.appstarting {
                    "progress"
                } else {
                    "default"
                };
                
                // Only log when cursor changes
                if let Ok(mut last_handle) = LAST_CURSOR_HANDLE.lock() {
                    if *last_handle != hcursor {
                        eprintln!("Cursor changed to: {} (handle: {})", shape, hcursor);
                        *last_handle = hcursor;
                    }
                }
                
                Some(shape.to_string())
            } else {
                None
            }
        }
    }
}

// macOS-specific implementation using Cocoa/AppKit
#[cfg(target_os = "macos")]
mod macos {
    use std::sync::Mutex;
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    
    // Cache last cursor pointer to reduce log spam
    static LAST_CURSOR_PTR: Mutex<usize> = Mutex::new(0);
    
    pub fn get_cursor_shape_cocoa() -> Option<String> {
        std::panic::catch_unwind(|| {
            get_cursor_shape_cocoa_inner()
        })
        .ok()
        .flatten()
    }
    
    fn get_cursor_shape_cocoa_inner() -> Option<String> {
        unsafe {
            // Get the current system cursor
            let nscursor_class = class!(NSCursor);
            let current_cursor: *mut Object = msg_send![nscursor_class, currentSystemCursor];
            
            if current_cursor.is_null() {
                return Some("default".to_string());
            }
            
            let cursor_ptr = current_cursor as usize;
            
            // Get standard cursors for comparison
            let arrow_cursor: *mut Object = msg_send![nscursor_class, arrowCursor];
            let ibeam_cursor: *mut Object = msg_send![nscursor_class, IBeamCursor];
            let pointing_hand_cursor: *mut Object = msg_send![nscursor_class, pointingHandCursor];
            let crosshair_cursor: *mut Object = msg_send![nscursor_class, crosshairCursor];
            let open_hand_cursor: *mut Object = msg_send![nscursor_class, openHandCursor];
            let closed_hand_cursor: *mut Object = msg_send![nscursor_class, closedHandCursor];
            let resize_left_right_cursor: *mut Object = msg_send![nscursor_class, resizeLeftRightCursor];
            let resize_up_down_cursor: *mut Object = msg_send![nscursor_class, resizeUpDownCursor];
            let operation_not_allowed_cursor: *mut Object = msg_send![nscursor_class, operationNotAllowedCursor];
            
            // Compare current cursor with known cursors
            let shape = if current_cursor == arrow_cursor {
                "default"
            } else if current_cursor == ibeam_cursor {
                "text"
            } else if current_cursor == pointing_hand_cursor {
                "pointer"
            } else if current_cursor == crosshair_cursor {
                "crosshair"
            } else if current_cursor == open_hand_cursor {
                "grab"
            } else if current_cursor == closed_hand_cursor {
                "grabbing"
            } else if current_cursor == resize_left_right_cursor {
                "ew-resize"
            } else if current_cursor == resize_up_down_cursor {
                "ns-resize"
            } else if current_cursor == operation_not_allowed_cursor {
                "not-allowed"
            } else {
                "default"
            };
            
            // Only log when cursor changes
            if let Ok(mut last_ptr) = LAST_CURSOR_PTR.lock() {
                if *last_ptr != cursor_ptr {
                    eprintln!("Cursor changed to: {} (ptr: {})", shape, cursor_ptr);
                    *last_ptr = cursor_ptr;
                }
            }
            
            Some(shape.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_cursor_serial() {
        assert_eq!(normalize_cursor_serial(16619), "default");
        assert_eq!(normalize_cursor_serial(16621), "text");
        assert_eq!(normalize_cursor_serial(16622), "pointer");
        assert_eq!(normalize_cursor_serial(99999), "default"); // Unknown serial
    }
    
    #[test]
    fn test_get_cursor_shape_does_not_panic() {
        // This should not panic even if X11 is not available
        let _shape = get_cursor_shape();
    }
}
