import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = 'Carregando...', className = '' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center text-[hsl(var(--muted-foreground))] gap-3',
        className,
      )}
    >
      <Loader2 className="icon h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
