import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';

export function TenantSwitcher() {
  const { currentTenantId, tenants, switchTenant } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (tenants.length <= 1) return null;

  const currentTenant = tenants.find((t) => t.id === currentTenantId) ?? tenants[0];

  async function handleSwitch(tenantId: number) {
    if (tenantId === currentTenantId || switching) return;
    setSwitching(true);
    setOpen(false);
    try {
      await switchTenant(tenantId);
      // Refetch all tenant-scoped views from a clean slate.
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className={cn(
          'flex items-center gap-2 rounded-[7px] px-3 py-1.5 text-sm transition-colors',
          'bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)]',
          switching && 'opacity-60 cursor-wait',
        )}
      >
        <span className="font-mono text-[11px] tracking-[0.06em] text-text-secondary">TENANT</span>
        <span className="max-w-[140px] truncate font-medium tracking-[0.04em] text-text-primary">
          {currentTenant?.name || '…'}
        </span>
        <ChevronDown size={12} className={cn('text-text-secondary transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-9 z-50 w-52 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Changer d'espace</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                onClick={() => handleSwitch(tenant.id)}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover',
                  tenant.id === currentTenantId ? 'font-semibold text-accent' : 'text-text-primary',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 size={13} className="shrink-0 text-text-muted" />
                  <span className="truncate">{tenant.name}</span>
                  {tenant.role === 'admin' && (
                    <span className="shrink-0 rounded bg-bg-tertiary px-1 py-0.5 text-[10px] text-text-muted">admin</span>
                  )}
                </div>
                {tenant.id === currentTenantId && <Check size={13} className="shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
