import { useEffect, useState } from 'react';
import { FolderSearch } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppSettings } from '@/lib/types';
import { selectDirectoryDialog } from '@/lib/tauri';
import { ZoteroClient } from '@/lib/zotero';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onToast: (level: 'info' | 'success' | 'error', message: string) => void;
}

export function SettingsDialog({ open, settings, onClose, onSave, onToast }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  const setField = (field: keyof AppSettings, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
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
          <label className="text-sm font-medium">Markdown output directory</label>
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
          <label className="text-sm font-medium">Attachment base directory</label>
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
          <label className="text-sm font-medium">Zotero API key</label>
          <Input
            placeholder="Paste local API key"
            value={draft.zoteroApiKey}
            onChange={(event) => setField('zoteroApiKey', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Zotero base URL</label>
          <Input
            placeholder="http://127.0.0.1:23119"
            value={draft.zoteroBaseUrl}
            onChange={(event) => setField('zoteroBaseUrl', event.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={isTesting}>
            {isTesting ? 'Testing...' : 'Test connection'}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
