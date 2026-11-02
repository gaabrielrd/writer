import { readBookLegacyJSONStep } from './bookLegacyJSON.mjs';
import {
  createBookLegacyCatalogState,
  acceptBookLegacyCatalogSpan,
  finishBookLegacyCatalog,
} from './bookLegacyCatalog.mjs';
import {
  createBookLegacyNormalizationState,
  readBookLegacyNormalizationStep,
  readBookLegacyNormalizedItem,
} from './bookLegacyNormalize.mjs';
import { createBookContentState, createBookContentMachine } from './bookContentMachine.mjs';
import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
import { inconsistent, sum } from './bookRestoreUploadContracts.mjs';
import {
  bookRestoreValidationHash as hash,
  initialBookValidation,
} from './bookRestoreValidationStep.mjs';

export function initialBookLegacyValidation() {
  return {
    ...initialBookValidation(),
    phase: 'legacy-scan',
    legacy: {
      scanner: null,
      catalogState: createBookLegacyCatalogState(),
      catalog: null,
      normalizer: null,
    },
  };
}
/** Each unit prepares only bounded effects; coordinator rechecks reads and commits receipt. */
export async function prepareBookLegacyValidationStep(state, source, store, declaredSource) {
  const legacy = state.legacy;
  if (
    !legacy ||
    declaredSource.format !== 'writer-book-backup' ||
    !['legacy-scan', 'legacy-catalog', 'legacy-normalize'].includes(state.phase)
  )
    inconsistent();
  if (state.phase === 'legacy-scan') {
    if (legacy.catalog || legacy.normalizer || state.machine) inconsistent();
    const step = await readBookLegacyJSONStep(source, legacy.scanner);
    for (const span of step.values)
      legacy.catalogState = await acceptBookLegacyCatalogSpan(legacy.catalogState, span, source, {
        index: store.index,
      });
    legacy.scanner = step.cursor;
    if (step.cursor.done) state.phase = 'legacy-catalog';
    return;
  }
  if (state.phase === 'legacy-catalog') {
    if (!legacy.scanner?.done || legacy.catalog || state.machine) inconsistent();
    const catalog = await finishBookLegacyCatalog(
      legacy.catalogState,
      source,
      {
        size: source.size,
        fingerprint: declaredSource.sha256,
      },
      { index: store.index },
    );
    if (catalog.provenance.version !== declaredSource.version) bad();
    legacy.catalog = catalog;
    legacy.normalizer = createBookLegacyNormalizationState(catalog, { hash });
    legacy.scanner = null;
    legacy.catalogState = null;
    state.envelope = catalog.provenance;
    state.machine = createBookContentState(catalog.bookId, true);
    state.phase = 'legacy-normalize';
    return;
  }
  if (!legacy.catalog || !legacy.normalizer || !state.machine) inconsistent();
  const machine = createBookContentMachine(state.machine, { index: store.index, hash });
  if (state.relations) {
    const pending = state.relations;
    store.setItemIndex(pending.index);
    const item = await readBookLegacyNormalizedItem(
      source,
      legacy.catalog,
      pending.cursor,
      { record: pending.record, valueHash: pending.valueHash },
      { index: store.index, hash },
    );
    await machine.advanceRelations(pending.record, item.value, 64);
    state.machine = machine.checkpoint();
    if (!state.machine.relations) state.relations = null;
    return;
  }
  if (legacy.normalizer.phase === 'done') {
    await machine.beginFinish();
    state.machine = machine.checkpoint();
    state.phase = 'semantic';
    return;
  }
  const before = structuredClone(legacy.normalizer);
  // Preprocessing marks have their own receipt/native origin, without a semantic item pointer.
  store.setItemIndex(null);
  const step = await readBookLegacyNormalizationStep(source, legacy.catalog, before, {
    index: store.index,
    hash,
  });
  legacy.normalizer = step.cursor;
  if (!step.item) return;
  const { record, value, valueHash, bytes, origin } = step.item,
    index = state.items;
  store.setItemIndex(index);
  await machine.acceptJSON(record, value);
  state.machine = machine.checkpoint();
  if (state.machine.raw) inconsistent(); // Legacy has no history/draft/media bytes.
  await store.addItem(index, {
    record,
    valueHash,
    byteLength: bytes.length,
    legacy: { schemaVersion: 1, cursor: before, origin },
  });
  if (state.machine.relations) state.relations = { record, valueHash, cursor: before, index };
  state.items = sum(state.items, 1);
}
export function completeBookLegacyValidation(state, sourceHash, index) {
  const summary = createBookContentMachine(state.machine, { index, hash }).result();
  if (
    state.phase !== 'recheck' ||
    !summary.legacy ||
    state.legacy?.normalizer?.phase !== 'done' ||
    summary.bookId !== state.envelope?.bookId ||
    state.envelope?.fingerprint !== sourceHash
  )
    inconsistent();
  return {
    validation: 'server-content-only',
    sourceSha256: sourceHash,
    sourceBookId: summary.bookId,
    source: state.envelope,
    totals: summary.totals,
    warnings: summary.warnings,
    legacyWarnings: state.legacy.normalizer.legacyWarnings,
  };
}
