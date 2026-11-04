//! Screen capture for the tutor on Linux and Windows. niri names the focused output and grim takes one JPEG
//! of it; only when that fails does grim take the whole desktop. The image is never logged or saved. It goes
//! back to the page as a data URL, and from there to the endpoint the person chose.

#[cfg(target_os = "linux")]
use std::{
    io::Read,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[cfg(any(target_os = "linux", windows))]
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
#[cfg(any(target_os = "linux", test))]
use serde_json::Value;

/// Longest edge of the captured image in pixels. The tutor needs no more than this to point at things.
#[cfg(any(target_os = "linux", windows, test))]
const MAX_EDGE: f64 = 1280.0;
/// Larger images are refused, which keeps the chat request well inside its 8 MiB limit.
#[cfg(any(target_os = "linux", windows))]
const MAX_IMAGE_BYTES: usize = 3 * 1024 * 1024;
/// How long each helper may run before it is killed.
#[cfg(target_os = "linux")]
const HELPER_TIMEOUT: Duration = Duration::from_secs(4);

/// The captured screen. Mirrors `ScreenShot` in `lib/contracts.ts`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShotOut {
    data_url: String,
    width: u32,
    height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    screen: Option<crate::computer::ScreenBounds>,
}

/// The focused screen as a JPEG data URL. Linux and Windows; other platforms answer capture-unavailable.
/// The capture waits on helper processes, so it runs on a blocking thread.
#[tauri::command]
pub async fn capture_screen(app: tauri::AppHandle) -> Result<ScreenShotOut, String> {
    if !screenshots_allowed(&app) { return Err("screenshots-disabled".into()); }
    #[cfg(target_os = "linux")]
    return tauri::async_runtime::spawn_blocking(capture_focused)
        .await
        .map_err(|_| "capture-unavailable".to_string())?;
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(capture_focused_windows)
        .await
        .map_err(|_| "capture-unavailable".to_string())?;
    #[cfg(not(any(target_os = "linux", windows)))]
    return Err("capture-unavailable".into());
}

pub(crate) fn screenshots_allowed(app: &tauri::AppHandle) -> bool {
    crate::config_path(app).ok().and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .is_some_and(|saved| saved["useScreenshots"].as_bool() == Some(true))
}

