import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const feedbackId = `${textareaId}-feedback`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-[hsl(var(--foreground))] opacity-80"
          >
            {label}
          </label>
        )}
        <textarea
          {...props}
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], error || hint ? feedbackId : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={cn(
            'flex min-h-[80px] w-full rounded-[var(--radius-sm)] border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
            error &&
              'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]',
            className,
          )}
        />
        {hint && !error && (
          <p id={feedbackId} className="text-xs text-[hsl(var(--muted-foreground))]">
            {hint}
          </p>
        )}
        {error && (
          <p id={feedbackId} className="text-xs font-medium text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
