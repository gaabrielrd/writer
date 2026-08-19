import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { buttonVariants } from './variants';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
