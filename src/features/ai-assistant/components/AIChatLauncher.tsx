import { Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui';
import { AISelectionToolbar } from './AISelectionToolbar';
import type { AIActionType } from '../model/aiPrompt';

export function AIChatLauncher({
  open,
  onOpen,
  anchor,
  disabled,
}: {
  open: boolean;
  onOpen: (action?: AIActionType) => void;
  disabled?: boolean;
  anchor: { top: number; bottom: number; left: number; right: number } | null;
}) {
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        aria-label="Abrir Assistente Criativo de IA"
        aria-expanded={open}
        onClick={() => onOpen()}
      >
        <Sparkles className="icon icon-sm" aria-hidden="true" />
        Assistente IA
      </Button>
      {anchor && !open && !disabled && <AISelectionToolbar anchor={anchor} onAction={onOpen} />}
    </>
  );
}
