import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  className?: string;
}

export function Dialog({ open, onClose, title, className, children }: PropsWithChildren<DialogProps>) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,16,16,0.82)] p-4" role="dialog" aria-modal="true">
      <div className={cn('w-full max-w-xl rounded-lg border border-border bg-card animate-fade-in', className)}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
