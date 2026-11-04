//! Local request metadata. Raw prompts, screenshots, replies and credentials are never stored here.
use std::{fs, io::ErrorKind, path::{Path, PathBuf}, sync::Mutex};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

static LOCK: Mutex<()> = Mutex::new(());
const MAX_RECEIPTS: usize = 200;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    id: String,
    created_at: String,
    host: String,
    model: String,
    bytes: usize,
    screenshot: bool,
    hash: String,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "receipts-unavailable")?;
    fs::create_dir_all(&dir).map_err(|_| "receipts-unavailable")?;
    Ok(dir.join("receipts.json"))
}
fn read(path: &Path) -> Result<Vec<Receipt>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "receipts-unavailable".into()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(_) => Err("receipts-unavailable".into()),
    }
}
fn metadata(host: &str, model: &str, body: &[u8], screenshot: bool) -> Receipt {
    Receipt { id: crate::memory::new_id(), created_at: crate::memory::now_iso(), host: host.into(), model: model.into(),
        bytes: body.len(), screenshot, hash: format!("{:x}", Sha256::digest(body)) }
}

pub fn record(app: &AppHandle, host: &str, model: &str, body: &[u8], screenshot: bool) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|_| "receipts-unavailable")?;
    let path = path(app)?;
    let mut rows = read(&path)?;
    rows.insert(0, metadata(host, model, body, screenshot));
    rows.truncate(MAX_RECEIPTS);
    let bytes = serde_json::to_vec(&rows).map_err(|_| "receipts-unavailable")?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|_| "receipts-unavailable")?;
    fs::rename(tmp, path).map_err(|_| "receipts-unavailable")?;
    let _ = app.emit_to("notch", "dalil://receipts-changed", ());
    Ok(())
}

#[tauri::command]
pub fn receipt_list(app: AppHandle) -> Result<Vec<Receipt>, String> {
    let _guard = LOCK.lock().map_err(|_| "receipts-unavailable")?;
    read(&path(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipt_keeps_only_metadata_and_a_sha256_digest() {
        let row = metadata("model.example", "vision", b"private question and image", true);
        let value = serde_json::to_value(row).unwrap();
        assert_eq!(value["bytes"], 26);
        assert_eq!(value["screenshot"], true);
        assert_eq!(value["hash"].as_str().unwrap().len(), 64);
        assert!(!value.to_string().contains("private question"));
        assert_eq!(value.as_object().unwrap().len(), 7);
    }
}
