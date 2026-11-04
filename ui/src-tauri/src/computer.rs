//! Bounded desktop input, available only during an explicitly enabled task in the notch.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{State, WebviewWindow};

#[derive(Default)]
pub struct ComputerState(Arc<Mutex<Option<String>>>);

#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
pub struct ScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum ComputerAction {
    Click { x: f64, y: f64, button: Option<String>, #[serde(default)] double: bool },
    Type { text: String },
    Key { keys: Vec<String> },
    Scroll { direction: String, amount: u32 },
}

#[derive(Serialize)]
pub struct Capabilities {
    supported: bool,
    reason: &'static str,
}

#[cfg(target_os = "linux")]
fn installed(program: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|paths| std::env::split_paths(&paths).any(|path| path.join(program).is_file()))
}

#[tauri::command]
pub fn computer_capabilities() -> Capabilities {
    #[cfg(windows)]
    return Capabilities { supported: true, reason: "Controls the captured display using Windows input." };
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return Capabilities {
                supported: installed("ydotool") && installed("wtype") && installed("niri"),
                reason: "Wayland needs niri, wtype, a running ydotoold, one display at 100% scale and flat pointer acceleration.",
            };
        }
    }
    Capabilities { supported: false, reason: "Computer control is available on Windows and niri Wayland; screen explanations and web search still work here." }
}

#[tauri::command]
pub fn computer_begin(app: tauri::AppHandle, window: WebviewWindow, state: State<'_, ComputerState>, session: String) -> Result<(), String> {
    if window.label() != "notch" || session.len() < 16 || session.len() > 80 || !computer_capabilities().supported {
        return Err("computer-unavailable".into());
    }
    if !crate::capture::screenshots_allowed(&app) { return Err("computer-no-screen".into()); }
    let mut current = state.0.lock().map_err(|_| "computer-unavailable")?;
    if current.is_some() { return Err("computer-busy".into()); }
    *current = Some(session);
    Ok(())
}

#[tauri::command]
pub fn computer_end(window: WebviewWindow, state: State<'_, ComputerState>, session: String) -> Result<(), String> {
    if window.label() != "notch" { return Err("computer-disabled".into()); }
    let mut current = state.0.lock().map_err(|_| "computer-disabled")?;
    if current.as_deref() == Some(&session) { *current = None; }
    Ok(())
}

fn permitted(grant: &Mutex<Option<String>>, session: &str) -> Result<(), String> {
    if grant.lock().map_err(|_| "computer-disabled")?.as_deref() != Some(session) {
        return Err("computer-disabled".into());
    }
    Ok(())
}

fn validate(action: &ComputerAction) -> Result<(), String> {
    let valid = match action {
        ComputerAction::Click { x, y, button, .. } => x.is_finite() && y.is_finite()
            && (0.0..=1000.0).contains(x) && (0.0..=1000.0).contains(y)
            && matches!(button.as_deref(), None | Some("left" | "right")),
        ComputerAction::Type { text } => !text.is_empty() && text.len() <= 16_000 && !text.contains('\0'),
        ComputerAction::Key { keys } => !keys.is_empty() && keys.len() <= 4
            && keys.iter().all(|key| key_code(key).is_some())
            && keys[..keys.len() - 1].iter().all(|key| matches!(key.as_str(), "CTRL" | "ALT" | "SHIFT" | "SUPER"))
            && !matches!(keys.last().map(String::as_str), Some("CTRL" | "ALT" | "SHIFT" | "SUPER")),
        ComputerAction::Scroll { direction, amount } => matches!(direction.as_str(), "up" | "down") && (1..=8).contains(amount),
    };
    if valid { Ok(()) } else { Err("bad-action".into()) }
}

fn key_code(key: &str) -> Option<u16> {
    Some(match key {
        "CTRL" => 0x11, "ALT" => 0x12, "SHIFT" => 0x10, "SUPER" => 0x5B,
        "ENTER" => 0x0D, "TAB" => 0x09, "ESC" => 0x1B, "BACKSPACE" => 0x08,
        "DELETE" => 0x2E, "SPACE" => 0x20, "HOME" => 0x24, "END" => 0x23,
        "PAGEUP" => 0x21, "PAGEDOWN" => 0x22, "UP" => 0x26, "DOWN" => 0x28,
        "LEFT" => 0x25, "RIGHT" => 0x27,
        _ if key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric() && key == key.to_uppercase() => key.as_bytes()[0] as u16,
        _ if key.starts_with('F') => 0x6F + key[1..].parse::<u16>().ok().filter(|n| (1..=12).contains(n))?,
        _ => return None,
    })
}

fn pixels(x: f64, y: f64, screen: ScreenBounds) -> (i32, i32) {
    (screen.x + (x / 1000.0 * f64::from(screen.width - 1)).round() as i32,
     screen.y + (y / 1000.0 * f64::from(screen.height - 1)).round() as i32)
}

