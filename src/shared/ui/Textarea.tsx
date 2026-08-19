import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--foreground))] opacity-80"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            error &&
              'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]',
            className,
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
        {error && <p className="text-xs font-medium text-[hsl(var(--destructive))]">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
