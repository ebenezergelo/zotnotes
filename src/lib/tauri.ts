import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, ItemSummary, ZoteroItemData } from './types';

export interface SqliteAnnotationPayload {
  key: string;
  attachmentKey: string;
  colorHex: string;
  text: string;
  comment: string;
  pageLabel: string;
  sortIndex: number;
  isImageSelection: boolean;
}

const LOCAL_STORAGE_KEY = 'zotnotes-settings';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function defaultSettings(): AppSettings {
  return {
    markdownDir: '',
    attachmentBaseDir: '',
    zoteroApiKey: '',
    zoteroBaseUrl: 'http://127.0.0.1:23119',
    templateSettings: {
      propertyOrder: ['title', 'author', 'year', 'company'],
      colorHeadingOverrides: {},
    },
  };
}

export async function selectDirectoryDialog(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<string | null>('select_directory_dialog');
}

export async function saveMarkdownFile(path: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Filesystem write is only available in Tauri runtime.');
  }
  await invoke('save_markdown_file', { path, content });
}

export async function ensureDir(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Directory creation is only available in Tauri runtime.');
  }
  await invoke('ensure_dir', { path });
}

export async function savePngBytes(path: string, bytes: number[]): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Binary write is only available in Tauri runtime.');
  }
  await invoke('save_png_bytes', { path, bytes });
}

export async function loadSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return defaultSettings();
    }

    try {
      const parsed = JSON.parse(raw) as AppSettings;
      const defaults = defaultSettings();
      return {
        ...defaults,
        ...parsed,
        templateSettings: {
          ...defaults.templateSettings,
          ...(parsed.templateSettings ?? {}),
          colorHeadingOverrides: {
            ...defaults.templateSettings.colorHeadingOverrides,
            ...(parsed.templateSettings?.colorHeadingOverrides ?? {}),
          },
        },
      };
    } catch {
      return defaultSettings();
    }
  }

  return invoke<AppSettings>('load_settings');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    return;
  }
  await invoke('save_settings', { settings });
}

export async function writeTempDebugDump(prefix: string, content: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Debug dump is only available in Tauri runtime.');
  }
  return invoke<string>('write_temp_debug_dump', { prefix, content });
}

export async function zoteroProxyGetJson(url: string, zoteroApiKey: string): Promise<unknown> {
  if (!isTauriRuntime()) {
    throw new Error('Zotero proxy is only available in Tauri runtime.');
  }

  return invoke<unknown>('zotero_proxy_get_json', {
    url,
    zoteroApiKey: zoteroApiKey || null,
  });
}

export async function zoteroProxyGetBytes(url: string, zoteroApiKey: string): Promise<Uint8Array> {
  if (!isTauriRuntime()) {
    throw new Error('Zotero proxy is only available in Tauri runtime.');
  }

  const values = await invoke<number[]>('zotero_proxy_get_bytes', {
    url,
    zoteroApiKey: zoteroApiKey || null,
  });

  return new Uint8Array(values);
}

export async function zoteroSqliteSearchItems(query: string): Promise<ItemSummary[]> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite access is only available in Tauri runtime.');
  }

  return invoke<ItemSummary[]>('zotero_sqlite_search_items', { query });
}

export async function zoteroSqliteGetItem(itemKey: string): Promise<ZoteroItemData> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite access is only available in Tauri runtime.');
  }

  return invoke<ZoteroItemData>('zotero_sqlite_get_item', { itemKey });
}

export async function zoteroSqliteGetAnnotations(itemKey: string): Promise<SqliteAnnotationPayload[]> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite access is only available in Tauri runtime.');
  }

  return invoke<SqliteAnnotationPayload[]>('zotero_sqlite_get_annotations', { itemKey });
}

export async function zoteroSqliteGetCachedAnnotationImage(annotationKey: string): Promise<Uint8Array> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite access is only available in Tauri runtime.');
  }

  const values = await invoke<number[]>('zotero_sqlite_get_cached_annotation_image', { annotationKey });
  return new Uint8Array(values);
}

export async function zoteroSqliteGetCitationKey(itemKey: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite access is only available in Tauri runtime.');
  }

  return invoke<string | null>('zotero_sqlite_get_citation_key', { itemKey });
}