#[cfg(any(target_os = "linux", test))]
pub(crate) fn niri_bounds(output: &serde_json::Value) -> Option<ScreenBounds> {
    let logical = output.get("logical")?;
    let number = |name| i32::try_from(logical.get(name)?.as_i64()?).ok();
    let screen = ScreenBounds { x: number("x")?, y: number("y")?, width: number("width")?, height: number("height")? };
    (screen.width > 0 && screen.height > 0).then_some(screen)
}

#[cfg(target_os = "linux")]
fn wayland_screen() -> Result<ScreenBounds, String> {
    let json = crate::context::run("niri", &["msg", "--json", "outputs"]).ok_or("computer-display-unavailable")?;
    let outputs: serde_json::Value = serde_json::from_str(&json).map_err(|_| "computer-display-unavailable")?;
    let active: Vec<_> = outputs.as_object().ok_or("computer-display-unavailable")?.values()
        .filter(|output| !output["logical"].is_null()).collect();
    let output = active.first().filter(|_| active.len() == 1).ok_or("computer-display-unavailable")?;
    let screen = niri_bounds(output).ok_or("computer-display-unavailable")?;
    if screen.x != 0 || screen.y != 0 || output["logical"]["scale"].as_f64() != Some(1.0)
        || output["logical"]["transform"].as_str() != Some("Normal") {
        return Err("computer-display-unavailable".into());
    }
    Ok(screen)
}

#[tauri::command]
pub async fn computer_action(
    app: tauri::AppHandle, window: WebviewWindow, state: State<'_, ComputerState>, session: String,
    action: ComputerAction, screen: ScreenBounds,
) -> Result<(), String> {
    if window.label() != "notch" { return Err("computer-disabled".into()); }
    permitted(&state.0, &session)?;
    if !crate::capture::screenshots_allowed(&app) { return Err("computer-disabled".into()); }
    validate(&action)?;
    if screen.width < 1 || screen.height < 1 || screen.width > 32_768 || screen.height > 32_768 {
        return Err("computer-display-unavailable".into());
    }
    #[cfg(windows)]
    if !window.available_monitors().map_err(|_| "computer-display-unavailable")?.iter().any(|monitor| {
        let p = monitor.position(); let s = monitor.size();
        screen == ScreenBounds { x: p.x, y: p.y, width: s.width as i32, height: s.height as i32 }
    }) { return Err("computer-display-unavailable".into()); }
    #[cfg(windows)]
    if !matches!(&action, ComputerAction::Click { .. }) {
        let own = window.hwnd().map_err(|_| "computer-focus")?.0 as isize;
        // SAFETY: only compares handles; input never goes to Dalil's composer or settings.
        if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() } as isize == own {
            return Err("computer-focus".into());
        }
    }
    let grant = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        permitted(&grant, &session)?;
        #[cfg(target_os = "linux")]
        {
            if screen != wayland_screen()? { return Err("computer-display-unavailable".into()); }
            return linux_input(&action, screen, &grant, &session);
        }
        #[cfg(windows)]
        return windows_input(&action, screen);
        #[cfg(not(any(target_os = "linux", windows)))]
        Err("computer-unavailable".into())
    }).await.map_err(|_| "computer-unavailable".to_string())?
}

#[cfg(target_os = "linux")]
fn linux_input(action: &ComputerAction, screen: ScreenBounds, grant: &Mutex<Option<String>>, session: &str) -> Result<(), String> {
    use std::{process::{Command, Stdio}, thread, time::{Duration, Instant}};
    let run = |program: &str, args: &[String]| -> Result<(), String> {
        permitted(grant, session)?;
        let mut child = Command::new(program).args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|_| "computer-helper-unavailable")?;
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => return if status.success() { Ok(()) } else { Err("computer-helper-unavailable".into()) },
                // A click finishes its button-up even when stopped; killing it mid-click can leave a button held.
                Ok(None) if Instant::now() < deadline && (permitted(grant, session).is_ok() || (program == "ydotool" && args.first().is_some_and(|arg| arg == "click"))) => thread::sleep(Duration::from_millis(10)),
                _ => { let _ = child.kill(); let _ = child.wait(); return Err("computer-stopped".into()); }
            }
        }
    };
    match action {
        ComputerAction::Click { x, y, button, double } => {
            let (x, y) = pixels(*x, *y, screen);
            // shortcut: ydotool absolute motion requires flat acceleration; use a compositor pointer protocol for other setups.
            run("ydotool", &["mousemove".into(), "--absolute".into(), "--".into(), x.to_string(), y.to_string()])?;
            run("ydotool", &["click".into(), "--repeat".into(), if *double { "2" } else { "1" }.into(),
                if button.as_deref() == Some("right") { "0xC1" } else { "0xC0" }.into()])
        }
        ComputerAction::Type { text } => run("wtype", &["--".into(), text.clone()]),
        ComputerAction::Key { keys } => {
            let mut args = Vec::new();
            let modifier = |key: &str| match key { "CTRL" => "ctrl", "ALT" => "alt", "SHIFT" => "shift", _ => "logo" }.to_string();
            for key in &keys[..keys.len() - 1] { args.extend(["-M".into(), modifier(key)]); }
            let key = keys.last().unwrap();
            let name = match key.as_str() {
                "ENTER" => "Return".into(), "ESC" => "Escape".into(), "BACKSPACE" => "BackSpace".into(),
                "PAGEUP" => "Prior".into(), "PAGEDOWN" => "Next".into(), "SPACE" => "space".into(),
                "TAB" => "Tab".into(), "DELETE" => "Delete".into(), "HOME" => "Home".into(), "END" => "End".into(),
                "UP" => "Up".into(), "DOWN" => "Down".into(), "LEFT" => "Left".into(), "RIGHT" => "Right".into(),
                _ if key.starts_with('F') && key.len() > 1 => key.clone(), _ => key.to_lowercase(),
            };
            args.extend(["-k".into(), name]);
            for key in keys[..keys.len() - 1].iter().rev() { args.extend(["-m".into(), modifier(key)]); }
            run("wtype", &args)
        }
        ComputerAction::Scroll { direction, amount } => run("ydotool", &["mousemove".into(), "--wheel".into(), "--".into(), "0".into(),
            (if direction == "up" { *amount as i32 } else { -(*amount as i32) }).to_string()]),
    }
}

