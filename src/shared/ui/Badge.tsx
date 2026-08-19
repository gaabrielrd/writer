import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { badgeVariants } from './variants';

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  children?: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props}>
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
