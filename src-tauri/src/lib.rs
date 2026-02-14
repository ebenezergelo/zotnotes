use reqwest::header::HeaderMap;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Map;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct AppSettings {
    markdown_dir: String,
    attachment_base_dir: String,
    zotero_api_key: String,
    zotero_base_url: String,
    template_settings: TemplateSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct TemplateSettings {
    property_order: Vec<String>,
    color_heading_overrides: BTreeMap<String, String>,
}

impl Default for TemplateSettings {
    fn default() -> Self {
        Self {
            property_order: vec![
                "title".to_string(),
                "author".to_string(),
                "year".to_string(),
                "company".to_string(),
            ],
            color_heading_overrides: BTreeMap::new(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            markdown_dir: String::new(),
            attachment_base_dir: String::new(),
            zotero_api_key: String::new(),
            zotero_base_url: "http://127.0.0.1:23119".to_string(),
            template_settings: TemplateSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteItemSummary {
    key: String,
    title: String,
    creators: String,
    year: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteAnnotation {
    key: String,
    attachment_key: String,
    color_hex: String,
    text: String,
    comment: String,
    page_label: String,
    sort_index: usize,
    is_image_selection: bool,
}

fn extract_year(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    if chars.len() < 4 {
        return String::new();
    }

    for idx in 0..=(chars.len() - 4) {
        let chunk = &chars[idx..idx + 4];
        if chunk.iter().all(|ch| ch.is_ascii_digit()) {
            return chunk.iter().collect();
        }
    }

    String::new()
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable is not set.".to_string())
}

fn resolve_zotero_sqlite_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("ZOTERO_SQLITE_PATH") {
        let candidate = PathBuf::from(path.trim());
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let home = home_dir()?;
    let candidates = [
        home.join("Zotero").join("zotero.sqlite"),
        home.join("Zotero Beta").join("zotero.sqlite"),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "Could not locate zotero.sqlite. Set ZOTERO_SQLITE_PATH to the database file.".to_string())
}

fn resolve_zotero_profile_dir() -> Result<PathBuf, String> {
    let sqlite_path = resolve_zotero_sqlite_path()?;
    sqlite_path
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| format!("failed to resolve Zotero profile directory from {}", sqlite_path.display()))
}

fn sqlite_file_uri(path: &PathBuf) -> String {
    let escaped = path
        .to_string_lossy()
        .replace('%', "%25")
        .replace('?', "%3F")
        .replace('#', "%23")
        .replace(' ', "%20");
    format!("file:{escaped}?immutable=1")
}

fn open_zotero_connection() -> Result<Connection, String> {
  let path = resolve_zotero_sqlite_path()?;
  let uri = sqlite_file_uri(&path);

    Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
  .map_err(|err| format!("failed to open Zotero database {}: {err}", path.display()))
}

fn resolve_better_bibtex_sqlite_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("ZOTERO_BBT_SQLITE_PATH") {
        let candidate = PathBuf::from(path.trim());
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let home = home_dir().ok()?;
    let candidates = [
        home.join("Zotero").join("better-bibtex.sqlite"),
        home.join("Zotero Beta").join("better-bibtex.sqlite"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn open_better_bibtex_connection() -> Result<Connection, String> {
    let path = resolve_better_bibtex_sqlite_path()
        .ok_or_else(|| "Could not locate better-bibtex.sqlite".to_string())?;
    let uri = sqlite_file_uri(&path);

    Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|err| format!("failed to open Better BibTeX database {}: {err}", path.display()))
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

#[tauri::command]
fn zotero_sqlite_search_items(query: String) -> Result<Vec<SqliteItemSummary>, String> {
    let conn = open_zotero_connection()?;
    let term = query.trim().to_string();

    let mut stmt = conn
        .prepare(
            r#"
            WITH title_data AS (
                SELECT d.itemID AS itemID, CAST(v.value AS TEXT) AS value
                FROM itemData d
                JOIN fields f ON f.fieldID = d.fieldID
                JOIN itemDataValues v ON v.valueID = d.valueID
                WHERE f.fieldName = 'title'
            ),
            date_data AS (
                SELECT d.itemID AS itemID, CAST(v.value AS TEXT) AS value
                FROM itemData d
                JOIN fields f ON f.fieldID = d.fieldID
                JOIN itemDataValues v ON v.valueID = d.valueID
                WHERE f.fieldName = 'date'
            ),
            creator_data AS (
                SELECT
                    ic.itemID AS itemID,
                    GROUP_CONCAT(
                        CASE
                            WHEN c.fieldMode = 1 THEN COALESCE(c.lastName, '')
                            ELSE TRIM(
                                COALESCE(c.lastName, '') ||
                                CASE WHEN COALESCE(c.firstName, '') <> '' THEN ', ' || c.firstName ELSE '' END
                            )
                        END,
                        '; '
                    ) AS value
                FROM itemCreators ic
                JOIN creators c ON c.creatorID = ic.creatorID
                GROUP BY ic.itemID
            )
            SELECT
                i.key,
                COALESCE(title_data.value, '(untitled)') AS title,
                COALESCE(creator_data.value, '') AS creators,
                COALESCE(date_data.value, '') AS dateValue
            FROM items i
            JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
            LEFT JOIN title_data ON title_data.itemID = i.itemID
            LEFT JOIN date_data ON date_data.itemID = i.itemID
            LEFT JOIN creator_data ON creator_data.itemID = i.itemID
            WHERE
                it.typeName NOT IN ('attachment', 'note', 'annotation')
                AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
                AND (
                    ?1 = ''
                    OR LOWER(COALESCE(title_data.value, '')) LIKE '%' || LOWER(?1) || '%'
                    OR LOWER(COALESCE(creator_data.value, '')) LIKE '%' || LOWER(?1) || '%'
                    OR LOWER(COALESCE(date_data.value, '')) LIKE '%' || LOWER(?1) || '%'
                )
            ORDER BY LOWER(COALESCE(title_data.value, '')) ASC
            LIMIT ?2
            "#,
        )
        .map_err(|err| format!("failed to prepare Zotero search query: {err}"))?;

    let rows = stmt
        .query_map(params![term, 75_i64], |row| {
            let date_value: String = row.get(3)?;
            Ok(SqliteItemSummary {
                key: row.get(0)?,
                title: row.get(1)?,
                creators: row.get(2)?,
                year: extract_year(&date_value),
            })
        })
        .map_err(|err| format!("failed to execute Zotero search query: {err}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to read Zotero search rows: {err}"))
}

#[tauri::command]
fn zotero_sqlite_get_item(item_key: String) -> Result<Value, String> {
    let conn = open_zotero_connection()?;

    let (item_id, key, item_type): (i64, String, String) = conn
        .query_row(
            r#"
            SELECT i.itemID, i.key, it.typeName
            FROM items i
            JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
            WHERE i.key = ?1
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            LIMIT 1
            "#,
            params![item_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|err| format!("failed to load Zotero item: {err}"))?;

    let mut data = Map::new();
    data.insert("itemType".to_string(), Value::String(item_type));

    let mut field_stmt = conn
        .prepare(
            r#"
            SELECT f.fieldName, CAST(v.value AS TEXT) AS fieldValue
            FROM itemData d
            JOIN fields f ON f.fieldID = d.fieldID
            JOIN itemDataValues v ON v.valueID = d.valueID
            WHERE d.itemID = ?1
            "#,
        )
        .map_err(|err| format!("failed to prepare Zotero field query: {err}"))?;

    let field_rows = field_stmt
        .query_map(params![item_id], |row| {
            let field_name: String = row.get(0)?;
            let value: Option<String> = row.get(1)?;
            Ok((field_name, value.unwrap_or_default()))
        })
        .map_err(|err| format!("failed to execute Zotero field query: {err}"))?;

    for row in field_rows {
        let (field_name, value) =
            row.map_err(|err| format!("failed to read Zotero field row: {err}"))?;
        data.insert(field_name, Value::String(value));
    }

    let mut creators_stmt = conn
        .prepare(
            r#"
            SELECT c.firstName, c.lastName, c.fieldMode
            FROM itemCreators ic
            JOIN creators c ON c.creatorID = ic.creatorID
            WHERE ic.itemID = ?1
            ORDER BY ic.orderIndex ASC
            "#,
        )
        .map_err(|err| format!("failed to prepare Zotero creator query: {err}"))?;

    let creator_rows = creators_stmt
        .query_map(params![item_id], |row| {
            let first_name: Option<String> = row.get(0)?;
            let last_name: Option<String> = row.get(1)?;
            let field_mode: i64 = row.get(2)?;
            Ok((first_name.unwrap_or_default(), last_name.unwrap_or_default(), field_mode))
        })
        .map_err(|err| format!("failed to execute Zotero creator query: {err}"))?;

    let mut creators = Vec::<Value>::new();
    for creator in creator_rows {
        let (first_name, last_name, field_mode) =
            creator.map_err(|err| format!("failed to read Zotero creator row: {err}"))?;

        let mut creator_value = Map::new();
        if field_mode == 1 {
            creator_value.insert("name".to_string(), Value::String(last_name));
        } else {
            creator_value.insert("firstName".to_string(), Value::String(first_name));
            creator_value.insert("lastName".to_string(), Value::String(last_name));
        }
        creators.push(Value::Object(creator_value));
    }
    data.insert("creators".to_string(), Value::Array(creators));

    let mut payload = Map::new();
    payload.insert("key".to_string(), Value::String(key));
    payload.insert("data".to_string(), Value::Object(data));
    payload.insert("meta".to_string(), Value::Object(Map::new()));

    Ok(Value::Object(payload))
}

#[tauri::command]
fn zotero_sqlite_get_citation_key(item_key: String) -> Result<Option<String>, String> {
    let conn = match open_better_bibtex_connection() {
        Ok(conn) => conn,
        Err(_) => return Ok(None),
    };

    let citation_key = conn
        .query_row(
            r#"
            SELECT citationKey
            FROM citationkey
            WHERE itemKey = ?1
            LIMIT 1
            "#,
            params![item_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("failed to read Better BibTeX citation key: {err}"))?;

    Ok(citation_key.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }))
}

#[tauri::command]
fn zotero_sqlite_get_annotations(item_key: String) -> Result<Vec<SqliteAnnotation>, String> {
    let conn = open_zotero_connection()?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                anno.key AS annotationKey,
                att.key AS attachmentKey,
                COALESCE(ia.color, '') AS colorHex,
                COALESCE(ia.text, '') AS annotationText,
                COALESCE(ia.comment, '') AS annotationComment,
                COALESCE(ia.pageLabel, '') AS pageLabel,
                ia.sortIndex AS sortKey,
                ia.type AS annotationType
            FROM items root
            JOIN itemAttachments iatt ON iatt.parentItemID = root.itemID
            JOIN items att ON att.itemID = iatt.itemID
            JOIN itemAnnotations ia ON ia.parentItemID = att.itemID
            JOIN items anno ON anno.itemID = ia.itemID
            WHERE root.key = ?1
              AND anno.itemID NOT IN (SELECT itemID FROM deletedItems)
            ORDER BY att.itemID ASC, ia.sortIndex ASC, anno.itemID ASC
            "#,
        )
        .map_err(|err| format!("failed to prepare Zotero annotation query: {err}"))?;

    let rows = stmt
        .query_map(params![item_key], |row| {
            let annotation_type: i64 = row.get(7)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                annotation_type,
            ))
        })
        .map_err(|err| format!("failed to execute Zotero annotation query: {err}"))?;

    let mut annotations = Vec::<SqliteAnnotation>::new();
    for (sort_index, row) in rows.enumerate() {
        let (key, attachment_key, color_hex, text, comment, page_label, annotation_type) =
            row.map_err(|err| format!("failed to read Zotero annotation row: {err}"))?;

        annotations.push(SqliteAnnotation {
            key,
            attachment_key,
            color_hex: color_hex.trim().to_lowercase(),
            text: text.trim().to_string(),
            comment: comment.trim().to_string(),
            page_label: page_label.trim().to_string(),
            sort_index,
            is_image_selection: annotation_type == 3,
        });
    }

    Ok(annotations)
}

#[tauri::command]
fn zotero_sqlite_get_cached_annotation_image(annotation_key: String) -> Result<Vec<u8>, String> {
    let conn = open_zotero_connection()?;
    let profile_dir = resolve_zotero_profile_dir()?;

    let library_scope = conn
        .query_row(
            r#"
            SELECT l.type, g.groupID
            FROM items i
            JOIN libraries l ON l.libraryID = i.libraryID
            LEFT JOIN groups g ON g.libraryID = l.libraryID
            WHERE i.key = ?1
            LIMIT 1
            "#,
            params![annotation_key.clone()],
            |row| {
                let library_type: String = row.get(0)?;
                let group_id: Option<i64> = row.get(1)?;
                Ok((library_type, group_id))
            },
        )
        .map_err(|err| format!("failed to resolve annotation library for cached image: {err}"))?;

    let (library_type, group_id) = library_scope;
    let mut candidates = Vec::<PathBuf>::new();

    candidates.push(
        profile_dir
            .join("cache")
            .join("library")
            .join(format!("{annotation_key}.png")),
    );

    if library_type == "group" {
        if let Some(group_id) = group_id {
            candidates.push(
                profile_dir
                    .join("cache")
                    .join("groups")
                    .join(group_id.to_string())
                    .join(format!("{annotation_key}.png")),
            );
            candidates.push(
                profile_dir
                    .join("cache")
                    .join("groups")
                    .join(group_id.to_string())
                    .join("library")
                    .join(format!("{annotation_key}.png")),
            );
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return std::fs::read(&candidate)
                .map_err(|err| format!("failed to read cached annotation image {}: {err}", candidate.display()));
        }
    }

    Err(format!(
        "no cached annotation image found for {} in Zotero cache.",
        annotation_key
    ))
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
            zotero_sqlite_search_items,
            zotero_sqlite_get_item,
            zotero_sqlite_get_citation_key,
            zotero_sqlite_get_annotations,
            zotero_sqlite_get_cached_annotation_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
