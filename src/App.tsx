import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowDownUp,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileDown,
  FlaskConical,
  Folder,
  GripVertical,
  Hash,
  KeyRound,
  LibraryBig,
  Link2,
  LoaderCircle,
  Menu,
  Paintbrush2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ItemPicker } from '@/components/ItemPicker';
import { Toasts, type ToastMessage } from '@/components/Toasts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettings, ItemSummary, TemplatePropertyKey, TemplateSettings, ZoteroItemData } from '@/lib/types';
import { ensureDir, loadSettings, saveMarkdownFile, savePngBytes, saveSettings } from '@/lib/tauri';
import { ZoteroClient } from '@/lib/zotero';
import { resolveCiteKey } from '@/lib/citekey';
import { addMissingImageTodo, prepareExport, renderPreparedExport } from '@/lib/exporter';
import { cn, extractYear } from '@/lib/utils';
import { COLOR_SWATCH_HEX, ORDERED_COLOR_NAMES } from '@/lib/colors';

const TEMPLATE_PROPERTY_LABELS: Record<TemplatePropertyKey, string> = {
  title: 'Title',
  author: 'Author',
  year: 'Year',
  company: 'Company',
};

const TEMPLATE_PROPERTY_KEYS: TemplatePropertyKey[] = ['title', 'author', 'year', 'company'];

const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  propertyOrder: [...TEMPLATE_PROPERTY_KEYS],
  colorHeadingOverrides: {},
};

const DEFAULT_SETTINGS: AppSettings = {
  markdownDir: '',
  attachmentBaseDir: '',
  zoteroApiKey: '',
  zoteroBaseUrl: 'http://127.0.0.1:23119',
  templateSettings: DEFAULT_TEMPLATE_SETTINGS,
};

type ConnectionState = 'unknown' | 'checking' | 'connected' | 'disconnected';
type SidebarTab = 'export' | 'template';

interface SelectedItemMeta {
  key: string;
  title: string;
  year: string;
  citeKey: string;
  isLoading: boolean;
}

function settingsConfigured(settings: AppSettings): boolean {
  return Boolean(
    settings.markdownDir.trim() &&
      settings.attachmentBaseDir.trim() &&
      settings.zoteroApiKey.trim() &&
      settings.zoteroBaseUrl.trim(),
  );
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
  return 'Not configured';
}

function connectionClass(state: ConnectionState): string {
  if (state === 'connected') {
    return 'bg-[rgba(34,197,94,0.18)] text-[rgb(187,247,208)] border-[rgba(52,211,153,0.5)]';
  }
  if (state === 'disconnected') {
    return 'bg-[rgba(185,28,28,0.2)] text-[var(--color-text-error)] border-[rgba(233,74,74,0.65)]';
  }
  if (state === 'checking') {
    return 'bg-[rgba(255,207,168,0.12)] text-[var(--color-text-link)] border-[rgba(255,207,168,0.45)]';
  }
  return 'bg-[rgba(198,189,189,0.12)] text-[var(--color-text-secondary)] border-[rgba(198,189,189,0.35)]';
}

