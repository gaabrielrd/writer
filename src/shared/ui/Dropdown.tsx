import type { ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import styles from './Floating.module.css';

export function Dropdown({
  trigger,
  children,
  label,
  align = 'start',
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  align?: 'start' | 'end';
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content aria-label={label} align={align} sideOffset={8} className={styles.menu}>
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function DropdownItem({
  children,
  onSelect,
  disabled,
  asChild,
  title,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  asChild?: boolean;
  title?: string;
}) {
  return (
    <Menu.Item
      className={styles.item}
      onSelect={onSelect}
      disabled={disabled}
      asChild={asChild}
      title={title}
    >
      {children}
    </Menu.Item>
  );
}
export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className={styles.label}>{children}</Menu.Label>;
}
