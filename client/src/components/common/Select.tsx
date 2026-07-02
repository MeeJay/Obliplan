import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, className, id, children, ...props }, ref) => {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
Select.displayName = 'Select';
