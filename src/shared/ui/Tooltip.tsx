import { useState, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-tooltip';
import styles from './Floating.module.css';

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Primitive.Provider delayDuration={200}>
      <Primitive.Root open={open} onOpenChange={setOpen}>
        <Primitive.Trigger asChild onClick={() => setOpen((value) => !value)}>
          {children}
        </Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content sideOffset={8} collisionPadding={12} className={styles.tooltip}>
            {content}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
