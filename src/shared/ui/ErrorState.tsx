import { type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../lib/utils';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  message?: string;
  error?: string | Error;
  action?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Ocorreu um erro',
  description,
  message,
  error,
  action,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const displayMessage =
    description ||
    message ||
    (typeof error === 'string' ? error : error?.message) ||
    'Não foi possível carregar as informações solicitadas.';

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 max-w-lg mx-auto my-6 gap-3',
        className,
      )}
    >
      <div className="p-3 rounded-full bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]">
        <AlertCircle className="icon h-8 w-8" />
      </div>
      <h4 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h4>
      <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{displayMessage}</p>
      {action ? (
        <div className="mt-2">{action}</div>
      ) : onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
