//! Which app and window the person is looking at, read from the desktop. No screen pixels.
//!
//! Linux asks the compositor first (niri, Hyprland, Sway), then X11 through xdotool and xprop.
//! Windows reads the title of the foreground window. Everywhere else the answer is always None.
//! Window titles are private: they go back to the page and are never logged.

use serde::Serialize;
#[cfg(any(target_os = "linux", test))]
use serde_json::Value;

/// The focused app and window title. Mirrors `ContextSnapshot` in `lib/contracts.ts`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(any(target_os = "linux", windows)), allow(dead_code))]
pub struct ContextSnapshot {
    pub app: String,
    pub title: String,
    /// "niri", "hyprland", "sway", "x11" or "windows".
    pub source: &'static str,
}

/// The focused window, or None when no source can name one. `async` runs it on a worker thread, so
/// the helper processes never stall the main thread.
#[tauri::command(async)]
pub fn active_context() -> Option<ContextSnapshot> {
    current()
}

/// Niri, then Hyprland, Sway and X11. The first source that names a window wins.
#[cfg(target_os = "linux")]
fn current() -> Option<ContextSnapshot> {
    let niri = || parse_niri(&run("niri", &["msg", "--json", "focused-window"])?);
    let hyprland = || parse_hypr(&run("hyprctl", &["activewindow", "-j"])?);
    let sway = || parse_sway(&run("swaymsg", &["-t", "get_tree"])?);
    niri().or_else(hyprland).or_else(sway).or_else(x11)
}

#[cfg(windows)]
static LAST_EXTERNAL: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

#[cfg(windows)]
pub(crate) fn foreground_window() -> windows_sys::Win32::Foundation::HWND {
    use std::sync::atomic::Ordering;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow};
    let current = unsafe { GetForegroundWindow() };
    let mut process = 0;
    unsafe { GetWindowThreadProcessId(current, &mut process); }
    if !current.is_null() && process != std::process::id() {
        LAST_EXTERNAL.store(current as isize, Ordering::Relaxed);
        return current;
    }
    let previous = LAST_EXTERNAL.load(Ordering::Relaxed) as windows_sys::Win32::Foundation::HWND;
    if unsafe { IsWindow(previous) } != 0 { previous } else { std::ptr::null_mut() }
}

#[cfg(windows)]
pub(crate) fn restore_focus() {
    let target = foreground_window();
    if !target.is_null() { unsafe { windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(target); } }
}

/// The foreground window's title, split into the app and the document.
#[cfg(windows)]
fn current() -> Option<ContextSnapshot> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowTextW;
    let mut buffer = [0u16; 512];
    // SAFETY: GetWindowTextW writes at most `buffer.len()` UTF-16 units and returns how many it wrote.
    let length = unsafe { GetWindowTextW(foreground_window(), buffer.as_mut_ptr(), buffer.len() as i32) };
    let full = String::from_utf16_lossy(buffer.get(..usize::try_from(length).ok()?)?);
    let (app, title) = split_title(&full);
    snapshot(Some(app), Some(title), "windows")
}

/// No source on this platform.
#[cfg(not(any(target_os = "linux", windows)))]
fn current() -> Option<ContextSnapshot> {
    None
}

/// Runs a helper and returns its trimmed stdout. None when it cannot start, fails, prints nothing, or
/// is still running after 1.5 seconds, in which case it is killed.
#[cfg(target_os = "linux")]
pub(crate) fn run(program: &str, args: &[&str]) -> Option<String> {
    use std::{
        io::Read,
        process::{Command, Stdio},
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };
    let timeout = Duration::from_millis(1500);
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Drain stdout on a thread. A large answer (a Sway tree) would otherwise fill the pipe and stop the
    // child from ever exiting.
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        let _ = tx.send(bytes);
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let bytes = rx.recv_timeout(timeout).ok()?;
    let output = String::from_utf8_lossy(&bytes).trim().to_string();
    (status.success() && !output.is_empty()).then_some(output)
}