/// Windows: the monitor holding the foreground window, copied with GDI and shrunk so the long edge is at
/// most `MAX_EDGE`, then encoded as a JPEG. No helper program is needed.
#[cfg(windows)]
fn capture_focused_windows() -> Result<ScreenShotOut, String> {
    use std::{
        mem::{size_of, zeroed},
        ptr::null_mut,
    };
    use windows_sys::Win32::{
        Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetMonitorInfoW,
            MonitorFromWindow, ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
            BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, HALFTONE, MONITORINFO, MONITOR_DEFAULTTONEAREST, SRCCOPY,
        },
        UI::WindowsAndMessaging::GetForegroundWindow,
    };

    let fail = || "capture-unavailable".to_string();
    // SAFETY: plain GDI calls. Every handle is checked and released before returning, and `pixels` is
    // sized for `w * h` 32-bit pixels, which is what GetDIBits is told it may write.
    let (pixels, w, h, bounds) = unsafe {
        let monitor = MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = zeroed();
        info.cbSize = size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return Err(fail());
        }
        let area = info.rcMonitor;
        let (src_w, src_h) = (area.right - area.left, area.bottom - area.top);
        if src_w <= 0 || src_h <= 0 {
            return Err(fail());
        }
        let scale = (MAX_EDGE / f64::from(src_w.max(src_h))).min(1.0);
        let w = ((f64::from(src_w) * scale).round() as i32).max(1);
        let h = ((f64::from(src_h) * scale).round() as i32).max(1);

        let screen = GetDC(null_mut());
        if screen.is_null() {
            return Err(fail());
        }
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        let mut pixels = vec![0u8; w as usize * h as usize * 4];
        let mut copied = false;
        if !memory.is_null() && !bitmap.is_null() {
            let previous = SelectObject(memory, bitmap);
            SetStretchBltMode(memory, HALFTONE);
            let blit = StretchBlt(memory, 0, 0, w, h, screen, area.left, area.top, src_w, src_h, SRCCOPY | CAPTUREBLT);
            // The bitmap must not be selected into a device context while its bits are read.
            SelectObject(memory, previous);
            let mut header: BITMAPINFO = zeroed();
            header.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
            header.bmiHeader.biWidth = w;
            header.bmiHeader.biHeight = -h; // negative: rows run top to bottom
            header.bmiHeader.biPlanes = 1;
            header.bmiHeader.biBitCount = 32;
            header.bmiHeader.biCompression = BI_RGB;
            let rows = GetDIBits(screen, bitmap, 0, h as u32, pixels.as_mut_ptr().cast(), &mut header, DIB_RGB_COLORS);
            copied = blit != 0 && rows == h;
        }
        if !bitmap.is_null() {
            DeleteObject(bitmap);
        }
        if !memory.is_null() {
            DeleteDC(memory);
        }
        ReleaseDC(null_mut(), screen);
        if !copied {
            return Err(fail());
        }
        (pixels, w, h, crate::computer::ScreenBounds { x: area.left, y: area.top, width: src_w, height: src_h })
    };

    // GDI hands back blue, green, red, unused. The encoder takes that order as it is.
    let mut jpeg = Vec::new();
    jpeg_encoder::Encoder::new(&mut jpeg, 70)
        .encode(&pixels, w as u16, h as u16, jpeg_encoder::ColorType::Bgra)
        .map_err(|_| fail())?;
    if jpeg.len() > MAX_IMAGE_BYTES {
        return Err("too-large".into());
    }
    let data_url = format!("data:image/jpeg;base64,{}", STANDARD.encode(&jpeg));
    Ok(ScreenShotOut { data_url, width: w as u32, height: h as u32, screen: Some(bounds) })
}

/// niri names the focused output and grim takes it, scaled so the long edge is at most `MAX_EDGE`. If that
/// fails, grim takes every output at half size as the last resort. An image over `MAX_IMAGE_BYTES` is too-large.
#[cfg(target_os = "linux")]
fn capture_focused() -> Result<ScreenShotOut, String> {
    let info = run("niri", &["msg", "--json", "focused-output"]);
    let screen = info.as_deref().and_then(|json| serde_json::from_slice::<Value>(json).ok())
        .and_then(|output| crate::computer::niri_bounds(&output));
    let focused = info.as_deref().and_then(parse_focused);
    let mut focused_capture = false;
    let image = focused
        .and_then(|(name, logical)| {
            let scale = format!("{:.3}", grim_scale(logical));
            let image = run("grim", &["-o", name.as_str(), "-s", scale.as_str(), "-t", "jpeg", "-q", "70", "-"]);
            focused_capture = image.is_some();
            image
        })
        .or_else(|| run("grim", &["-s", "0.500", "-t", "jpeg", "-q", "70", "-"]))
        .ok_or("capture-unavailable")?;
    if image.len() > MAX_IMAGE_BYTES {
        return Err("too-large".into());
    }
    let (width, height) = jpeg_size(&image).ok_or("capture-unavailable")?;
    let data_url = format!("data:image/jpeg;base64,{}", STANDARD.encode(&image));
    Ok(ScreenShotOut { data_url, width, height, screen: if focused_capture { screen } else { None } })
}

/// Runs a helper and returns its stdout. None when it cannot start, fails, prints nothing, or is still
/// running after `HELPER_TIMEOUT`, in which case it is killed. Stdout is drained on a thread, as in
/// `context.rs`, so a large image cannot fill the pipe and stall the child.
#[cfg(target_os = "linux")]
fn run(program: &str, args: &[&str]) -> Option<Vec<u8>> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        let _ = tx.send(bytes);
    });
    let deadline = Instant::now() + HELPER_TIMEOUT;
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
    let bytes = rx.recv_timeout(HELPER_TIMEOUT).ok()?;
    (status.success() && !bytes.is_empty()).then_some(bytes)
}

