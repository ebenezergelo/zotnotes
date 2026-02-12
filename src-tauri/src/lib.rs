use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    markdown_dir: String,
    attachment_base_dir: String,
    zotero_api_key: String,
    zotero_base_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            markdown_dir: String::new(),
            attachment_base_dir: String::new(),
            zotero_api_key: String::new(),
            zotero_base_url: "http://127.0.0.1:23119".to_string(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("failed to resolve app config directory: {err}"))?;

    std::fs::create_dir_all(&config_dir).map_err(|err| {
        format!(
            "failed to create app config directory {}: {err}",
            config_dir.display()
        )
    })?;

    Ok(config_dir.join("settings.json"))
}

fn ensure_parent(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            format!(
                "failed to create parent directory {}: {err}",
                parent.display()
            )
        })?;
    }

    Ok(())
}

#[tauri::command]
fn select_directory_dialog() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|err| format!("failed to create directory {path}: {err}"))
}

#[tauri::command]
fn save_markdown_file(path: String, content: String) -> Result<(), String> {
    let destination = PathBuf::from(&path);
    ensure_parent(&destination)?;
    std::fs::write(&destination, content).map_err(|err| {
        format!(
            "failed to write markdown file {}: {err}",
            destination.display()
        )
    })
}

#[tauri::command]
fn save_png_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let destination = PathBuf::from(&path);
    ensure_parent(&destination)?;
    std::fs::write(&destination, bytes)
        .map_err(|err| format!("failed to write png bytes {}: {err}", destination.display()))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|err| format!("failed to read settings {}: {err}", path.display()))?;

    let parsed = serde_json::from_str::<AppSettings>(&raw)
        .map_err(|err| format!("failed to parse settings {}: {err}", path.display()))?;

    Ok(parsed)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("failed to serialize settings: {err}"))?;

    std::fs::write(&path, raw)
        .map_err(|err| format!("failed to write settings {}: {err}", path.display()))
}

#[tauri::command]
fn write_temp_debug_dump(prefix: String, content: String) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| format!("failed to compute timestamp: {err}"))?
        .as_secs();

    let sanitized_prefix = prefix
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect::<String>();

    let file_name = if sanitized_prefix.is_empty() {
        format!("zotero-debug-{timestamp}.json")
    } else {
        format!("{sanitized_prefix}-{timestamp}.json")
    };

    let path = std::env::temp_dir().join(file_name);
    std::fs::write(&path, content)
        .map_err(|err| format!("failed to write debug dump {}: {err}", path.display()))?;

    Ok(path.to_string_lossy().to_string())
}

fn apply_api_key(mut headers: HeaderMap, zotero_api_key: Option<String>) -> HeaderMap {
    if let Some(key) = zotero_api_key {
        if !key.trim().is_empty() {
            if let Ok(value) = reqwest::header::HeaderValue::from_str(key.trim()) {
                headers.insert("Zotero-API-Key", value);
            }
        }
    }

    headers
}

#[tauri::command]
async fn zotero_proxy_get_json(
    url: String,
    zotero_api_key: Option<String>,
) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let headers = apply_api_key(HeaderMap::new(), zotero_api_key);

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|err| format!("proxy request failed for {url}: {err}"))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("failed to read proxy response body: {err}"))?;

    if !status.is_success() {
        let body = String::from_utf8_lossy(&bytes);
        return Err(format!("Zotero HTTP {status}: {body}"));
    }

    serde_json::from_slice(&bytes).or_else(|_| {
        String::from_utf8(bytes.to_vec())
            .map(Value::String)
            .map_err(|err| format!("response was not valid JSON or UTF-8 text: {err}"))
    })
}

#[tauri::command]
async fn zotero_proxy_get_bytes(
    url: String,
    zotero_api_key: Option<String>,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let headers = apply_api_key(HeaderMap::new(), zotero_api_key);

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|err| format!("proxy request failed for {url}: {err}"))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("failed to read proxy response body: {err}"))?
        .to_vec();

    if !status.is_success() {
        let body = String::from_utf8_lossy(&bytes);
        return Err(format!("Zotero HTTP {status}: {body}"));
    }

    Ok(bytes)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            select_directory_dialog,
            save_markdown_file,
            ensure_dir,
            save_png_bytes,
            load_settings,
            save_settings,
            write_temp_debug_dump,
            zotero_proxy_get_json,
            zotero_proxy_get_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
