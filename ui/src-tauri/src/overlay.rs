//! The overlay window: a transparent layer over the whole screen that draws Dalil's numbered marks,
//! its flying pointer and a guide card while the tutor talks. The notch sends commands on
//! `dalil://overlay` and the page at `shell/overlay/` draws them. It is built hidden at startup. Only
//! `overlay_show` and `overlay_hide` change what is on screen, and no click ever reaches it.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "overlay";

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
/// click-through again. On a layer-shell desktop this is an input region. Elsewhere the whole window
/// takes the mouse while a panel is open, so the red close button is how to get the screen back.
#[tauri::command]
pub fn overlay_set_input(app: AppHandle, rects: Vec<[i32; 4]>) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("overlay-missing")?;
    #[cfg(target_os = "linux")]
    if super::LAYER_SHELL.load(std::sync::atomic::Ordering::Relaxed) {
        let target = window.clone();
        return window
            .run_on_main_thread(move || {
                use gtk::prelude::WidgetExt;
                let Ok(gtk_window) = target.gtk_window() else { return };
                let list: Vec<gtk::cairo::RectangleInt> =
                    rects.iter().map(|r| gtk::cairo::RectangleInt::new(r[0], r[1], r[2], r[3])).collect();
                gtk_window.input_shape_combine_region(Some(&gtk::cairo::Region::create_rectangles(&list)));
            })
            .map_err(|e| e.to_string());
    }
    window.set_ignore_cursor_events(rects.is_empty()).map_err(|e| e.to_string())
}

/// Hides the overlay. The window stays alive, so the next `overlay_show` is instant.
#[tauri::command]
pub fn overlay_hide(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("overlay-missing")?;
    window.hide().map_err(|e| e.to_string())
}
