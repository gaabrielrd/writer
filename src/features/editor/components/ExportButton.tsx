import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Book, Chapter } from '@/features/books';
import { Button } from '@/shared/ui';
import { ExportDialog } from './ExportDialog';

export interface ExportButtonProps {
  book: Book;
  currentChapter?: Chapter;
  currentContent?: string;
}

export function ExportButton(props: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Download className="icon icon-sm" aria-hidden="true" />
        Exportar
      </Button>
      {open && <ExportDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
