import { useState } from 'react';
import { Button, Dropdown } from '@/shared/ui';
import { sanitizeRichText } from '@/shared/lib/sanitizeRichText';
import type { ParsedChapter } from '../model/documentImport';
import { PdfPagePreview } from './PdfPagePreview';
import styles from './ImportBookModal.module.css';

interface Props {
  chapter: ParsedChapter;
  file: File;
  pageCount?: number;
  initialPage: number;
  canMerge: boolean;
  disabled: boolean;
  onSplit: (at: number) => void;
  onMerge: () => void;
}

export function ImportChapterReview({
  chapter,
  file,
  pageCount,
  initialPage,
  canMerge,
  disabled,
  onSplit,
  onMerge,
}: Props) {
  const [page, setPage] = useState(String(initialPage));
  const [splitAt, setSplitAt] = useState('');
  const blocks = chapter.blocks ?? [];
  return (
    <div className={styles.review}>
      <div className={styles.reviewControls}>
        {blocks.length > 1 && (
          <>
            <Dropdown
              mode="select"
              label="Dividir antes do trecho"
              value={splitAt}
              onValueChange={setSplitAt}
              disabled={disabled}
              options={blocks.slice(1).map((block, index) => ({
                value: String(index + 1),
                label: `${index + 2}. ${block.text.slice(0, 90)}`,
              }))}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !splitAt}
              onClick={() => onSplit(Number(splitAt))}
            >
              Dividir capítulo
            </Button>
          </>
        )}
        {canMerge && (
          <Button variant="secondary" size="sm" disabled={disabled} onClick={onMerge}>
            Unir ao próximo capítulo
          </Button>
        )}
      </div>
      <div className={pageCount ? styles.reviewColumns : undefined}>
        <div
          className={styles.fullPreview}
          role="textbox"
          aria-readonly="true"
          aria-multiline="true"
          aria-label={`Texto importado de ${chapter.title}`}
          tabIndex={0}
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(chapter.content) }}
        />
        {pageCount && (
          <div className={styles.pagePane}>
            <Dropdown
              mode="select"
              label="Página original"
              value={page}
              onValueChange={setPage}
              options={Array.from({ length: pageCount }, (_, index) => ({
                value: String(index + 1),
                label: `Página ${index + 1}`,
              }))}
            />
            <PdfPagePreview key={page} file={file} pageNumber={Number(page)} />
          </div>
        )}
      </div>
    </div>
  );
}
