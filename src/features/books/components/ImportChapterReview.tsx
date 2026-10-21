import { DocumentSectionReview, type ParsedChapter } from '@/features/document-import';
import { PdfPagePreview } from './PdfPagePreview';
export function ImportChapterReview({
  chapter,
  ...props
}: {
  chapter: ParsedChapter;
  file: File;
  pageCount?: number;
  initialPage: number;
  canMerge: boolean;
  disabled: boolean;
  onSplit: (at: number) => void;
  onMerge: () => void;
}) {
  return (
    <DocumentSectionReview
      {...props}
      section={chapter}
      renderPage={(pageNumber) => (
        <PdfPagePreview key={pageNumber} file={props.file} pageNumber={pageNumber} />
      )}
    />
  );
}
