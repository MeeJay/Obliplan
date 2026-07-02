import { cn } from '../../utils/cn';

/**
 * Centered loading spinner - uses the house SVG (same as Obli LoadingSpinner).
 * `className` sizes the centering wrapper (e.g. "h-40" / "h-screen").
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <svg className="h-8 w-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}
