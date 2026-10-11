import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export function DialogRoot(props: DialogPrimitive.DialogProps) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: DialogPrimitive.DialogTriggerProps) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogPortal(props: DialogPrimitive.DialogPortalProps) {
  return <DialogPrimitive.Portal {...props} />;
}

export function DialogClose(props: DialogPrimitive.DialogCloseProps) {
  return <DialogPrimitive.Close {...props} />;
}

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-[hsl(var(--shadow-color))]/60 backdrop-blur-[var(--glass-blur)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 flex flex-col w-[calc(100%-2rem)] max-h-[80vh] overflow-hidden max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-[var(--radius-lg)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer">
          <X className="icon icon-sm" aria-hidden="true" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn('flex shrink-0 flex-col space-y-1.5 pr-6 text-center sm:text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-body"
    className={cn(
      'flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain -m-1 p-1 [&>*]:shrink-0',
      className,
    )}
    {...props}
  />
);
DialogBody.displayName = 'DialogBody';

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      'flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 pt-2 [&_button]:min-w-0 [&_button]:whitespace-normal',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight break-words text-[hsl(var(--foreground))]',
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[hsl(var(--muted-foreground))]', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidthClass?: string;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  actions,
  children,
  maxWidthClass = 'max-w-lg',
  className = '',
}: DialogProps) {
  return (
    <DialogRoot
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className={cn(maxWidthClass, className)}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <DialogBody>{children}</DialogBody>
        {(footer || actions) && <DialogFooter>{footer || actions}</DialogFooter>}
      </DialogContent>
    </DialogRoot>
  );
}
