import { useEffect, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, warning-styled confirm for destructive actions. */
  danger?: boolean;
  /** Spinner + disabled state while the action runs. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * House-styled confirmation modal - a drop-in replacement for `window.confirm`.
 * Backdrop click + Escape cancel (unless `loading`); the confirm button carries the
 * loading state so the dialog stays open until the async action resolves.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 p-5">
          {danger && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-down/15 text-status-down">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            <div className="text-sm leading-relaxed text-text-secondary">{message}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-bg-primary/40 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
