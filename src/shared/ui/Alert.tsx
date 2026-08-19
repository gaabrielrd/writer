import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { alertVariants } from './variants';

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
  children?: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, children, ...props }, ref) => {
    const getIcon = () => {
      switch (variant) {
        case 'destructive':
        case 'danger':
          return <AlertCircle className="icon icon-sm mt-0.5" aria-hidden="true" />;
        case 'success':
          return <CheckCircle2 className="icon icon-sm mt-0.5" aria-hidden="true" />;
        case 'warning':
          return <AlertTriangle className="icon icon-sm mt-0.5" aria-hidden="true" />;
        case 'info':
        default:
          return <Info className="icon icon-sm mt-0.5" aria-hidden="true" />;
      }
    };

    return (
      <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
        {getIcon()}
        <div className="flex flex-col gap-1 w-full">
          {title && <h5 className="font-semibold leading-none">{title}</h5>}
          <div className="text-sm opacity-90 leading-relaxed">{children}</div>
        </div>
      </div>
    );
  },
);

Alert.displayName = 'Alert';
