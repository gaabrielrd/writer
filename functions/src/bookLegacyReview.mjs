import { createBookLegacyCatalog } from './bookLegacyCatalog.mjs';
import { validateBookLegacyRecordContent } from './bookBackupContent.mjs';
import {
  createBookLegacyNormalizationState,
  readBookLegacyNormalizationStep,
} from './bookLegacyNormalize.mjs';

export async function inspectBookLegacyContent(source, options) {
  const catalog = await createBookLegacyCatalog(source, options);
  let cursor = createBookLegacyNormalizationState(catalog, options);
  async function* events() {
    yield {
      type: 'manifest',
      manifest: {
        bookId: catalog.bookId,
        sourceFormat: 'writer-book-backup',
        sourceVersion: catalog.provenance.version,
      },
    };
    while (cursor.phase !== 'done') {
      const step = await readBookLegacyNormalizationStep(source, catalog, cursor, options);
      cursor = step.cursor;
      if (step.item) {
        const { record, bytes } = step.item;
        for (let at = 0; at < bytes.length; at += 65536)
          yield {
            type: 'record',
            record: { ...record, part: at / 65536, payload: bytes.slice(at, at + 65536) },
          };
      }
    }
    options.signal?.throwIfAborted();
    return catalog.provenance;
  }
  const report = await validateBookLegacyRecordContent(events(), options);
  options.signal?.throwIfAborted();
  return { ...report, legacyWarnings: cursor.legacyWarnings };
}
