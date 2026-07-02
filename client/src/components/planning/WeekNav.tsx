import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysIso, dayLabel, mondayOfIso, todayIso } from '../../utils/format';
import { Button } from '../common/Button';

export function WeekNav({ monday, onChange }: { monday: string; onChange: (m: string) => void }) {
  const sunday = addDaysIso(monday, 6);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onChange(addDaysIso(monday, -7))}
        className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-0 text-center font-mono text-xs text-text-primary md:min-w-[170px] md:text-sm">
        {dayLabel(monday)} → {dayLabel(sunday)}
      </span>
      <button
        onClick={() => onChange(addDaysIso(monday, 7))}
        className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-secondary hover:text-text-primary"
      >
        <ChevronRight size={16} />
      </button>
      <Button variant="ghost" size="sm" onClick={() => onChange(mondayOfIso(todayIso()))}>
        Aujourd'hui
      </Button>
    </div>
  );
}