/// X11 through xdotool. xprop supplies the class when this xdotool cannot print it.
#[cfg(target_os = "linux")]
fn x11() -> Option<ContextSnapshot> {
    let title = run("xdotool", &["getactivewindow", "getwindowname"]);
    let app = run("xdotool", &["getactivewindow", "getwindowclassname"]).or_else(|| {
        let id = run("xdotool", &["getactivewindow"])?;
        parse_wm_class(&run("xprop", &["-id", id.as_str(), "WM_CLASS"])?)
    });
    snapshot(app.as_deref(), title.as_deref(), "x11")
}

/// `niri msg --json focused-window`: `null` when nothing has focus.
#[cfg(any(target_os = "linux", test))]
fn parse_niri(json: &str) -> Option<ContextSnapshot> {
    let window: Value = serde_json::from_str(json).ok()?;
    snapshot(text(&window, "app_id"), text(&window, "title"), "niri")
}

/// `hyprctl activewindow -j`: `{}` when nothing has focus.
#[cfg(any(target_os = "linux", test))]
fn parse_hypr(json: &str) -> Option<ContextSnapshot> {
    let window: Value = serde_json::from_str(json).ok()?;
    snapshot(text(&window, "class"), text(&window, "title"), "hyprland")
}

/// `swaymsg -t get_tree`: the focused node that has an app, searched through `nodes` and `floating_nodes`.
#[cfg(any(target_os = "linux", test))]
fn parse_sway(json: &str) -> Option<ContextSnapshot> {
    let tree: Value = serde_json::from_str(json).ok()?;
    focused(&tree)
}

#[cfg(any(target_os = "linux", test))]
fn focused(node: &Value) -> Option<ContextSnapshot> {
    if node.get("focused").and_then(Value::as_bool) == Some(true) {
        // Wayland windows set app_id. XWayland windows keep their class under window_properties.
        let app = text(node, "app_id")
            .filter(|app| !app.is_empty())
            .or_else(|| node.get("window_properties").and_then(|props| text(props, "class")));
        if let Some(found) = snapshot(app, text(node, "name"), "sway") {
            return Some(found);
        }
    }
    ["nodes", "floating_nodes"]
        .into_iter()
        .filter_map(|key| node.get(key)?.as_array())
        .flatten()
        .find_map(focused)
}

/// `xprop -id <id> WM_CLASS` prints `WM_CLASS(STRING) = "instance", "Class"`. The class is the last value.
#[cfg(any(target_os = "linux", test))]
fn parse_wm_class(line: &str) -> Option<String> {
    line.rsplit('"').nth(1).filter(|class| !class.is_empty()).map(str::to_string)
}

/// `Frame 12 - Design - Figma` gives the app `Figma` and the title `Frame 12 - Design`. A title without
/// " - " is the app alone.
#[cfg(any(windows, test))]
fn split_title(full: &str) -> (&str, &str) {
    match full.rsplit_once(" - ") {
        Some((title, app)) => (app.trim(), title.trim()),
        None => (full.trim(), ""),
    }
}

/// A snapshot when the app is known. A missing title stays empty.
#[cfg(any(target_os = "linux", windows, test))]
fn snapshot(app: Option<&str>, title: Option<&str>, source: &'static str) -> Option<ContextSnapshot> {
    let app = app?.trim();
    (!app.is_empty()).then(|| ContextSnapshot {
        app: app.to_string(),
        title: title.unwrap_or_default().trim().to_string(),
        source,
    })
}