/// `niri msg --json focused-output`: the output name, and its logical width, height and scale when niri has
/// them. The name becomes an argument to grim, so a name that could be read as an option is refused.
#[cfg(any(target_os = "linux", test))]
fn parse_focused(json: &[u8]) -> Option<(String, Option<(f64, f64, f64)>)> {
    let output: Value = serde_json::from_slice(json).ok()?;
    let name = output.get("name")?.as_str()?.trim();
    if name.is_empty() || name.starts_with('-') {
        return None;
    }
    let logical = output.get("logical").and_then(|logical| {
        let width = logical.get("width")?.as_f64()?;
        let height = logical.get("height")?.as_f64()?;
        let scale = logical.get("scale").and_then(Value::as_f64).unwrap_or(1.0);
        Some((width, height, scale))
    });
    Some((name.to_string(), logical))
}

/// The `grim -s` factor for an output with this logical width, height and scale. The long edge in physical
/// pixels lands at or under `MAX_EDGE`. The factor is rounded down to thousandths, so the edge never
/// overshoots, and a small output is not enlarged. Without a usable size the factor is 0.5.
#[cfg(any(target_os = "linux", test))]
fn grim_scale(logical: Option<(f64, f64, f64)>) -> f64 {
    let edge = logical.map(|(width, height, scale)| width.max(height) * scale);
    match edge.filter(|edge| edge.is_finite() && *edge > 0.0) {
        Some(edge) => ((MAX_EDGE / edge).min(1.0) * 1000.0).floor() / 1000.0,
        None => 0.5,
    }
}

