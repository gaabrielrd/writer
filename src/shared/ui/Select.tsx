import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options?: SelectOption[];
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, children, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--foreground))] opacity-80"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'flex h-10 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2 text-sm ring-offset-background placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer',
            error &&
              'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]',
            className,
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {hint && !error && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
        {error && <p className="text-xs font-medium text-[hsl(var(--destructive))]">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
