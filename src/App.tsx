import { useEffect, useMemo, useState } from 'react';
import { Database, FileDown, RefreshCw, Settings2, TestTube2 } from 'lucide-react';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ItemPicker } from '@/components/ItemPicker';
import { PreviewPanel } from '@/components/PreviewPanel';
import { Toasts, type ToastMessage } from '@/components/Toasts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettings, ItemPreview, ItemSummary, ZoteroItemData } from '@/lib/types';
import {
  ensureDir,
  loadSettings,
  saveMarkdownFile,
  savePngBytes,
  saveSettings,
  writeTempDebugDump,
} from '@/lib/tauri';
import { ZoteroClient } from '@/lib/zotero';
import { resolveCiteKey } from '@/lib/citekey';
import { addMissingImageTodo, prepareExport, renderPreparedExport } from '@/lib/exporter';
import { extractYear } from '@/lib/utils';

const DEFAULT_SETTINGS: AppSettings = {
  markdownDir: '',
  attachmentBaseDir: '',
  zoteroApiKey: '',
  zoteroBaseUrl: 'http://127.0.0.1:23119',
};

type ConnectionState = 'unknown' | 'checking' | 'connected' | 'disconnected';

function settingsConfigured(settings: AppSettings): boolean {
  return Boolean(
    settings.markdownDir.trim() &&
      settings.attachmentBaseDir.trim() &&
      settings.zoteroApiKey.trim() &&
      settings.zoteroBaseUrl.trim(),
  );
}

function toAuthorString(item: ZoteroItemData): string {
  const creators = Array.isArray(item.data.creators) ? (item.data.creators as Array<Record<string, unknown>>) : [];

  return creators
    .map((creator) => {
      const last = typeof creator.lastName === 'string' ? creator.lastName : '';
      const first = typeof creator.firstName === 'string' ? creator.firstName : '';
      const full = typeof creator.name === 'string' ? creator.name : '';
      if (last || first) {
        return [last, first].filter(Boolean).join(', ');
      }
      return full;
    })
    .filter(Boolean)
    .join('; ');
}

function buildPreview(item: ZoteroItemData, citeKey: string): ItemPreview {
  return {
    key: item.key,
    title: String(item.data.title ?? ''),
    authors: toAuthorString(item),
    year: extractYear(String(item.data.date ?? '')),
    citeKey,
  };
}

function connectionText(state: ConnectionState): string {
  if (state === 'checking') {
    return 'Checking Zotero...';
  }
  if (state === 'connected') {
    return 'Connected';
  }
  if (state === 'disconnected') {
    return 'Disconnected';
  }
  return 'Unknown';
}

