import { useState, type Ref } from 'react';
import { Download, History, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { Dropdown } from '@/shared/ui';
import { ExportDialog } from './ExportDialog';
import type { ExportButtonProps } from './ExportButton';

interface EditorOptionsMenuProps extends ExportButtonProps {
  onPersona: () => void;
  onHistory?: () => void;
  disabled: boolean;
  personaError?: string | null;
  triggerRef: Ref<HTMLButtonElement>;
}

export function EditorOptionsMenu({
  onPersona,
  onHistory,
  disabled,
  personaError,
  triggerRef,
  ...exportProps
}: EditorOptionsMenuProps) {
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <>
      <Dropdown
        mode="action"
        label="Opções do capítulo"
        iconOnly
        size="icon"
        variant="ghost"
        icon={<MoreHorizontal className="icon icon-sm" aria-hidden="true" />}
        ref={triggerRef}
        disabled={disabled}
        title={personaError ?? 'Persona e exportação'}
        align="end"
        options={[
          ...(onHistory
            ? [
                {
                  value: 'history',
                  label: 'Histórico do texto',
                  icon: <History className="icon icon-sm" aria-hidden="true" />,
                  onSelect: onHistory,
                },
              ]
            : []),
          {
            value: 'persona',
            label: 'Persona',
            icon: <SlidersHorizontal className="icon icon-sm" aria-hidden="true" />,
            onSelect: onPersona,
          },
          {
            value: 'export',
            label: 'Exportar',
            icon: <Download className="icon icon-sm" aria-hidden="true" />,
            onSelect: () => setExportOpen(true),
          },
        ]}
      />
      {exportOpen && <ExportDialog {...exportProps} onClose={() => setExportOpen(false)} />}
    </>
  );
}
