import { useEffect, useState } from 'react';
import { FolderSearch, KeyRound, Link2, Pencil, RefreshCw, Save } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppSettings } from '@/lib/types';
import { selectDirectoryDialog } from '@/lib/tauri';
import { ZoteroClient } from '@/lib/zotero';

interface SettingsDialogProps {
  open: boolean;
  isConnected: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onToast: (level: 'info' | 'success' | 'error', message: string) => void;
}

type SettingsTextField = 'markdownDir' | 'attachmentBaseDir' | 'zoteroApiKey' | 'zoteroBaseUrl';

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= 6) {
    return '.'.repeat(trimmed.length);
  }

  const middleLength = trimmed.length - 6;
  return `${trimmed.slice(0, 4)}${'.'.repeat(middleLength)}${trimmed.slice(-2)}`;
}

export function SettingsDialog({ open, isConnected, settings, onClose, onSave, onToast }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKeyUnlocked, setApiKeyUnlocked] = useState(false);
  const [apiKeyActivated, setApiKeyActivated] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setApiKeyUnlocked(false);
      setApiKeyActivated(isConnected);
    }
  }, [isConnected, open, settings]);

  const shouldMaskApiKey = Boolean(draft.zoteroApiKey.trim()) && (isConnected || apiKeyActivated) && !apiKeyUnlocked;

  const setField = (field: SettingsTextField, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (field === 'zoteroApiKey') {
      setApiKeyActivated(false);
    }
  };

  const chooseDirectory = async (field: keyof Pick<AppSettings, 'markdownDir' | 'attachmentBaseDir'>) => {
    const selected = await selectDirectoryDialog();
    if (selected) {
      setField(field, selected);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const client = new ZoteroClient(draft);
      const ok = await client.ping();
      if (ok) {
        setApiKeyActivated(true);
        setApiKeyUnlocked(false);
        onToast('success', 'Zotero connection succeeded.');
      } else {
        onToast('error', 'Zotero ping failed. Verify Zotero is running and API is enabled.');
      }
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(draft);
      onToast('success', 'Settings saved.');
      onClose();
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="inline-flex items-center gap-1.5 text-sm font-medium">
            <FolderSearch className="h-4 w-4 text-primary" />
            Markdown output directory
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="/path/to/markdown"
              value={draft.markdownDir}
              onChange={(event) => setField('markdownDir', event.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void chooseDirectory('markdownDir')}>
              <FolderSearch className="mr-2 h-4 w-4" />
              Browse
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-1.5 text-sm font-medium">
            <FolderSearch className="h-4 w-4 text-primary" />
            Attachment base directory
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="/path/to/attachments"
              value={draft.attachmentBaseDir}
              onChange={(event) => setField('attachmentBaseDir', event.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void chooseDirectory('attachmentBaseDir')}>
              <FolderSearch className="mr-2 h-4 w-4" />
              Browse
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-primary" />
            Zotero API key
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Paste local API key"
              value={shouldMaskApiKey ? maskApiKey(draft.zoteroApiKey) : draft.zoteroApiKey}
              readOnly={shouldMaskApiKey}
              onChange={(event) => setField('zoteroApiKey', event.target.value)}
            />
            {shouldMaskApiKey && (
              <Button type="button" variant="outline" onClick={() => setApiKeyUnlocked(true)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Link2 className="h-4 w-4 text-primary" />
            Zotero base URL
          </label>
          <Input
            placeholder="http://127.0.0.1:23119"
            value={draft.zoteroBaseUrl}
            onChange={(event) => setField('zoteroBaseUrl', event.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={isTesting}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
            {isTesting ? 'Testing...' : 'Test connection'}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={isSaving}>
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
