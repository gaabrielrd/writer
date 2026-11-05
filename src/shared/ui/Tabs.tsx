import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/utils';
import styles from './Tabs.module.css';

/**
 * Navegação entre seções de uma página. Use um único `Tabs` por região;
 * o valor pode ser controlado (por exemplo, a partir da URL).
 */
export const Tabs = forwardRef<
  ElementRef<typeof TabsPrimitive.Root>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root ref={ref} className={cn(styles.root, className)} {...props} />
));
Tabs.displayName = 'Tabs';

export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** Nome acessível da lista de seções. */
  'aria-label': string;
  /** Ações da seção exibidas ao lado das abas, fora do `tablist`. */
  actions?: ReactNode;
}

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, actions, children, ...props }, ref) => (
    <div className={cn(styles.bar, className)} data-slot="tabs-bar">
      <TabsPrimitive.List ref={ref} className={styles.list} {...props}>
        {children}
      </TabsPrimitive.List>
      {actions && (
        <div className={styles.actions} role="group" aria-label={`Ações de ${props['aria-label']}`}>
          {actions}
        </div>
      )}
    </div>
  ),
);
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Ícone Lucide decorativo; recebe `aria-hidden` de quem chama. */
  icon?: ReactNode;
  /** Quantidade de itens da seção, exibida após o rótulo. */
  count?: number;
}

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, icon, count, children, ...props }, ref) => (
    <TabsPrimitive.Trigger ref={ref} className={cn(styles.trigger, className)} {...props}>
      {icon}
      <span>{children}</span>
      {count !== undefined && (
        <>
          {' '}
          <span className={styles.count}>{count}</span>
        </>
      )}
    </TabsPrimitive.Trigger>
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn(styles.content, className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