function connectionClass(state: ConnectionState): string {
  if (state === 'connected') {
    return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40';
  }
  if (state === 'disconnected') {
    return 'bg-rose-500/15 text-rose-200 border-rose-400/40';
  }
  if (state === 'checking') {
    return 'bg-amber-500/15 text-amber-200 border-amber-400/40';
  }
  return 'bg-slate-500/15 text-slate-200 border-slate-400/40';
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown');

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedItem, setSelectedItem] = useState<ZoteroItemData | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<ItemPreview | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [dryRunOutput, setDryRunOutput] = useState('');

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (level: ToastMessage['level'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, level, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((entry) => entry.id !== id));
    }, 6000);
  };

  const client = useMemo(() => new ZoteroClient(settings), [settings]);
  const canExport = settingsConfigured(settings) && selectedItem !== null && !isExporting;

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadSettings();
        setSettings(loaded);
        if (!settingsConfigured(loaded)) {
          setSettingsOpen(true);
        }
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  useEffect(() => {
    if (!settingsConfigured(settings)) {
      setConnectionState('unknown');
      return;
    }

    let cancelled = false;

    void (async () => {
      setConnectionState('checking');
      const ok = await client.ping();
      if (!cancelled) {
        setConnectionState(ok ? 'connected' : 'disconnected');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, settings]);

  useEffect(() => {
    if (!settingsConfigured(settings)) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(() => {
      setLoadingItems(true);
      void client
        .searchItems(query)
        .then((result) => {
          if (!cancelled) {
            setItems(result);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            addToast('error', error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingItems(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [client, query, settings]);

  const onSaveSettings = async (next: AppSettings) => {
    await saveSettings(next);
    setSettings(next);
  };

  const onSelectItem = async (item: ItemSummary) => {
    try {
      const full = await client.getItem(item.key);
      let citeKey = '';
      try {
        citeKey = resolveCiteKey(full);
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : String(error));
      }

      setSelectedItem(full);
      setSelectedPreview(buildPreview(full, citeKey));
    } catch (error) {
      setSelectedItem(null);
      setSelectedPreview(null);
      addToast('error', error instanceof Error ? error.message : String(error));
    }
  };

  const runDebugDump = async () => {
    if (!selectedItem) {
      addToast('error', 'Pick an item before running debug dump.');
      return;
    }

    try {
      const payload = await client.buildDebugPayload(selectedItem.key);
      const filePath = await writeTempDebugDump('zotero-debug', JSON.stringify(payload, null, 2));
      addToast('success', `Debug dump saved: ${filePath}`);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : String(error));
    }
  };

  const runExport = async (dryRun: boolean) => {
    if (!selectedItem) {
      return;
    }

    setIsExporting(true);
    setDryRunOutput('');

    try {
      const freshItem = await client.getItem(selectedItem.key);
      const freshAnnotations = await client.getAnnotationsForItem(selectedItem.key);
      const citeKey = resolveCiteKey(freshItem);

      let prepared = prepareExport({
        markdownDir: settings.markdownDir,
        attachmentBaseDir: settings.attachmentBaseDir,
        citeKey,
        item: freshItem,
        annotations: freshAnnotations,
      });

      const imageWarnings: string[] = [];
      if (!dryRun && prepared.imagePlans.length > 0) {
        await ensureDir(settings.attachmentBaseDir);
        await ensureDir(`${settings.attachmentBaseDir}/attachment/${citeKey}`);
      }

      for (const imagePlan of prepared.imagePlans) {
        const bytes = await client.getSelectedAreaImage(imagePlan.annotationKey, imagePlan.attachmentKey);
        if (!bytes || bytes.length === 0) {
          const warning = `Selected-area image missing for annotation ${imagePlan.annotationKey}.`;
          prepared = addMissingImageTodo(prepared, imagePlan.annotationKey, warning);
          imageWarnings.push(warning);
          continue;
        }

        if (!dryRun) {
          await savePngBytes(imagePlan.absolutePath, Array.from(bytes));
        }
      }

      const markdown = renderPreparedExport(prepared);

      if (dryRun) {
        const imagePlanLines = prepared.imagePlans.map((plan) => `- ${plan.fileName} -> ${plan.absolutePath}`).join('\n');
        const warningLines = imageWarnings.length > 0 ? `\nWarnings:\n${imageWarnings.map((w) => `- ${w}`).join('\n')}` : '';
        setDryRunOutput(`Markdown path: ${prepared.markdownPath}\n\nImage plan:\n${imagePlanLines || '- (none)'}${warningLines}\n\n${markdown}`);
        addToast('info', 'Dry run complete. No files were written.');
      } else {
        await ensureDir(settings.markdownDir);
        await saveMarkdownFile(prepared.markdownPath, markdown);
        addToast('success', `Exported @${citeKey}.md`);
      }

      if (imageWarnings.length > 0) {
        addToast('error', `${imageWarnings.length} select-area image(s) could not be retrieved. TODO markers were added.`);
      }

      setSelectedItem(freshItem);
      setSelectedPreview(buildPreview(freshItem, citeKey));
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_hsl(213_36%_16%),_hsl(210_28%_7%))] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-6 pt-4">
        <header className="mb-4 flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Zotero connection status</p>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${connectionClass(connectionState)}`}>
              {connectionText(connectionState)}
            </span>
          </div>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Library items</CardTitle>
              <CardDescription>Search and select a Zotero item for annotation export.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ItemPicker
                query={query}
                onQueryChange={setQuery}
                items={items}
                isLoading={loadingItems}
                selectedItemKey={selectedItem?.key ?? ''}
                onSelect={(item) => void onSelectItem(item)}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void runExport(false)}
                  disabled={!canExport}
                  className="min-w-[120px]"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FileDown className="mr-2 h-4 w-4" />
                      Export
                    </>
                  )}
                </Button>

                <Button type="button" variant="outline" disabled={!canExport} onClick={() => void runExport(true)}>
                  Dry run
                </Button>

                <Button type="button" variant="outline" disabled={!selectedItem} onClick={() => void runDebugDump()}>
                  <TestTube2 className="mr-2 h-4 w-4" />
                  Debug: Dump JSON
                </Button>
              </div>

              {dryRunOutput && (
                <div className="rounded-md border border-border bg-black/30 p-3">
                  <p className="mb-2 text-sm font-medium">Dry run output</p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                    {dryRunOutput}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <PreviewPanel preview={selectedPreview} />
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onToast={addToast}
      />

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((entry) => entry.id !== id))} />
    </div>
  );
}
