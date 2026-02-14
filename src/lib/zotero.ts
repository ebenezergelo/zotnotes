import {
  type SqliteAnnotationPayload,
  zoteroProxyGetBytes,
  zoteroProxyGetJson,
  zoteroSqliteGetAnnotations,
  zoteroSqliteGetCachedAnnotationImage,
  zoteroSqliteGetCitationKey,
  zoteroSqliteGetItem,
  zoteroSqliteSearchItems,
} from './tauri';
import type { AnnotationModel, AppSettings, ItemSummary, ZoteroItemData } from './types';
import { colorNameFromHex } from './colors';
import { normalizeAnnotation } from './exporter';
import { ensureTrailingSlash } from './utils';

function toHeaders(apiKey: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/json',
  };

  if (apiKey.trim()) {
    headers['Zotero-API-Key'] = apiKey.trim();
  }

  return headers;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shapeItem(raw: unknown): ZoteroItemData {
  if (!isRecord(raw)) {
    throw new Error('Unexpected Zotero response item shape.');
  }

  const key = String(raw.key ?? '');
  if (!key) {
    throw new Error('Zotero response item is missing key.');
  }

  const data = isRecord(raw.data) ? raw.data : {};
  const meta = isRecord(raw.meta) ? raw.meta : undefined;

  return {
    key,
    data,
    meta,
  };
}

function creatorsSummary(item: ZoteroItemData): string {
  const creators = asArray<Record<string, unknown>>(item.data.creators);

  return creators
    .map((creator) => {
      const lastName = typeof creator.lastName === 'string' ? creator.lastName : '';
      const firstName = typeof creator.firstName === 'string' ? creator.firstName : '';
      const fullName = typeof creator.name === 'string' ? creator.name : '';
      if (lastName || firstName) {
        return [lastName, firstName].filter(Boolean).join(', ');
      }
      return fullName;
    })
    .filter(Boolean)
    .join('; ');
}

function normalizeSqliteAnnotation(annotation: SqliteAnnotationPayload): AnnotationModel {
  const colorHex = annotation.colorHex.trim().toLowerCase();
  return {
    key: annotation.key,
    attachmentKey: annotation.attachmentKey,
    colorHex,
    colorName: colorNameFromHex(colorHex),
    text: annotation.text.trim(),
    comment: annotation.comment.trim(),
    pageLabel: annotation.pageLabel.trim(),
    sortIndex: annotation.sortIndex,
    isImageSelection: annotation.isImageSelection,
  };
}

function isUsableTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized.length > 0 && normalized !== '(untitled)';
}

function sanitizeSearchResults(items: ItemSummary[]): ItemSummary[] {
  return items.filter((item) => isUsableTitle(item.title)).map((item) => ({
    ...item,
    title: item.title.trim(),
    creators: item.creators.trim(),
    year: item.year.trim(),
  }));
}

export class ZoteroClient {
  private readonly baseUrl: string;

  private readonly apiKey: string;

  constructor(settings: AppSettings) {
    this.baseUrl = ensureTrailingSlash(settings.zoteroBaseUrl.trim() || 'http://127.0.0.1:23119').replace(/\/+$/, '');
    this.apiKey = settings.zoteroApiKey;
  }

  private async getItemsByParent(parentKey: string, itemType?: string): Promise<ZoteroItemData[]> {
    const params = new URLSearchParams();
    params.set('parentItem', parentKey);
    params.set('limit', '200');
    if (itemType) {
      params.set('itemType', itemType);
    }

    const raw = await this.requestJson(`/api/users/0/items?${params.toString()}`);
    return asArray<unknown>(raw).map((entry) => shapeItem(entry));
  }

