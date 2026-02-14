import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

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
    return 'border-[rgba(52,211,153,0.55)] bg-[rgba(34,197,94,0.18)] text-[rgb(187,247,208)]';
  }
  if (level === 'error') {
    return 'border-[rgba(233,74,74,0.7)] bg-[rgba(185,28,28,0.2)] text-[var(--color-text-error)]';
  }
  return 'border-[rgba(255,207,168,0.45)] bg-[rgba(255,207,168,0.12)] text-[var(--color-text-link)]';
}

function levelIcon(level: ToastLevel) {
  if (level === 'success') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />;
  }
  if (level === 'error') {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />;
  }
  return <Info className="mt-0.5 h-4 w-4 shrink-0" />;
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[95vw] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${levelClass(toast.level)}`}
        >
          <div className="flex min-w-0 items-start gap-2">
            {levelIcon(toast.level)}
            <p className="leading-snug">{toast.message}</p>
          </div>
          <button
            type="button"
            className="rounded border border-[rgba(198,189,189,0.35)] p-1 text-[var(--color-text-secondary)] hover:bg-[rgba(198,189,189,0.12)]"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
