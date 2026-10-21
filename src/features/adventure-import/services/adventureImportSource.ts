import { openPdfPreview } from '@/features/document-import';
import { importCheck, sourceFromFile } from './adventureImportContracts';
import type { ImportSource } from '../model/adventureImport';
/** The original remains local and never changes the confirmed review. */
export async function confirmAdventureImportOriginal(
  file: File,
  expected: ImportSource,
): Promise<number> {
  const actual = await sourceFromFile(file);
  if (
    actual.mediaType !== 'application/pdf' ||
    actual.mediaType !== expected.mediaType ||
    actual.sha256 !== expected.sha256 ||
    actual.byteLength !== expected.byteLength
  )
    throw new Error(
      'Este PDF não corresponde ao arquivo original confirmado. A revisão foi mantida.',
    );
  const session = await openPdfPreview(file);
  try {
    importCheck(Number.isSafeInteger(session.pageCount) && session.pageCount > 0);
    return session.pageCount;
  } finally {
    await session.destroy();
  }
}
