import { type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-[hsl(var(--border))] pb-5 mb-6',
        className,
      )}
    >
      {breadcrumbs && (
        <div className="text-xs text-[hsl(var(--muted-foreground))]">{breadcrumbs}</div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
