import { Star } from 'lucide-react';

/**
 * Consistent, non-blocking "Férié" day-marker shared by every planning surface
 * (WeekTable, HourGrid, RotaGrid, Vue équipe). The leading icon distinguishes it
 * from amber shift chips (astreinte/école share the status-pending colour), so a
 * jour férié worked en astreinte still reads clearly.
 */
export function HolidayPill() {
  return (
    <span
      title="Jour férié"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-status-pending/15 px-1.5 py-px text-[9px] font-medium text-status-pending"
    >
      <Star size={9} className="shrink-0" />
      Férié
    </span>
  );
}
