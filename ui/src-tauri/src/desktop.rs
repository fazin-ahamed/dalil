//! Windows tray and global shortcuts. Input bindings belong to a dedicated Windows message thread.

const SHORTCUTS: [(&str, &str, &str); 3] = [
    ("toggle", "Show / hide Dalil", "Ctrl+Alt+Space"),
    ("talk", "Talk to Dalil", "Ctrl+Alt+Shift+Space"),
    ("hide", "Hide and stop screen control", "Ctrl+Alt+Esc"),
];

fn shortcut_command(id: usize) -> Option<&'static str> {
    id.checked_sub(1).and_then(|index| SHORTCUTS.get(index)).map(|binding| binding.0)
}

#[cfg(windows)]
#[derive(Default)]
struct DesktopState(std::sync::Mutex<[bool; 3]>);

#[cfg(windows)]
pub fn shortcuts(app: &tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    use tauri::Manager;
    let state = app.try_state::<DesktopState>().ok_or("shortcuts-unavailable")?;
    let registered = state.0.lock().map_err(|_| "shortcuts-unavailable")?;
    Ok(SHORTCUTS.iter().enumerate().map(|(index, (command, label, keys))| {
        serde_json::json!({ "command": command, "label": label, "keys": keys, "registered": registered[index] })
    }).collect())
}

#[cfg(windows)]
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager};
    use windows_sys::Win32::UI::{
        Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_NOREPEAT, VK_SPACE, VK_ESCAPE},
        WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY},
    };

    let items: Vec<_> = SHORTCUTS.iter().map(|(id, title, keys)| MenuItem::with_id(app, *id, *title, true, Some(*keys))).collect::<tauri::Result<_>>()?;
    let settings = MenuItem::with_id(app, "setup", "Settings", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "quit", "Exit Dalil", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&items[0], &items[1], &items[2], &settings, &separator, &exit])?;
    let icon = app.default_window_icon().ok_or("Dalil tray icon is missing")?.clone();
    let tray = TrayIconBuilder::with_id("dalil")
        .icon(icon)
        .tooltip("Dalil - click to open, right-click for shortcuts and Exit")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let command = match event.id.as_ref() {
                "toggle" => "toggle", "talk" => "talk", "hide" => "hide", "setup" => "setup", "quit" => "quit",
                _ => return,
            };
            super::handle_command(app, command);
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }
                | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }) {
                super::handle_command(tray.app_handle(), "ask");
            }
        })
        .build(app)?;
    app.manage(DesktopState::default());
    let handle = app.clone();
    std::thread::Builder::new().name("dalil-shortcuts".into()).spawn(move || {
        let combinations = [(MOD_CONTROL | MOD_ALT, VK_SPACE), (MOD_CONTROL | MOD_ALT | MOD_SHIFT, VK_SPACE), (MOD_CONTROL | MOD_ALT, VK_ESCAPE)];
        let mut registered = [false; 3];
        for (index, (modifiers, key)) in combinations.into_iter().enumerate() {
            // SAFETY: fixed key codes, thread-owned IDs, and no pointer or user-provided window handle.
            registered[index] = unsafe { RegisterHotKey(std::ptr::null_mut(), index as i32 + 1, modifiers | MOD_NOREPEAT, u32::from(key)) } != 0;
        }
        if let Ok(mut state) = handle.state::<DesktopState>().0.lock() { *state = registered; }
        let _ = handle.emit_to("notch", "dalil://shortcuts-changed", shortcuts(&handle).unwrap_or_default());
        for (index, available) in registered.iter().enumerate() {
            if !available {
                let _ = items[index].set_accelerator(None::<&str>);
                let _ = items[index].set_text(format!("{} (shortcut unavailable)", SHORTCUTS[index].1));
            }
        }
        if registered.iter().any(|available| !available) {
            let _ = tray.set_tooltip(Some("Dalil - some shortcuts are already in use; use the tray menu"));
        }
        let mut message: MSG = unsafe { std::mem::zeroed() };
        // SAFETY: GetMessageW initializes the owned MSG; no application window procedure is replaced.
        while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
            if message.message == WM_HOTKEY {
                if let Some(command) = shortcut_command(message.wParam) { super::handle_command(&handle, command); }
            }
        }
        for (index, available) in registered.into_iter().enumerate() {
            if available { unsafe { UnregisterHotKey(std::ptr::null_mut(), index as i32 + 1); } }
        }
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_registered_shortcut_ids_dispatch_commands() {
        assert_eq!(shortcut_command(1), Some("toggle"));
        assert_eq!(shortcut_command(2), Some("talk"));
        assert_eq!(shortcut_command(3), Some("hide"));
        assert_eq!(shortcut_command(0), None);
        assert_eq!(shortcut_command(4), None);
        assert_eq!(shortcut_command(usize::MAX), None);
    }
}

#[cfg(windows)]
pub(crate) fn exclude_from_capture(window: &tauri::WebviewWindow) {
    if let Ok(handle) = window.hwnd() {
        // Dalil's teaching UI must not become the screen the tutor tries to explain or click.
        unsafe { windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(handle.0 as _, 0x11); }
    }
}
