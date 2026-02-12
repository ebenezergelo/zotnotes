import { X } from 'lucide-react';

export type ToastLevel = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  level: ToastLevel;
  message: string;
}

interface ToastsProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

function levelClass(level: ToastLevel): string {
  if (level === 'success') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  }
  if (level === 'error') {
    return 'border-rose-500/40 bg-rose-500/15 text-rose-100';
  }
  return 'border-sky-500/40 bg-sky-500/15 text-sky-100';
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[95vw] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-lg backdrop-blur-sm ${levelClass(toast.level)}`}
        >
          <p className="leading-snug">{toast.message}</p>
          <button
            type="button"
            className="rounded border border-white/20 p-1 text-white/70 hover:bg-white/10"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
