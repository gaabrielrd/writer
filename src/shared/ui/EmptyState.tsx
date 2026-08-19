import { type ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';
import { cn } from '../lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = <FileQuestion className="icon h-12 w-12 text-[hsl(var(--muted-foreground))] opacity-60" />,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/40 max-w-lg mx-auto my-6 gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-center p-3 rounded-full bg-[hsl(var(--secondary))]">
        {icon}
      </div>
      <h4 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h4>
      {description && (
        <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
