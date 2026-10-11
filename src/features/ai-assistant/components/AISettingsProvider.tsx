import { useState, type ReactNode } from 'react';
import { BYOKSettingsDialog } from './BYOKSettingsDialog';
import { AISettingsContext } from '../hooks/useAISettings';

export function AISettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AISettingsContext.Provider value={() => setOpen(true)}>
      {children}
      {open && <BYOKSettingsDialog open onClose={() => setOpen(false)} />}
    </AISettingsContext.Provider>
  );
}