#[cfg(windows)]
fn windows_input(action: &ComputerAction, screen: ScreenBounds) -> Result<(), String> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::SetCursorPos};
    let key = |code, scan, flags| INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: code, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
    let mouse = |flags, data| INPUT { r#type: INPUT_MOUSE, Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: data, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
    let mut inputs = Vec::new();
    match action {
        ComputerAction::Click { x, y, button, double } => {
            let (x, y) = pixels(*x, *y, screen);
            // SAFETY: bounded screen coordinates and initialized INPUT structures; no borrowed pointers escape.
            if unsafe { SetCursorPos(x, y) } == 0 { return Err("computer-input-blocked".into()); }
            let (down, up) = if button.as_deref() == Some("right") { (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP) } else { (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP) };
            for _ in 0..if *double { 2 } else { 1 } { inputs.extend([mouse(down, 0), mouse(up, 0)]); }
        }
        ComputerAction::Type { text } => for unit in text.encode_utf16() { inputs.extend([key(0, unit, KEYEVENTF_UNICODE), key(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)]); },
        ComputerAction::Key { keys } => {
            for name in keys { inputs.push(key(key_code(name).ok_or("bad-action")?, 0, 0)); }
            for name in keys.iter().rev() { inputs.push(key(key_code(name).ok_or("bad-action")?, 0, KEYEVENTF_KEYUP)); }
        }
        ComputerAction::Scroll { direction, amount } => inputs.push(mouse(MOUSEEVENTF_WHEEL, (if direction == "up" { 120 * *amount as i32 } else { -120 * *amount as i32 }) as u32)),
    }
    // SAFETY: the initialized slice remains alive for the synchronous SendInput call.
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        // Release modifiers even if Windows accepted only part of a chord.
        let mut release: [INPUT; 4] = unsafe { zeroed() };
        for (input, code) in release.iter_mut().zip([0x11, 0x12, 0x10, 0x5B]) { *input = key(code, 0, KEYEVENTF_KEYUP); }
        unsafe { SendInput(release.len() as u32, release.as_ptr(), size_of::<INPUT>() as i32); }
        return Err("computer-input-blocked".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edges_map_inside_the_captured_monitor_including_negative_origins() {
        let screen = ScreenBounds { x: -1920, y: 200, width: 1920, height: 1080 };
        assert_eq!(pixels(0.0, 0.0, screen), (-1920, 200));
        assert_eq!(pixels(1000.0, 1000.0, screen), (-1, 1279));
    }
    #[test]
    fn rejects_bad_input_and_modifier_only_chords() {
        assert!(validate(&ComputerAction::Click { x: f64::NAN, y: 1.0, button: None, double: false }).is_err());
        assert!(validate(&ComputerAction::Type { text: "a\0b".into() }).is_err());
        assert!(validate(&ComputerAction::Key { keys: vec!["CTRL".into()] }).is_err());
        assert!(validate(&ComputerAction::Key { keys: vec!["CTRL".into(), "L".into()] }).is_ok());
        assert!(validate(&ComputerAction::Key { keys: vec!["CTRL".into(), "exec anything".into()] }).is_err());
        assert!(validate(&ComputerAction::Scroll { direction: "down".into(), amount: 1000 }).is_err());
    }
    #[test]
    fn ending_an_old_session_cannot_authorize_another_task() {
        let grant = Mutex::new(Some("new-task".to_string()));
        assert!(permitted(&grant, "old-task").is_err());
        assert!(permitted(&grant, "new-task").is_ok());
        *grant.lock().unwrap() = None;
        assert!(permitted(&grant, "new-task").is_err());
    }
    #[test]
    fn reads_niri_coordinates_without_image_scaling() {
        assert_eq!(niri_bounds(&serde_json::json!({"logical":{"x":0,"y":0,"width":1920,"height":1080}})), Some(ScreenBounds { x: 0, y: 0, width: 1920, height: 1080 }));
        assert!(niri_bounds(&serde_json::json!({"logical":null})).is_none());
    }
}