function connectionIcon(state: ConnectionState) {
  if (state === 'checking') {
    return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />;
  }
  if (state === 'connected') {
    return <Sparkles className="h-3.5 w-3.5" />;
  }
  if (state === 'disconnected') {
    return <TriangleAlert className="h-3.5 w-3.5" />;
  }
  return <SlidersHorizontal className="h-3.5 w-3.5" />;
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return '-';
  }
  if (trimmed.length <= 6) {
    return '.'.repeat(trimmed.length);
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-2)}`;
}

function shortPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return '-';
  }
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return trimmed;
  }
  return `.../${parts.slice(-2).join('/')}`;
}

function normalizeTemplateSettings(input: TemplateSettings | undefined): TemplateSettings {
  const sourceOrder = Array.isArray(input?.propertyOrder) ? input?.propertyOrder : [];
  const valid = sourceOrder.filter((key): key is TemplatePropertyKey => TEMPLATE_PROPERTY_KEYS.includes(key as TemplatePropertyKey));
  const deduped = [...new Set(valid)];

  for (const fallback of TEMPLATE_PROPERTY_KEYS) {
    if (!deduped.includes(fallback)) {
      deduped.push(fallback);
    }
  }

  return {
    propertyOrder: deduped,
    colorHeadingOverrides: { ...(input?.colorHeadingOverrides ?? {}) },
  };
}

function reorderProperty(order: TemplatePropertyKey[], dragged: TemplatePropertyKey, target: TemplatePropertyKey): TemplatePropertyKey[] {
  if (dragged === target) {
    return order;
  }

  const fromIndex = order.indexOf(dragged);
  const toIndex = order.indexOf(target);
  if (fromIndex < 0 || toIndex < 0) {
    return order;
  }

  const next = [...order];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, dragged);
  return next;
}

function isTemplatePropertyKey(value: string): value is TemplatePropertyKey {
  return TEMPLATE_PROPERTY_KEYS.includes(value as TemplatePropertyKey);
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('unknown');

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [selectedItemMetaByKey, setSelectedItemMetaByKey] = useState<Record<string, SelectedItemMeta>>({});
  const [activeItemKey, setActiveItemKey] = useState('');

  const [isExporting, setIsExporting] = useState(false);
  const [dryRunOutput, setDryRunOutput] = useState('');

  const [activeTab, setActiveTab] = useState<SidebarTab>('export');
  const [templateDraft, setTemplateDraft] = useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [draggedProperty, setDraggedProperty] = useState<TemplatePropertyKey | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(Boolean(typeof document !== 'undefined' && document.fullscreenElement));
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [denseMode, setDenseMode] = useState(false);
  const [showHints, setShowHints] = useState(true);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (level: ToastMessage['level'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, level, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((entry) => entry.id !== id));
    }, 6000);
  };

  const client = useMemo(() => new ZoteroClient(settings), [settings]);
  const canExport = settingsConfigured(settings) && connectionState === 'connected' && selectedItemKeys.length > 0 && !isExporting;

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    if (media.matches) {
      setIsMobileSidebarOpen(false);
    }

    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await loadSettings();
        const normalizedTemplate = normalizeTemplateSettings(loaded.templateSettings);
        const normalizedSettings = {
          ...loaded,
          templateSettings: normalizedTemplate,
        };

        setSettings(normalizedSettings);
        setTemplateDraft(normalizedTemplate);

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
      setItems([]);
      return;
    }

    let cancelled = false;
    let firstCheck = true;

    const checkConnection = async () => {
      if (firstCheck) {
        setConnectionState('checking');
        firstCheck = false;
      }

      const ok = await client.ping();
      if (!cancelled) {
        setConnectionState(ok ? 'connected' : 'disconnected');
        if (!ok) {
          setItems([]);
        }
      }
    };

    void checkConnection();
    const interval = window.setInterval(() => {
      void checkConnection();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client, settings]);

  useEffect(() => {
    if (!settingsConfigured(settings) || connectionState !== 'connected') {
      setItems([]);
      setLoadingItems(false);
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(() => {
      setLoadingItems(true);
      void (async () => {
        const alive = await client.ping();
        if (!alive) {
          if (!cancelled) {
            setConnectionState('disconnected');
            setItems([]);
            setLoadingItems(false);
          }
          return;
        }

        return client
          .searchItems(query)
          .then((result) => {
            if (!cancelled) {
              setItems(result);
            }
          })
          .catch((error) => {
            if (!cancelled) {
              setConnectionState('disconnected');
              setItems([]);
              addToast('error', error instanceof Error ? error.message : String(error));
            }
          })
          .finally(() => {
            if (!cancelled) {
              setLoadingItems(false);
            }
          });
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [client, connectionState, query, settings]);

  const resolveItemCiteKey = async (item: ZoteroItemData): Promise<string> => {
    try {
      return resolveCiteKey(item);
    } catch (error) {
      const fallback = await client.getBetterBibTexCiteKey(item.key);
      if (fallback) {
        return fallback;
      }
      throw error;
    }
  };

  const onSaveSettings = async (next: AppSettings) => {
    const normalizedTemplate = normalizeTemplateSettings(next.templateSettings);
    const normalizedSettings = {
      ...next,
      templateSettings: normalizedTemplate,
    };

    await saveSettings(normalizedSettings);
    setSettings(normalizedSettings);
    setTemplateDraft(normalizedTemplate);
  };

  const hydrateSelectedItemMeta = async (itemKey: string, fallbackTitle: string, fallbackYear: string) => {
    try {
      const full = await client.getItem(itemKey);
      const title = String(full.data.title ?? fallbackTitle ?? itemKey);
      const year = extractYear(String(full.data.date ?? '')) || fallbackYear;
      let citeKey = '';

      try {
        citeKey = await resolveItemCiteKey(full);
      } catch {
        citeKey = '';
      }

      setSelectedItemMetaByKey((prev) => ({
        ...prev,
        [itemKey]: {
          key: itemKey,
          title,
          year,
          citeKey,
          isLoading: false,
        },
      }));
    } catch {
      setSelectedItemMetaByKey((prev) => {
        const existing = prev[itemKey];
        if (!existing) {
          return prev;
        }
        return {
          ...prev,
          [itemKey]: {
            ...existing,
            isLoading: false,
          },
        };
      });
    }
  };

  const activateItem = (itemKey: string) => {
    setActiveItemKey(itemKey);
  };

  const onSelectItem = async (item: ItemSummary) => {
    if (connectionState !== 'connected') {
      addToast('error', 'Start Zotero Desktop and wait for status to show Connected before selecting items.');
      return;
    }

    if (!selectedItemKeys.includes(item.key)) {
      setSelectedItemKeys((prev) => [...prev, item.key]);
      setSelectedItemMetaByKey((prev) => ({
        ...prev,
        [item.key]: {
          key: item.key,
          title: item.title || item.key,
          year: item.year,
          citeKey: '',
          isLoading: true,
        },
      }));
      void hydrateSelectedItemMeta(item.key, item.title || item.key, item.year);
    }

    setDryRunOutput('');
    activateItem(item.key);
  };

  const removeSelectedItem = (itemKey: string) => {
    const nextSelectedKeys = selectedItemKeys.filter((key) => key !== itemKey);
    setSelectedItemKeys(nextSelectedKeys);
    setSelectedItemMetaByKey((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    setDryRunOutput('');

    if (activeItemKey === itemKey) {
      activateItem(nextSelectedKeys[0] ?? '');
    }
  };

  const saveTemplateChanges = async () => {
    setIsSavingTemplate(true);
    const normalizedTemplate = normalizeTemplateSettings(templateDraft);
    const nextSettings = {
      ...settings,
      templateSettings: normalizedTemplate,
    };

    try {
      await saveSettings(nextSettings);
      setSettings(nextSettings);
      setTemplateDraft(normalizedTemplate);
      addToast('success', 'Template settings saved.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const onColorHeadingChange = (colorName: string, value: string) => {
    setTemplateDraft((prev) => {
      const nextOverrides = { ...prev.colorHeadingOverrides };
      const trimmed = value.trim();

      if (!trimmed || trimmed === colorName) {
        delete nextOverrides[colorName];
      } else {
        nextOverrides[colorName] = value;
      }

      return {
        ...prev,
        colorHeadingOverrides: nextOverrides,
      };
    });
  };

  const onTemplatePropertyDragStart = (event: DragEvent<HTMLDivElement>, propertyKey: TemplatePropertyKey) => {
    setDraggedProperty(propertyKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', propertyKey);
  };

  const onTemplatePropertyDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onTemplatePropertyDropFromEvent = (event: DragEvent<HTMLDivElement>, target: TemplatePropertyKey) => {
    event.preventDefault();
    const droppedKey = event.dataTransfer.getData('text/plain').trim();
    const resolvedDragged = isTemplatePropertyKey(droppedKey) ? droppedKey : draggedProperty;
    if (!resolvedDragged) {
      return;
    }

    setTemplateDraft((prev) => ({
      ...prev,
      propertyOrder: reorderProperty(prev.propertyOrder, resolvedDragged, target),
    }));
    setDraggedProperty(null);
  };

  const moveTemplateProperty = (propertyKey: TemplatePropertyKey, direction: 'up' | 'down') => {
    setTemplateDraft((prev) => {
      const currentIndex = prev.propertyOrder.indexOf(propertyKey);
      if (currentIndex < 0) {
        return prev;
      }

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.propertyOrder.length) {
        return prev;
      }

      const targetKey = prev.propertyOrder[targetIndex];
      return {
        ...prev,
        propertyOrder: reorderProperty(prev.propertyOrder, propertyKey, targetKey),
      };
    });
  };

  const runExport = async (dryRun: boolean) => {
    if (connectionState !== 'connected') {
      addToast('error', 'Start Zotero Desktop and wait for status to show Connected before exporting.');
      return;
    }

    if (selectedItemKeys.length === 0) {
      return;
    }

    setIsExporting(true);
    setDryRunOutput('');

    try {
      const keysToExport = [...selectedItemKeys];
      const dryRunSections: string[] = [];
      const failedItems: string[] = [];
      const missingImageWarnings: string[] = [];
      const itemsWithNoAnnotations: string[] = [];
      let successCount = 0;

      if (!dryRun) {
        await ensureDir(settings.markdownDir);
        await ensureDir(settings.attachmentBaseDir);
      }

      for (const itemKey of keysToExport) {
        try {
          const freshItem = await client.getItem(itemKey);
          const citeKey = await resolveItemCiteKey(freshItem);
          const freshAnnotations = await client.getAnnotationsForItem(itemKey);

          let prepared = prepareExport({
            markdownDir: settings.markdownDir,
            attachmentBaseDir: settings.attachmentBaseDir,
            citeKey,
            item: freshItem,
            annotations: freshAnnotations,
          });

          const imageWarningsForItem: string[] = [];

          for (const imagePlan of prepared.imagePlans) {
            const bytes = await client.getSelectedAreaImage(imagePlan.annotationKey, imagePlan.attachmentKey);
            if (!bytes || bytes.length === 0) {
              const warning = `@${citeKey}: selected-area image missing for annotation ${imagePlan.annotationKey}.`;
              prepared = addMissingImageTodo(prepared, imagePlan.annotationKey, warning);
              imageWarningsForItem.push(warning);
              continue;
            }

            if (!dryRun) {
              await savePngBytes(imagePlan.absolutePath, Array.from(bytes));
            }
          }

          const markdown = renderPreparedExport(prepared, templateDraft);
          if (freshAnnotations.length === 0) {
            itemsWithNoAnnotations.push(`@${citeKey}`);
          }
          missingImageWarnings.push(...imageWarningsForItem);

          if (dryRun) {
            const imagePlanLines = prepared.imagePlans.map((plan) => `- ${plan.fileName} -> ${plan.absolutePath}`).join('\n');
            const warningLines =
              imageWarningsForItem.length > 0 ? `\nWarnings:\n${imageWarningsForItem.map((w) => `- ${w}`).join('\n')}` : '';

            dryRunSections.push(
              `Item: @${citeKey}\nAnnotations found: ${freshAnnotations.length}\nMarkdown path: ${prepared.markdownPath}\n\nImage plan:\n${
                imagePlanLines || '- (none)'
              }${warningLines}\n\n${markdown}`,
            );
          } else {
            await saveMarkdownFile(prepared.markdownPath, markdown);
          }

          setSelectedItemMetaByKey((prev) => {
            const existing = prev[itemKey];
            if (!existing) {
              return prev;
            }
            return {
              ...prev,
              [itemKey]: {
                ...existing,
                citeKey,
              },
            };
          });

          successCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failedItems.push(`${itemKey}: ${message}`);
        }
      }

      if (dryRun) {
        const failureBlock = failedItems.length > 0 ? `\n\nFailed items:\n${failedItems.map((item) => `- ${item}`).join('\n')}` : '';
        setDryRunOutput(`${dryRunSections.join('\n\n----------------------------------------\n\n')}${failureBlock}`.trim());
        addToast('info', `Dry run complete for ${successCount} of ${keysToExport.length} selected item(s).`);
      } else if (successCount > 0) {
        addToast('success', `Exported ${successCount} item(s).`);
      }

      if (itemsWithNoAnnotations.length > 0) {
        addToast('error', `No annotations were found for ${itemsWithNoAnnotations.length} item(s).`);
      }

      if (missingImageWarnings.length > 0) {
        addToast('error', `${missingImageWarnings.length} select-area image(s) could not be retrieved. TODO markers were added.`);
      }

      if (failedItems.length > 0) {
        addToast('error', `Failed to export ${failedItems.length} item(s).`);
      }

      if (successCount > 0) {
        setConnectionState('connected');
      } else if (failedItems.length > 0) {
        setConnectionState('disconnected');
      }
    } catch (error) {
      setConnectionState('disconnected');
      addToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  const sidebarClass = isFullscreen
    ? 'bg-[rgba(16,16,16,0.94)]'
    : 'bg-[rgba(16,16,16,0.62)] backdrop-blur-xl';
  const selectionListHeightClass = denseMode ? 'max-h-36' : 'max-h-44';
  const selectionRowPaddingClass = denseMode ? 'px-3 py-1.5' : 'px-3 py-2';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {isMobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 pb-4 pt-4 lg:flex-row">
        <aside
          className={cn(
            'fixed bottom-4 left-4 top-4 z-40 w-[min(21rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-[rgba(255,255,255,0.15)] p-4 shadow-xl transition-all duration-300 lg:static lg:z-auto lg:w-72 lg:shrink-0 lg:overflow-visible lg:shadow-none',
            sidebarClass,
            isMobileSidebarOpen
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none -translate-x-[108%] opacity-0 lg:pointer-events-auto lg:translate-x-0 lg:opacity-100',
            isSidebarHidden && 'lg:hidden',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 rounded-md border border-primary/40 bg-primary/15 p-1.5 text-primary">
                <LibraryBig className="h-4 w-4" />
              </span>
              <div>
                <p className="text-base font-semibold tracking-tight">ZotNotes</p>
                <p className="mt-1 text-xs text-muted-foreground">Compact export workstation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', connectionClass(connectionState))}>
                {connectionIcon(connectionState)}
                {connectionText(connectionState)}
              </span>
              <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={() => setIsMobileSidebarOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                activeTab === 'export' ? 'border-primary bg-muted text-primary' : 'border-border',
              )}
              onClick={() => {
                setActiveTab('export');
                setIsMobileSidebarOpen(false);
              }}
            >
              <FileDown className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                activeTab === 'template' ? 'border-primary bg-muted text-primary' : 'border-border',
              )}
              onClick={() => {
                setActiveTab('template');
                setIsMobileSidebarOpen(false);
              }}
            >
              <Paintbrush2 className="h-4 w-4" />
              Template
            </button>
          </div>

          <div className="mb-4 rounded-lg border border-border/80 bg-[rgba(16,16,16,0.45)] p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Workspace controls</p>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted/60"
                onClick={() => setDenseMode((prev) => !prev)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Dense mode
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    denseMode ? 'border-primary/40 bg-primary/20 text-primary' : 'border-border text-muted-foreground',
                  )}
                >
                  {denseMode ? 'On' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted/60"
                onClick={() => setShowHints((prev) => !prev)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Tips and hints
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    showHints ? 'border-primary/40 bg-primary/20 text-primary' : 'border-border text-muted-foreground',
                  )}
                >
                  {showHints ? 'On' : 'Off'}
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-[rgba(16,16,16,0.45)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Settings</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Folder className="h-3.5 w-3.5" />
                  Markdown
                </dt>
                <dd className="max-w-[160px] truncate text-right">{shortPath(settings.markdownDir)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <BookOpenText className="h-3.5 w-3.5" />
                  Attachments
                </dt>
                <dd className="max-w-[160px] truncate text-right">{shortPath(settings.attachmentBaseDir)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  API key
                </dt>
                <dd>{maskApiKey(settings.zoteroApiKey)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  Base URL
                </dt>
                <dd className="max-w-[160px] truncate text-right">{settings.zoteroBaseUrl || '-'}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <main className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setIsMobileSidebarOpen(true)}>
                <Menu className="mr-1.5 h-4 w-4" />
                Menu
              </Button>
              <Button type="button" variant="outline" size="sm" className="hidden lg:inline-flex" onClick={() => setIsSidebarHidden((prev) => !prev)}>
                {isSidebarHidden ? <PanelLeftOpen className="mr-1.5 h-4 w-4" /> : <PanelLeftClose className="mr-1.5 h-4 w-4" />}
                {isSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="mr-1.5 h-4 w-4" />
                Settings
              </Button>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {activeTab === 'export' ? <FileDown className="h-3.5 w-3.5" /> : <Paintbrush2 className="h-3.5 w-3.5" />}
              {activeTab === 'export' ? 'Export workspace' : 'Template workspace'}
            </span>
          </div>

          {activeTab === 'export' ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LibraryBig className="h-4 w-4 text-primary" />
                  Library items
                </CardTitle>
                <CardDescription>Search, multi-select, and export one markdown file per item.</CardDescription>
              </CardHeader>
              <CardContent className={cn(denseMode ? 'space-y-3' : 'space-y-4')}>
                {showHints && connectionState !== 'connected' && (
                  <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>Start Zotero Desktop and keep it running. Items load only when connection status is Connected.</p>
                  </div>
                )}

                <ItemPicker
                  query={query}
                  onQueryChange={setQuery}
                  items={items}
                  isLoading={loadingItems}
                  selectedItemKeys={selectedItemKeys}
                  activeItemKey={activeItemKey}
                  onSelect={(item) => void onSelectItem(item)}
                  dense={denseMode}
                  showHints={showHints}
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void runExport(false)} disabled={!canExport} className="min-w-[170px]">
                    {isExporting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileDown className="mr-2 h-4 w-4" />
                        Export selected
                      </>
                    )}
                  </Button>

                  <Button type="button" variant="outline" disabled={!canExport} onClick={() => void runExport(true)}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Dry run selected
                  </Button>
                </div>

                <div className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      {selectedItemKeys.length} selected
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedItemKeys.length === 0}
                      onClick={() => {
                        setSelectedItemKeys([]);
                        setSelectedItemMetaByKey({});
                        setActiveItemKey('');
                        setDryRunOutput('');
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Clear all
                    </Button>
                  </div>

                  <div className={cn('overflow-auto', selectionListHeightClass)}>
                    {selectedItemKeys.length === 0 ? (
                      <p className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                        <BookOpenText className="h-3.5 w-3.5" />
                        No items selected.
                      </p>
                    ) : (
                      selectedItemKeys.map((itemKey) => {
                        const meta = selectedItemMetaByKey[itemKey];
                        const title = meta?.title || itemKey;
                        const year = meta?.year || '';
                        const citeKeyText = meta?.isLoading
                          ? 'loading cite key...'
                          : meta?.citeKey
                            ? `@${meta.citeKey}`
                            : 'cite key missing';

                        return (
                          <div
                            key={itemKey}
                            className={cn(
                              'flex items-start justify-between gap-2 border-b border-border last:border-b-0',
                              selectionRowPaddingClass,
                              itemKey === activeItemKey && 'bg-muted',
                            )}
                          >
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => activateItem(itemKey)}>
                              <p className="truncate text-sm">{title}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {year && (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {year}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  {citeKeyText}
                                </span>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"
                              onClick={() => removeSelectedItem(itemKey)}
                              aria-label={`Remove ${title}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {dryRunOutput && (
                  <div className="rounded-md border border-border bg-[rgba(16,16,16,0.95)] p-3">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
                      <TerminalSquare className="h-4 w-4 text-primary" />
                      Dry run output
                    </p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {dryRunOutput}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paintbrush2 className="h-4 w-4 text-primary" />
                  Template customization
                </CardTitle>
                <CardDescription>Drag fields to reorder frontmatter, then customize per-color section headers.</CardDescription>
              </CardHeader>
              <CardContent className={cn(denseMode ? 'space-y-4' : 'space-y-5')}>
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
                    <ArrowDownUp className="h-4 w-4 text-primary" />
                    Frontmatter field order
                  </p>
                  <div className="space-y-2">
                    {templateDraft.propertyOrder.map((propertyKey) => (
                      <div
                        key={propertyKey}
                        draggable
                        onDragStart={(event) => onTemplatePropertyDragStart(event, propertyKey)}
                        onDragEnd={() => setDraggedProperty(null)}
                        onDragOver={onTemplatePropertyDragOver}
                        onDrop={(event) => onTemplatePropertyDropFromEvent(event, propertyKey)}
                        className={cn(
                          'flex cursor-grab items-center justify-between rounded-md border border-border bg-muted px-3 py-2 text-sm active:cursor-grabbing',
                          draggedProperty === propertyKey && 'border-primary/60',
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          {TEMPLATE_PROPERTY_LABELS[propertyKey]}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded border border-border p-1 text-muted-foreground hover:bg-background disabled:opacity-40"
                            onClick={() => moveTemplateProperty(propertyKey, 'up')}
                            disabled={templateDraft.propertyOrder[0] === propertyKey}
                            aria-label={`Move ${TEMPLATE_PROPERTY_LABELS[propertyKey]} up`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border p-1 text-muted-foreground hover:bg-background disabled:opacity-40"
                            onClick={() => moveTemplateProperty(propertyKey, 'down')}
                            disabled={templateDraft.propertyOrder[templateDraft.propertyOrder.length - 1] === propertyKey}
                            aria-label={`Move ${TEMPLATE_PROPERTY_LABELS[propertyKey]} down`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-border">
                  <div className="border-b border-border px-3 py-2">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <Palette className="h-4 w-4 text-primary" />
                      Color section headers
                    </p>
                    <p className="text-xs text-muted-foreground">Default is the color name. Type a label to replace it.</p>
                  </div>

                  <div className="space-y-2 p-3">
                    {ORDERED_COLOR_NAMES.map((colorName) => {
                      const inputValue = templateDraft.colorHeadingOverrides[colorName] ?? colorName;
                      return (
                        <div key={colorName} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-white/25"
                            style={{ backgroundColor: COLOR_SWATCH_HEX[colorName] ?? '#7d7d7d' }}
                          />
                          <span className="w-20 text-xs text-muted-foreground">{colorName}</span>
                          <input
                            value={inputValue}
                            onChange={(event) => onColorHeadingChange(colorName, event.target.value)}
                            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => void saveTemplateChanges()} disabled={isSavingTemplate}>
                    {isSavingTemplate ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Palette className="mr-2 h-4 w-4" />
                        Save template changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        isConnected={connectionState === 'connected'}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onToast={addToast}
      />

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((entry) => entry.id !== id))} />
    </div>
  );
}