  private async requestJson(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        headers: toHeaders(this.apiKey),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Zotero HTTP ${response.status}: ${text || 'request failed'}`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      // If browser fetch is blocked by CORS in the embedded webview, fallback to a Rust proxy command.
      return zoteroProxyGetJson(url, this.apiKey).catch((proxyError: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const proxyMessage = proxyError instanceof Error ? proxyError.message : String(proxyError);
        throw new Error(`${message}. Proxy fallback also failed: ${proxyMessage}`);
      });
    }
  }

  private async requestText(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        headers: {
          ...toHeaders(this.apiKey),
          Accept: 'text/plain, application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Zotero HTTP ${response.status}: ${text || 'request failed'}`);
      }

      return response.text();
    } catch (error) {
      const fallback = await zoteroProxyGetJson(url, this.apiKey);
      if (typeof fallback === 'string') {
        return fallback;
      }
      return JSON.stringify(fallback);
    }
  }

  async getBetterBibTexCiteKey(itemKey: string): Promise<string> {
    try {
      const sqliteCiteKey = await zoteroSqliteGetCitationKey(itemKey);
      const normalized = typeof sqliteCiteKey === 'string' ? sqliteCiteKey.trim() : '';
      if (normalized) {
        return normalized;
      }
    } catch {
      // Continue to HTTP fallback.
    }

    const endpoint = `/better-bibtex/cayw?format=citationkey&key=${encodeURIComponent(itemKey)}`;
    try {
      const raw = await this.requestText(endpoint);
      const normalized = raw.trim().replace(/^[@\s]+/, '');
      return normalized;
    } catch {
      return '';
    }
  }

  async ping(): Promise<boolean> {
    try {
      const value = await this.requestText('/connector/ping');
      if (value.toLowerCase().includes('ok') || value.toLowerCase().includes('pong') || value.length > 0) {
        return true;
      }
    } catch {
      // Fallback below.
    }

    try {
      const raw = await this.requestJson('/api/users/0/items?limit=1');
      return Array.isArray(raw) || isRecord(raw);
    } catch {
      try {
        await zoteroSqliteSearchItems('');
        return true;
      } catch {
        return false;
      }
    }
  }

  async searchItems(query: string): Promise<ItemSummary[]> {
    const search = encodeURIComponent(query.trim());
    const qPart = search ? `&q=${search}&qmode=titleCreatorYear` : '';

    try {
      // Endpoint observed in Zotero docs for local API parity: /api/users/0/items
      const raw = await this.requestJson(`/api/users/0/items?limit=75&sort=title&direction=asc${qPart}`);
      const items = asArray<unknown>(raw)
        .map((entry) => shapeItem(entry))
        .filter((entry) => {
          const itemType = String(entry.data.itemType ?? '');
          return !['attachment', 'note', 'annotation'].includes(itemType);
        });

      const mapped = items.map((item) => ({
        key: item.key,
        title: String(item.data.title ?? ''),
        creators: creatorsSummary(item),
        year: String(item.data.date ?? '').match(/\d{4}/)?.[0] ?? '',
      }));
      return sanitizeSearchResults(mapped);
    } catch (apiError) {
      try {
        const sqliteResults = await zoteroSqliteSearchItems(query);
        return sanitizeSearchResults(sqliteResults);
      } catch (sqliteError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        const sqliteMessage = sqliteError instanceof Error ? sqliteError.message : String(sqliteError);
        throw new Error(`Zotero search failed via HTTP API (${apiMessage}) and SQLite fallback (${sqliteMessage}).`);
      }
    }
  }

  async getItem(itemKey: string): Promise<ZoteroItemData> {
    try {
      const raw = await this.requestJson(`/api/users/0/items/${encodeURIComponent(itemKey)}`);
      return shapeItem(raw);
    } catch (apiError) {
      try {
        return await zoteroSqliteGetItem(itemKey);
      } catch (sqliteError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        const sqliteMessage = sqliteError instanceof Error ? sqliteError.message : String(sqliteError);
        throw new Error(`Zotero item lookup failed via HTTP API (${apiMessage}) and SQLite fallback (${sqliteMessage}).`);
      }
    }
  }

  async getItemChildren(itemKey: string): Promise<ZoteroItemData[]> {
    try {
      const raw = await this.requestJson(`/api/users/0/items/${encodeURIComponent(itemKey)}/children?limit=200`);
      return asArray<unknown>(raw).map((entry) => shapeItem(entry));
    } catch {
      // Some local API builds expose child access more reliably via parentItem query.
      return this.getItemsByParent(itemKey);
    }
  }

  async getAnnotationsForItem(itemKey: string): Promise<AnnotationModel[]> {
    try {
      const sqliteAnnotations = await zoteroSqliteGetAnnotations(itemKey);
      return sqliteAnnotations.map((entry) => normalizeSqliteAnnotation(entry));
    } catch {
      // Fall through to HTTP API strategy for environments where direct DB access is unavailable.
    }

    const byKey = new Map<string, { item: ZoteroItemData; attachmentKey: string; sortIndex: number }>();
    let sortCounter = 0;

    const addAnnotation = (annotation: ZoteroItemData, attachmentKey: string) => {
      if (byKey.has(annotation.key)) {
        return;
      }

      byKey.set(annotation.key, {
        item: annotation,
        attachmentKey,
        sortIndex: sortCounter,
      });
      sortCounter += 1;
    };

    const parentChildren = await this.getItemChildren(itemKey);
    const parentQueryChildren = await this.getItemsByParent(itemKey).catch(() => []);

    const attachmentKeys = new Set<string>();
    [...parentChildren, ...parentQueryChildren]
      .filter((child) => String(child.data.itemType ?? '') === 'attachment')
      .forEach((child) => attachmentKeys.add(child.key));

    [...parentChildren, ...parentQueryChildren]
      .filter((child) => String(child.data.itemType ?? '') === 'annotation')
      .forEach((annotation) => {
        const parentAttachment = String(annotation.data.parentItem ?? itemKey);
        addAnnotation(annotation, parentAttachment);
      });

    for (const attachmentKey of attachmentKeys) {
      const attachmentChildren = await this.getItemChildren(attachmentKey).catch(() => []);
      const attachmentQueryAnnotations = await this.getItemsByParent(attachmentKey, 'annotation').catch(() => []);

      [...attachmentChildren, ...attachmentQueryAnnotations]
        .filter((child) => String(child.data.itemType ?? '') === 'annotation')
        .forEach((annotation) => addAnnotation(annotation, attachmentKey));
    }

    return [...byKey.values()].map(({ item, attachmentKey, sortIndex }) =>
      normalizeAnnotation(item, attachmentKey, sortIndex),
    );
  }

  async getSelectedAreaImage(annotationKey: string, attachmentKey?: string): Promise<Uint8Array | null> {
    const candidates = [
      `/api/users/0/items/${encodeURIComponent(annotationKey)}/file`,
      `/api/users/0/items/${encodeURIComponent(annotationKey)}/file/view`,
    ];

    if (attachmentKey) {
      // Fallback strategy: attempt attachment file endpoints with annotation query hints.
      // Depending on Zotero build/plugin behavior, this may return PNG bytes or a non-image payload.
      candidates.push(
        `/api/users/0/items/${encodeURIComponent(attachmentKey)}/file?annotation=${encodeURIComponent(annotationKey)}`,
      );
      candidates.push(
        `/api/users/0/items/${encodeURIComponent(attachmentKey)}/file/view?annotation=${encodeURIComponent(annotationKey)}`,
      );
    }

    for (const path of candidates) {
      const url = `${this.baseUrl}${path}`;
      try {
        const response = await fetch(url, {
          headers: {
            ...toHeaders(this.apiKey),
            Accept: 'image/png, application/octet-stream;q=0.9, */*;q=0.8',
          },
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          if (bytes.length > 0) {
            return bytes;
          }
        }
      } catch {
        // Continue to proxy fallback.
      }

      try {
        const bytes = await zoteroProxyGetBytes(url, this.apiKey);
        if (bytes.length > 0) {
          return bytes;
        }
      } catch {
        // Try next candidate endpoint.
      }
    }

    try {
      const cached = await zoteroSqliteGetCachedAnnotationImage(annotationKey);
      if (cached.length > 0) {
        return cached;
      }
    } catch {
      // Ignore cache misses and return null below.
    }

    return null;
  }

  async buildDebugPayload(itemKey: string): Promise<Record<string, unknown>> {
    const item = await this.getItem(itemKey);
    const children = await this.getItemChildren(itemKey);
    const childrenByParentQuery = await this.getItemsByParent(itemKey).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));

    const attachmentKeys = children
      .filter((child) => String(child.data.itemType ?? '') === 'attachment')
      .map((child) => child.key);
    if (Array.isArray(childrenByParentQuery)) {
      childrenByParentQuery
        .filter((child) => String((child as ZoteroItemData).data.itemType ?? '') === 'attachment')
        .forEach((child) => attachmentKeys.push((child as ZoteroItemData).key));
    }

    const uniqueAttachmentKeys = [...new Set(attachmentKeys)];

    const annotationsPerAttachment = await Promise.all(
      uniqueAttachmentKeys.map(async (attachmentKey) => {
        const childEndpoint = await this.getItemChildren(attachmentKey).catch((error: unknown) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
        const parentQueryEndpoint = await this.getItemsByParent(attachmentKey, 'annotation').catch((error: unknown) => ({
          error: error instanceof Error ? error.message : String(error),
        }));

        return {
          attachmentKey,
          childrenViaChildrenEndpoint: childEndpoint,
          annotationsViaParentQuery: parentQueryEndpoint,
        };
      }),
    );

    const normalizedAnnotations = await this.getAnnotationsForItem(itemKey).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    const sqliteAnnotations = await zoteroSqliteGetAnnotations(itemKey).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));

    return {
      item,
      children,
      childrenByParentQuery,
      attachmentKeys: uniqueAttachmentKeys,
      annotationsPerAttachment,
      normalizedAnnotations,
      sqliteAnnotations,
    };
  }
}
