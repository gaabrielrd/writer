import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 active:scale-[0.98]',
        default:
          'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 active:scale-[0.98]',
        secondary:
          'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
        outline:
          'border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
        destructive:
          'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-sm hover:opacity-90',
        danger:
          'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-sm hover:opacity-90',
        ghost: 'hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
        link: 'text-[hsl(var(--primary))] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 py-2',
        default: 'h-9 px-4 py-2',
        lg: 'h-10 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
        secondary:
          'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))]',
        neutral:
          'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))]',
        highlight: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
        outline: 'text-[hsl(var(--foreground))] border border-[hsl(var(--border))]',
        destructive: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
        danger: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
        success: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black',
        accent:
          'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] border border-[hsl(var(--border))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export const alertVariants = cva(
  'relative w-full rounded-lg border p-4 flex gap-3 text-sm [&>svg]:shrink-0 transition-colors',
  {
    variants: {
      variant: {
        info: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200 [&>svg]:text-blue-500',
        default: 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]',
        destructive:
          'border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] [&>svg]:text-[hsl(var(--destructive))]',
        danger:
          'border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] [&>svg]:text-[hsl(var(--destructive))]',
        success:
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 [&>svg]:text-emerald-500',
        warning:
          'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-500',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);
