//! The overlay window: a transparent layer over the whole screen that draws Dalil's numbered marks,
//! its flying pointer and a guide card while the tutor talks. The notch sends commands on
//! `dalil://overlay` and the page at `shell/overlay/` draws them. It is built hidden at startup. Only
//! `overlay_show` and `overlay_hide` change what is on screen, and no click ever reaches it.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "overlay";

#[cfg(not(target_os = "linux"))]
static INPUT_RECTS: std::sync::Mutex<Vec<[i32; 4]>> = std::sync::Mutex::new(Vec::new());

/// Builds the overlay hidden. Call it after `place_notch`, because that decides `LAYER_SHELL`. On a
/// layer-shell desktop it becomes an Overlay-layer surface over the whole output; elsewhere it covers
/// the primary monitor and ignores the cursor. Either way every click passes through to the apps below.
pub fn setup(app: &AppHandle) {
    let Ok(window) = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("shell/overlay/".into()))
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible_on_all_workspaces(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()
    else {
        return;
    };
    let _ = window.set_focusable(false);
    #[cfg(target_os = "linux")]
    if super::LAYER_SHELL.load(std::sync::atomic::Ordering::Relaxed) && layer_shell(&window) {
        return;
    }
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
    }
    let _ = window.set_ignore_cursor_events(true);
    #[cfg(not(target_os = "linux"))]
    watch_input(app.clone());
}

/// Keep only the panels interactive; an open drawing must not block every other app.
#[cfg(not(target_os = "linux"))]
fn watch_input(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = false;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let Some(window) = app.get_webview_window(LABEL) else { break };
            let inside = (|| {
                let cursor = app.cursor_position().ok()?;
                let origin = window.outer_position().ok()?;
                let scale = window.scale_factor().ok()?;
                let (x, y) = ((cursor.x - origin.x as f64) / scale, (cursor.y - origin.y as f64) / scale);
                Some(INPUT_RECTS.lock().ok()?.iter().any(|r| x >= r[0] as f64 && y >= r[1] as f64 && x < (r[0] + r[2]) as f64 && y < (r[1] + r[3]) as f64))
            })().unwrap_or(false);
            if inside != last { let _ = window.set_ignore_cursor_events(!inside); last = inside; }
        }
    });
}

/// Makes the overlay a layer-shell surface on the Overlay layer, anchored to all four edges, with an
/// empty input region. It runs before the window is ever shown, the same order the notch uses.
#[cfg(target_os = "linux")]
fn layer_shell(window: &tauri::WebviewWindow) -> bool {
    use gtk::prelude::WidgetExt;
    use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
    let Ok(gtk_window) = window.gtk_window() else { return false };
    gtk_window.init_layer_shell();
    gtk_window.set_layer(Layer::Overlay);
    gtk_window.set_namespace("dalil-overlay");
    for edge in [Edge::Top, Edge::Bottom, Edge::Left, Edge::Right] {
        gtk_window.set_anchor(edge, true);
    }
    gtk_window.set_exclusive_zone(-1);
    gtk_window.set_keyboard_mode(KeyboardMode::None);
    // An empty region takes no clicks and no pointer, so everything reaches the apps below.
    gtk_window.input_shape_combine_region(Some(&gtk::cairo::Region::create()));
    true
}

/// Shows the overlay on top of the desktop. Its page draws whatever the notch sent last.
#[tauri::command]
pub fn overlay_show(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("overlay-missing")?;
    window.show().map_err(|e| e.to_string())
}

/// Lets the mouse reach the panels Dalil draws (a model to turn, a close button) and nowhere else.
/// Each rectangle is `[x, y, width, height]` in window pixels. An empty list makes the overlay
/// click-through again. GTK applies an input region; other platforms use a pointer hit-test.
#[tauri::command]
pub fn overlay_set_input(app: AppHandle, rects: Vec<[i32; 4]>) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("overlay-missing")?;
    if rects.len() > 8 || rects.iter().any(|r| r[2] < 0 || r[3] < 0 || r.iter().any(|n| n.abs_diff(0) > 32_768)) {
        return Err("bad-input-region".into());
    }
    window.set_focusable(!rects.is_empty()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    {
        let target = window.clone();
        return window
            .run_on_main_thread(move || {
                use gtk::prelude::WidgetExt;
                let _ = target.set_ignore_cursor_events(false);
                let Ok(gtk_window) = target.gtk_window() else { return };
                if super::LAYER_SHELL.load(std::sync::atomic::Ordering::Relaxed) {
                    use gtk_layer_shell::{KeyboardMode, LayerShell};
                    gtk_window.set_keyboard_mode(if rects.is_empty() { KeyboardMode::None } else { KeyboardMode::OnDemand });
                }
                let list: Vec<gtk::cairo::RectangleInt> =
                    rects.iter().map(|r| gtk::cairo::RectangleInt::new(r[0], r[1], r[2], r[3])).collect();
                gtk_window.input_shape_combine_region(Some(&gtk::cairo::Region::create_rectangles(&list)));
            })
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "linux"))]
    {
        *INPUT_RECTS.lock().map_err(|_| "overlay-unavailable")? = rects;
        let _ = window;
        Ok(())
    }
}

/// Hides the overlay. The window stays alive, so the next `overlay_show` is instant.
#[tauri::command]
pub fn overlay_hide(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("overlay-missing")?;
    window.hide().map_err(|e| e.to_string())
}
