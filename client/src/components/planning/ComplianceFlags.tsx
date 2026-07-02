import { AlertTriangle } from 'lucide-react';
import type { ComplianceFlag } from '@obliplan/shared';

/**
 * Compact, non-blocking working-time compliance indicator for a planning week.
 * Renders nothing when the week is clean.
 */
export function ComplianceFlags({ flags }: { flags?: ComplianceFlag[] }) {
  if (!flags || flags.length === 0) return null;
  const hasError = flags.some((f) => f.severity === 'error');
  const cls = hasError ? 'bg-status-down/15 text-status-down' : 'bg-status-pending/15 text-status-pending';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
        <AlertTriangle size={12} />
        {flags.length} alerte{flags.length > 1 ? 's' : ''} conformité
      </span>
      {flags.map((f, i) => (
        <span
          key={i}
          title={f.message}
          className={`truncate rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-[10px] ${
            f.severity === 'error' ? 'text-status-down' : 'text-status-pending'
          }`}
        >
          {f.message}
        </span>
      ))}
    </div>
  );
}
