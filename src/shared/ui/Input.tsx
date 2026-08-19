import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--foreground))] opacity-80"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[hsl(var(--muted-foreground))]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error &&
                'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]',
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-[hsl(var(--muted-foreground))]">
              {rightIcon}
            </div>
          )}
        </div>
        {hint && !error && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
        {error && <p className="text-xs font-medium text-[hsl(var(--destructive))]">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
