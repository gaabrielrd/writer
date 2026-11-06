import { useEffect, useState } from 'react';
export function useActiveDialog() {
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(
        (d) =>
          !d.closest(
            '[data-page-assistant], [data-writer-guide], [data-slot="dropdown-content"]',
          ) && d.getAttribute('data-state') !== 'closed',
      );
      setDialog(dialogs.at(-1) ?? null);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);
  return dialog;
}
