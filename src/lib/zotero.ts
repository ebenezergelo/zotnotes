import { zoteroProxyGetBytes, zoteroProxyGetJson } from './tauri';
import type { AnnotationModel, AppSettings, ItemSummary, ZoteroItemData } from './types';
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

export class ZoteroClient {
  private readonly baseUrl: string;

  private readonly apiKey: string;

  constructor(settings: AppSettings) {
    this.baseUrl = ensureTrailingSlash(settings.zoteroBaseUrl.trim() || 'http://127.0.0.1:23119').replace(/\/+$/, '');
    this.apiKey = settings.zoteroApiKey;
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

  async ping(): Promise<boolean> {
    try {
      const value = await this.requestText('/connector/ping');
      return value.toLowerCase().includes('ok') || value.toLowerCase().includes('pong') || value.length > 0;
    } catch {
      return false;
    }
  }

  async searchItems(query: string): Promise<ItemSummary[]> {
    const search = encodeURIComponent(query.trim());
    const qPart = search ? `&q=${search}&qmode=titleCreatorYear` : '';

    // Endpoint observed in Zotero docs for local API parity: /api/users/0/items
    const raw = await this.requestJson(`/api/users/0/items?limit=75&sort=title&direction=asc${qPart}`);
    const items = asArray<unknown>(raw)
      .map((entry) => shapeItem(entry))
      .filter((entry) => {
        const itemType = String(entry.data.itemType ?? '');
        return !['attachment', 'note', 'annotation'].includes(itemType);
      });

    return items.map((item) => ({
      key: item.key,
      title: String(item.data.title ?? '(untitled)'),
      creators: creatorsSummary(item),
      year: String(item.data.date ?? '').match(/\d{4}/)?.[0] ?? '',
    }));
  }

  async getItem(itemKey: string): Promise<ZoteroItemData> {
    const raw = await this.requestJson(`/api/users/0/items/${encodeURIComponent(itemKey)}`);
    return shapeItem(raw);
  }

  async getItemChildren(itemKey: string): Promise<ZoteroItemData[]> {
    const raw = await this.requestJson(`/api/users/0/items/${encodeURIComponent(itemKey)}/children?limit=200`);
    return asArray<unknown>(raw).map((entry) => shapeItem(entry));
  }

  async getAnnotationsForItem(itemKey: string): Promise<AnnotationModel[]> {
    const parentChildren = await this.getItemChildren(itemKey);
    const attachmentKeys = parentChildren
      .filter((child) => String(child.data.itemType ?? '') === 'attachment')
      .map((child) => child.key);

    const directAnnotations = parentChildren.filter((child) => String(child.data.itemType ?? '') === 'annotation');

    const attachmentsChildren = await Promise.all(
      attachmentKeys.map(async (attachmentKey) => {
        const children = await this.getItemChildren(attachmentKey);
        return { attachmentKey, children };
      }),
    );

    const nestedAnnotations = attachmentsChildren.flatMap(({ attachmentKey, children }) =>
      children
        .filter((child) => String(child.data.itemType ?? '') === 'annotation')
        .map((child) => ({ child, attachmentKey })),
    );

    const normalizedDirect = directAnnotations.map((annotation, index) =>
      normalizeAnnotation(annotation, String(annotation.data.parentItem ?? itemKey), index),
    );

    const normalizedNested = nestedAnnotations.map(({ child, attachmentKey }, index) =>
      normalizeAnnotation(child, attachmentKey, index + normalizedDirect.length),
    );

    return [...normalizedDirect, ...normalizedNested];
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

    return null;
  }

  async buildDebugPayload(itemKey: string): Promise<Record<string, unknown>> {
    const item = await this.getItem(itemKey);
    const children = await this.getItemChildren(itemKey);

    const attachmentKeys = children
      .filter((child) => String(child.data.itemType ?? '') === 'attachment')
      .map((child) => child.key);

    const annotationsPerAttachment = await Promise.all(
      attachmentKeys.map(async (attachmentKey) => ({
        attachmentKey,
        children: await this.getItemChildren(attachmentKey),
      })),
    );

    return {
      item,
      children,
      annotationsPerAttachment,
    };
  }
}
