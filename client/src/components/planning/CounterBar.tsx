import type { WeeklyCounterDTO } from '../../api';
import { minToHm, minToSignedHm } from '../../utils/format';
import { cn } from '../../utils/cn';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'sup' | 'recup' }) {
  return (
    <div className="rounded-md border border-border bg-bg-tertiary px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div
        className={cn(
          'font-mono text-lg font-semibold',
          tone === 'up' && 'text-status-up',
          tone === 'down' && 'text-status-down',
          tone === 'sup' && 'text-status-pending',
          tone === 'recup' && 'text-accent',
          !tone && 'text-text-primary',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function CounterBar({ counter, soldeMin }: { counter: WeeklyCounterDTO; soldeMin?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Stat label="Réalisé" value={minToHm(counter.realiseMin)} />
      <Stat label="Attendu" value={minToHm(counter.attenduMin)} />
      <Stat
        label="Écart"
        value={minToSignedHm(counter.ecartMin)}
        tone={counter.ecartMin >= 0 ? 'up' : 'down'}
      />
      <Stat label="Heures sup" value={minToHm(counter.heuresSupMin)} tone="sup" />
      <Stat
        label="Astreinte"
        value={`${minToHm(counter.astreinteMin)} · ${counter.astreinteDeclenchements} décl.`}
        tone="sup"
      />
      <Stat label="Récup éligible" value={minToHm(counter.recupEligibleMin)} tone="recup" />
      {soldeMin !== undefined && <Stat label="Solde récup" value={minToHm(soldeMin)} tone="recup" />}
    </div>
  );
}