/// Width and height from the first SOF0 or SOF2 frame header. Other segments are skipped by their length.
/// None for anything that is not a JPEG, a file that ends early, or a zero size.
#[cfg(any(target_os = "linux", test))]
fn jpeg_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if !bytes.starts_with(&[0xFF, 0xD8]) {
        return None;
    }
    let mut at = 2;
    loop {
        // A marker is 0xFF and a code. Extra 0xFF bytes may come before the code.
        if *bytes.get(at)? != 0xFF {
            return None;
        }
        while bytes.get(at) == Some(&0xFF) {
            at += 1;
        }
        let code = *bytes.get(at)?;
        at += 1;
        match code {
            // Markers without a length: TEM, the restart markers and SOI.
            0x01 | 0xD0..=0xD8 => continue,
            // End of image before any frame header.
            0xD9 => return None,
            _ => {}
        }
        let length = usize::from(u16::from_be_bytes([*bytes.get(at)?, *bytes.get(at + 1)?]));
        if length < 2 {
            return None;
        }
        if code == 0xC0 || code == 0xC2 {
            // Inside the segment: length (2), sample precision (1), height (2), width (2).
            let height = u16::from_be_bytes([*bytes.get(at + 3)?, *bytes.get(at + 4)?]);
            let width = u16::from_be_bytes([*bytes.get(at + 5)?, *bytes.get(at + 6)?]);
            return (width > 0 && height > 0).then_some((u32::from(width), u32::from(height)));
        }
        at += length;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// SOI and one frame header, the smallest bytes a size can come from. Only the code and size vary.
    fn frame(code: u8, width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, code, 0x00, 0x0B, 0x08];
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&[0x01, 0x01, 0x11, 0x00]);
        bytes
    }

    #[test]
    fn jpeg_size_reads_a_baseline_frame_from_hand_made_bytes() {
        let bytes = [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00];
        assert_eq!(jpeg_size(&bytes), Some((32, 16)));
    }

    #[test]
    fn jpeg_size_reads_a_progressive_frame() {
        assert_eq!(jpeg_size(&frame(0xC2, 1280, 720)), Some((1280, 720)));
    }

    #[test]
    fn jpeg_size_reads_sixteen_bit_sizes_big_endian() {
        assert_eq!(jpeg_size(&frame(0xC0, 257, 2571)), Some((257, 2571)));
    }

    #[test]
    fn jpeg_size_skips_segments_before_the_frame() {
        // An APP0 segment: marker, length 4 (its two length bytes and two payload bytes), then the frame.
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0xAA, 0xBB];
        bytes.extend_from_slice(&frame(0xC0, 640, 480)[2..]);
        assert_eq!(jpeg_size(&bytes), Some((640, 480)));
    }

    #[test]
    fn jpeg_size_refuses_zero_sizes_and_an_end_of_image_before_a_frame() {
        assert_eq!(jpeg_size(&frame(0xC0, 0, 16)), None);
        assert_eq!(jpeg_size(&frame(0xC0, 32, 0)), None);
        let early_end = [0xFF, 0xD8, 0xFF, 0xD9, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20];
        assert_eq!(jpeg_size(&early_end), None);
    }

    #[test]
    fn jpeg_size_refuses_a_zero_length_segment_instead_of_looping() {
        assert_eq!(jpeg_size(&[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x0B]), None);
    }

    #[test]
    fn jpeg_size_refuses_garbage_and_truncated_files() {
        assert_eq!(jpeg_size(&[]), None);
        assert_eq!(jpeg_size(&[0xFF]), None);
        assert_eq!(jpeg_size(&[0xFF, 0xD8]), None);
        assert_eq!(jpeg_size(b"\x89PNG\r\n\x1a\n"), None);
        assert_eq!(jpeg_size(&[0x00; 16]), None);
        let full = frame(0xC0, 32, 16);
        for cut in 2..=10 {
            assert_eq!(jpeg_size(&full[..cut]), None, "cut at {cut}");
        }
    }

    #[test]
    fn grim_scale_brings_the_long_edge_to_1280_or_less() {
        assert_eq!(grim_scale(Some((1920.0, 1080.0, 1.0))), 0.666);
        // A 2x output of 1280 x 800 logical pixels is 2560 x 1600 physical.
        assert_eq!(grim_scale(Some((1280.0, 800.0, 2.0))), 0.5);
    }

    #[test]
    fn grim_scale_never_enlarges_a_small_output() {
        assert_eq!(grim_scale(Some((800.0, 600.0, 1.0))), 1.0);
    }

    #[test]
    fn grim_scale_is_half_without_a_usable_size() {
        assert_eq!(grim_scale(None), 0.5);
        assert_eq!(grim_scale(Some((0.0, 0.0, 1.0))), 0.5);
        assert_eq!(grim_scale(Some((1920.0, 1080.0, f64::NAN))), 0.5);
        assert_eq!(grim_scale(Some((1920.0, 1080.0, -1.0))), 0.5);
    }

    #[test]
    fn parse_focused_reads_the_name_and_logical_size() {
        let json = br#"{"name":"eDP-1","make":"BOE","logical":{"x":0,"y":0,"width":1920,"height":1200,"scale":1.25}}"#;
        assert_eq!(parse_focused(json), Some(("eDP-1".to_string(), Some((1920.0, 1200.0, 1.25)))));
    }

    #[test]
    fn parse_focused_keeps_a_name_without_a_logical_size() {
        let json = br#"{"name":"HDMI-A-1","logical":null}"#;
        assert_eq!(parse_focused(json), Some(("HDMI-A-1".to_string(), None)));
    }

    #[test]
    fn parse_focused_refuses_garbage_and_names_that_read_as_options() {
        let junk: [&[u8]; 8] = [
            b"",
            b"not json",
            b"[]",
            b"null",
            b"{}",
            br#"{"name":""}"#,
            br#"{"name":"-o"}"#,
            br#"{"name":null}"#,
        ];
        for bytes in junk {
            assert_eq!(parse_focused(bytes), None, "{}", String::from_utf8_lossy(bytes));
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn run_returns_what_a_helper_prints_and_none_for_a_missing_one() {
        assert_eq!(run("head", &["-c", "3", "/dev/zero"]), Some(vec![0, 0, 0]));
        assert_eq!(run("no-such-helper-dalil", &[]), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn run_kills_a_helper_that_passes_its_deadline() {
        let started = std::time::Instant::now();
        assert_eq!(run("sleep", &["10"]), None);
        assert!(started.elapsed() < std::time::Duration::from_secs(8));
    }
}
