//! Dalil desktop shell.
//!
//! One window, drawn by the Next app in `ui/`: the notch. It is frameless, transparent, always on
//! top and flush with the top centre of the screen, and tall enough for every panel the notch grows
//! into (Home, endpoint Setup). Only the visible shape takes the mouse; the rest passes through.
//!
//! The webview never makes network requests itself. Model lists and test messages go through
//! `http_get`, which refuses redirects (the frontend checks the target host before following one)
//! and has no CORS. The API key lives in the OS keychain; no command returns it to the webview.

use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

mod capture;
mod chat;
mod context;
mod memory;
mod overlay;
mod projects;
mod voice;

pub(crate) const KEYRING_SERVICE: &str = "app.dalil.guide";
pub(crate) const KEYRING_USER: &str = "endpoint-key";
const ENDPOINT_FILE: &str = "endpoint.json";
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

/// True when the notch is a Wayland layer-shell surface. There the page gets real pointer events
/// inside an input region and no global cursor polling is possible or needed.
static LAYER_SHELL: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequest {
    url: String,
    method: Option<String>,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Serialize)]
struct HttpResponse {
    status: u16,
    url: String,
    headers: HashMap<String, String>,
    body: String,
}

/// One HTTP call for the frontend. Redirects are returned, never followed.
#[tauri::command]
async fn http_request(req: HttpRequest) -> Result<HttpResponse, String> {
    let url = url::Url::parse(&req.url).map_err(|_| "bad-url".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("bad-url".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(req.timeout_ms.unwrap_or(8000).clamp(500, 30_000)))
        .build()
        .map_err(|_| "unreachable".to_string())?;

    let method = match req.method.as_deref().unwrap_or("GET") {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err("bad-method".into()),
    };
    let mut builder = client.request(method, url);
    for (name, value) in &req.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|e| {
        if e.is_timeout() {
            "timeout".to_string()
        } else {
            "unreachable".to_string()
        }
    })?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.as_str().to_ascii_lowercase(), v.to_string())))
        .collect();
    let bytes = response.bytes().await.map_err(|_| "unreachable".to_string())?;
    let body = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_BODY_BYTES)]).into_owned();
    Ok(HttpResponse { status, url: final_url, headers, body })
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SavedEndpoint {
    base: String,
    host: String,
    local: bool,
    model: String,
    use_screenshots: bool,
    header_name: String,
    scheme: String,
    /// Voice settings. Empty means the defaults. `serde(default)` lets older endpoint.json files load.
    #[serde(default)]
    stt_model: String,
    #[serde(default)]
    tts_model: String,
    #[serde(default)]
    tts_voice: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedEndpoint {
    #[serde(flatten)]
    endpoint: SavedEndpoint,
    has_key: bool,
}

pub(crate) fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(ENDPOINT_FILE))
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

/// Writes the endpoint settings to the config dir and the key to the keychain. An empty key
/// removes any stored key. The key is never written to a file.
#[tauri::command]
fn save_endpoint(app: AppHandle, endpoint: SavedEndpoint, key: String) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&endpoint).map_err(|e| e.to_string())?;
    fs::write(config_path(&app)?, json).map_err(|e| e.to_string())?;
    let entry = keyring_entry()?;
    if key.is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(&key).map_err(|e| e.to_string())?;
    }
    notify_changed(&app);
    Ok(())
}

/// The saved settings and whether a key is stored. The key itself stays in the keychain.
#[tauri::command]
fn load_endpoint(app: AppHandle) -> Result<Option<LoadedEndpoint>, String> {
    let path = config_path(&app)?;
    let Ok(text) = fs::read_to_string(path) else { return Ok(None) };
    let endpoint: SavedEndpoint = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let has_key = keyring_entry().ok().and_then(|e| e.get_password().ok()).is_some();
    Ok(Some(LoadedEndpoint { endpoint, has_key }))
}