#[cfg(any(target_os = "linux", test))]
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(app: &str, title: &str, source: &'static str) -> Option<ContextSnapshot> {
        Some(ContextSnapshot { app: app.into(), title: title.into(), source })
    }

    #[test]
    fn niri_reads_the_focused_window() {
        let json = r#"{"id":12,"title":"Frame 12 - Design - Figma","app_id":"figma-linux","pid":4242,"workspace_id":3,"is_focused":true,"is_floating":false,"is_urgent":false}"#;
        assert_eq!(parse_niri(json), snap("figma-linux", "Frame 12 - Design - Figma", "niri"));
    }

    #[test]
    fn hyprland_reads_the_active_window() {
        let json = r#"{"address":"0x5581c0a2d3f0","mapped":true,"hidden":false,"at":[0,0],"size":[1920,1000],"floating":false,"monitor":0,"class":"kitty","title":"nvim src/main.rs","initialClass":"kitty","pid":8123,"xwayland":false,"fullscreen":0}"#;
        assert_eq!(parse_hypr(json), snap("kitty", "nvim src/main.rs", "hyprland"));
    }

    #[test]
    fn sway_finds_the_focused_window_in_nested_trees() {
        let json = r#"{"type":"root","focused":false,"nodes":[{"type":"output","name":"eDP-1","focused":false,"nodes":[{"type":"workspace","name":"2","focused":false,"nodes":[{"type":"con","name":"Terminal","app_id":"foot","focused":false,"nodes":[]},{"type":"con","name":"Lesson notes","app_id":"org.gnome.Notes","focused":true,"nodes":[]}],"floating_nodes":[]}],"floating_nodes":[]}],"floating_nodes":[]}"#;
        assert_eq!(parse_sway(json), snap("org.gnome.Notes", "Lesson notes", "sway"));
    }

    #[test]
    fn sway_reads_xwayland_class_and_floating_windows() {
        let json = r#"{"type":"root","focused":false,"nodes":[],"floating_nodes":[{"type":"floating_con","name":"Figma","app_id":null,"focused":true,"window_properties":{"class":"Figma","instance":"figma"},"nodes":[],"floating_nodes":[]}]}"#;
        assert_eq!(parse_sway(json), snap("Figma", "Figma", "sway"));
    }

    #[test]
    fn sway_with_nothing_focused_is_none() {
        let json = r#"{"type":"root","focused":false,"nodes":[{"type":"con","name":"Terminal","app_id":"foot","focused":false,"nodes":[]}],"floating_nodes":[]}"#;
        assert_eq!(parse_sway(json), None);
    }

    #[test]
    fn x11_class_is_the_last_quoted_value() {
        assert_eq!(parse_wm_class(r#"WM_CLASS(STRING) = "navigator", "Firefox""#), Some("Firefox".into()));
        assert_eq!(parse_wm_class("WM_CLASS:  not found."), None);
    }

    #[test]
    fn garbage_and_empty_answers_are_none() {
        for junk in ["", "   ", "not json", "<html>", "[1,2", "[]", "42", "null"] {
            assert_eq!(parse_niri(junk), None, "niri: {junk}");
            assert_eq!(parse_hypr(junk), None, "hypr: {junk}");
            assert_eq!(parse_sway(junk), None, "sway: {junk}");
        }
        assert_eq!(parse_hypr(r#"{"class":"","title":"Untitled"}"#), None);
    }

    #[test]
    fn a_missing_title_is_kept_empty() {
        assert_eq!(parse_niri(r#"{"app_id":"kitty","title":null}"#), snap("kitty", "", "niri"));
    }

    #[test]
    fn windows_title_splits_app_from_document() {
        assert_eq!(split_title("Frame 12 - Design - Figma"), ("Figma", "Frame 12 - Design"));
        assert_eq!(split_title("Calculator"), ("Calculator", ""));
        assert_eq!(split_title("Untitled - "), ("", "Untitled"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn run_trims_output_and_drains_large_output() {
        assert_eq!(run("echo", &["  kitty  "]).as_deref(), Some("kitty"));
        assert_eq!(run("head", &["-c", "200000", "/dev/zero"]).map(|s| s.len()), Some(200_000));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn run_kills_a_helper_past_its_deadline_and_skips_missing_ones() {
        let started = std::time::Instant::now();
        assert_eq!(run("sleep", &["10"]), None);
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert_eq!(run("no-such-helper-dalil", &[]), None);
    }
}