/// Lets the mouse through the notch while it is only showing status. A layer-shell notch uses
/// `set_input_rect` instead, so this does nothing there.
#[tauri::command]
fn set_interactive(window: WebviewWindow, on: bool) -> Result<(), String> {
    if LAYER_SHELL.load(Ordering::Relaxed) {
        return Ok(());
    }
    window.set_ignore_cursor_events(!on).map_err(|e| e.to_string())
}

/// "region": the page hears the pointer itself and calls `set_input_rect`. "poll": Rust reports the
/// cursor through `dalil://pointer` and the page calls `set_interactive`.
#[tauri::command]
fn input_mode() -> &'static str {
    if LAYER_SHELL.load(Ordering::Relaxed) {
        "region"
    } else {
        "poll"
    }
}

/// Limits where the layer-shell notch takes the mouse to one rectangle, in window pixels. Clicks
/// outside it go to whatever is underneath.
#[tauri::command]
fn set_input_rect(window: WebviewWindow, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if LAYER_SHELL.load(Ordering::Relaxed) {
        let target = window.clone();
        window
            .run_on_main_thread(move || apply_input_rect(&target, x, y, w, h))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (window, x, y, w, h);
    Ok(())
}

#[cfg(target_os = "linux")]
fn apply_input_rect(window: &WebviewWindow, x: i32, y: i32, w: i32, h: i32) {
    use gtk::prelude::WidgetExt;
    let Ok(gtk_window) = window.gtk_window() else { return };
    let rect = gtk::cairo::RectangleInt::new(x, y, w, h);
    gtk_window.input_shape_combine_region(Some(&gtk::cairo::Region::create_rectangle(&rect)));
}

/// Gives the layer-shell notch the keyboard while a panel with text fields is open (Setup), and
/// hands it back otherwise. A no-op elsewhere, where the window gets focus the normal way.
#[tauri::command]
fn set_keyboard(window: WebviewWindow, on: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if LAYER_SHELL.load(Ordering::Relaxed) {
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                use gtk_layer_shell::{KeyboardMode, LayerShell};
                if let Ok(gtk_window) = target.gtk_window() {
                    gtk_window.set_keyboard_mode(if on { KeyboardMode::Exclusive } else { KeyboardMode::OnDemand });
                }
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (window, on);
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// First name for the greeting, from the login name until Setup can edit it.
#[tauri::command]
fn user_name() -> String {
    let raw = std::env::var("USER").or_else(|_| std::env::var("USERNAME")).unwrap_or_default();
    let mut chars = raw.chars();
    match chars.next() {
        Some(first) if !raw.is_empty() => first.to_uppercase().collect::<String>() + chars.as_str(),
        _ => "there".into(),
    }
}

#[derive(Serialize, Clone, PartialEq)]
struct PointerEvent {
    inside: bool,
    x: i32,
    y: i32,
}

/// The notch window ignores the mouse by default, so the page cannot see the pointer. This polls the
/// cursor and reports it in window-relative logical pixels; the page decides whether it is over the
/// visible shape and asks for the mouse only then. Events are sent when the position changes.
fn watch_pointer(app: AppHandle) {
    use tauri::Emitter;
    if LAYER_SHELL.load(Ordering::Relaxed) {
        return;
    }
    std::thread::spawn(move || {
        let mut last = PointerEvent { inside: false, x: -1, y: -1 };
        loop {
            std::thread::sleep(Duration::from_millis(60));
            let Some(window) = app.get_webview_window("notch") else { continue };
            let (Ok(cursor), Ok(origin), Ok(size), Ok(scale)) =
                (app.cursor_position(), window.outer_position(), window.outer_size(), window.scale_factor())
            else {
                continue;
            };
            let rx = (cursor.x - origin.x as f64) / scale;
            let ry = (cursor.y - origin.y as f64) / scale;
            let inside = rx >= 0.0 && ry >= 0.0 && rx < size.width as f64 / scale && ry < size.height as f64 / scale;
            let event = if inside {
                PointerEvent { inside, x: rx as i32, y: ry as i32 }
            } else {
                PointerEvent { inside: false, x: -1, y: -1 }
            };
            if event != last {
                let _ = app.emit_to("notch", "dalil://pointer", event.clone());
                last = event;
            }
        }
    });
}

/// Layer-shell twin of `watch_pointer`: the pointer cannot be read globally on Wayland, but GDK knows
/// when it is over this surface. Reports the same `dalil://pointer` events from the main thread.
#[cfg(target_os = "linux")]
fn watch_pointer_gtk(app: &AppHandle) {
    use gtk::{glib::ControlFlow, prelude::*};
    use tauri::Emitter;
    let Some(window) = app.get_webview_window("notch") else { return };
    let Ok(gtk_window) = window.gtk_window() else { return };
    let handle = app.clone();
    let mut last = PointerEvent { inside: false, x: -1, y: -1 };
    gtk::glib::timeout_add_local(Duration::from_millis(50), move || {
        let (Some(surface), Some(pointer)) =
            (gtk_window.window(), gtk_window.display().default_seat().and_then(|seat| seat.pointer()))
        else {
            return ControlFlow::Continue;
        };
        let (under, _, _) = pointer.window_at_position();
        let inside = under.is_some_and(|w| w.toplevel() == surface);
        let event = if inside {
            let (_, x, y, _) = surface.device_position(&pointer);
            PointerEvent { inside, x, y }
        } else {
            PointerEvent { inside: false, x: -1, y: -1 }
        };
        if event != last {
            let _ = handle.emit_to("notch", "dalil://pointer", event.clone());
            last = event;
        }
        ControlFlow::Continue
    });
}

/// Tells every window the saved endpoint changed so the notch can refresh its chip.
fn notify_changed(app: &AppHandle) {
    use tauri::Emitter;
    let _ = app.emit("dalil://endpoint-changed", ());
}

/// Pins the notch to the top edge of the output as a layer-shell surface (niri, Sway, Hyprland, KDE).
/// Returns false on X11, GNOME Wayland and non-Linux, where `place_notch` does the job instead.
#[cfg(target_os = "linux")]
fn init_layer_shell(app: &AppHandle) -> bool {
    use gtk::prelude::WidgetExt;
    use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
    let Some(window) = app.get_webview_window("notch") else { return false };
    let Ok(gtk_window) = window.gtk_window() else { return false };
    if !gtk_layer_shell::is_supported() {
        return false;
    }
    gtk_window.init_layer_shell();
    // A layer surface takes its size from the widget request, not from the window config.
    gtk_window.set_size_request(560, 640);
    gtk_window.set_layer(Layer::Overlay);
    gtk_window.set_namespace("dalil");
    gtk_window.set_anchor(Edge::Top, true);
    gtk_window.set_exclusive_zone(-1);
    gtk_window.set_keyboard_mode(KeyboardMode::OnDemand);
    LAYER_SHELL.store(true, Ordering::Relaxed);
    // The resting pill, until the page reports its own shape.
    apply_input_rect(&window, 214, 0, 132, 30);
    true
}

#[cfg(not(target_os = "linux"))]
fn init_layer_shell(_app: &AppHandle) -> bool {
    false
}

/// Centres the notch on the primary monitor and pins it to the top edge. Plain Wayland windows
/// cannot position themselves, so on GNOME Wayland use `npm run shell:dev:x11` until the shell
/// extension from the TRD exists.
fn place_notch(app: &AppHandle) {
    let Some(window) = app.get_webview_window("notch") else { return };
    if !init_layer_shell(app) {
        if let (Ok(Some(monitor)), Ok(size)) = (window.primary_monitor(), window.outer_size()) {
            let origin = monitor.position();
            let x = origin.x + (monitor.size().width as i32 - size.width as i32) / 2;
            let _ = window.set_position(PhysicalPosition::new(x, origin.y));
        }
        let _ = window.set_ignore_cursor_events(true);
    }
    let _ = window.show();
    #[cfg(target_os = "linux")]
    if LAYER_SHELL.load(Ordering::Relaxed) {
        watch_pointer_gtk(app);
    }
}

/// Acts on a launch flag. `quit` exits Dalil; the other commands go to the notch as `dalil://command`.
fn handle_command(app: &AppHandle, command: &'static str) {
    use tauri::Emitter;
    if command == "quit" {
        app.exit(0);
    } else {
        let _ = app.emit_to("notch", "dalil://command", command);
    }
}

/// The command named by a launch flag: `--talk`, `--ask` or `--quit`. Other arguments are ignored.
fn parse_command(args: &[String]) -> Option<&'static str> {
    args.iter().find_map(|arg| match arg.as_str() {
        "--talk" => Some("talk"),
        "--ask" => Some("ask"),
        "--quit" => Some("quit"),
        _ => None,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Registered first: a second launch is handed to this instance before other plugins start.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        if let Some(command) = parse_command(&argv) {
            handle_command(app, command);
        }
    }));
    builder
        .setup(|app| {
            place_notch(app.handle());
            overlay::setup(app.handle());
            watch_pointer(app.handle().clone());
            // The page subscribes after its window loads, so a cold-start flag waits briefly.
            if let Some(command) = parse_command(&std::env::args().collect::<Vec<String>>()) {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(800));
                    handle_command(&handle, command);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http_request,
            save_endpoint,
            load_endpoint,
            set_interactive,
            input_mode,
            set_input_rect,
            set_keyboard,
            quit_app,
            user_name,
            memory::memory_list,
            memory::memory_add,
            memory::memory_delete,
            memory::memory_clear,
            projects::project_list,
            projects::project_add,
            projects::project_set_active,
            projects::project_delete,
            projects::project_rename,
            capture::capture_screen,
            chat::chat_complete,
            context::active_context,
            overlay::overlay_show,
            overlay::overlay_hide,
            overlay::overlay_set_input,
            voice::voice_start,
            voice::voice_cancel,
            voice::voice_stop,
            voice::voice_speak
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dalil");
}

#[cfg(test)]
mod tests {
    use super::parse_command;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    #[test]
    fn each_flag_maps_to_its_command() {
        assert_eq!(parse_command(&args(&["dalil", "--talk"])), Some("talk"));
        assert_eq!(parse_command(&args(&["dalil", "--ask"])), Some("ask"));
        assert_eq!(parse_command(&args(&["dalil", "--quit"])), Some("quit"));
    }

    #[test]
    fn other_arguments_are_ignored() {
        assert_eq!(parse_command(&args(&["dalil"])), None);
        assert_eq!(parse_command(&args(&["dalil", "ask", "--ask=now", "-a"])), None);
    }

    #[test]
    fn a_flag_after_other_arguments_is_found() {
        assert_eq!(parse_command(&args(&["dalil", "--debug", "--ask"])), Some("ask"));
    }

    #[test]
    fn voice_settings_round_trip_and_older_files_still_load() {
        let older = r#"{"base":"https://a.example.com/v1","host":"a.example.com","local":false,"model":"m","useScreenshots":false,"headerName":"Authorization","scheme":"Bearer"}"#;
        let loaded: super::SavedEndpoint = serde_json::from_str(older).unwrap();
        assert_eq!(loaded.stt_model, "");
        assert_eq!(loaded.tts_model, "");
        assert_eq!(loaded.tts_voice, "");

        let voice = super::SavedEndpoint {
            stt_model: "whisper-1".into(),
            tts_model: "tts-1".into(),
            tts_voice: "alloy".into(),
            ..loaded.clone()
        };
        let json = serde_json::to_string(&voice).unwrap();
        assert!(json.contains(r#""sttModel":"whisper-1""#), "{json}");
        let back: super::SavedEndpoint = serde_json::from_str(&json).unwrap();
        assert_eq!(back.stt_model, "whisper-1");
        assert_eq!(back.tts_model, "tts-1");
        assert_eq!(back.tts_voice, "alloy");
    }
}
