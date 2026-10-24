import { assertAnalysisChildUnit } from './loreAnalysisApplicationChildBindings.mjs';
import { createHash } from 'node:crypto';
import { createSHA256 } from 'hash-wasm';
import { born, date } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import {
  createBookLoreBaseIndex,
  advanceBookLoreBaseIndex,
  finishBookLoreBaseIndex,
} from './bookLoreBaseIndex.mjs';
import { readBookLoreRecordPart } from './bookLoreStorageRead.mjs';
import {
  SOURCE_INSPECTION_ALGORITHM,
  inspectionIntent,
  inspectionStartHash,
  inspectionPaths,
  inspectionRequest,
  inspectionView,
  inspectionConflict as conflict,
  inspectionMetadata,
} from './bookLoreSourceInspectionContracts.mjs';
import {
  inspectionSource,
  loadSourceInspection,
  inspectionState,
  replaySourceInspection,
  commitSourceInspection,
  inspectionCertificate,
} from './bookLoreSourceInspectionStore.mjs';
const empty = () => ({
  schemaVersion: 1,
  fields: [],
  isPublic: { present: false, value: null },
  dates: {},
  ranges: {},
});
function withRelations(opened, metadata) {
  const data = opened.data,
    rel =
      opened.mode === 'inline'
        ? {
            present: Object.hasOwn(data, 'relations'),
            count: data.relations?.length ?? 0,
            pages: Math.ceil((data.relations?.length ?? 0) / 64),
          }
        : opened.relations;
  return { ...metadata, relations: { ...rel } };
}
function inlineMetadata(opened) {
  const data = opened.data;
  return withRelations(opened, {
    ...empty(),
    fields: BOOK_LORE_GENERATION_FIELDS.filter((k) => Object.hasOwn(data, k)),
    isPublic: { present: Object.hasOwn(data, 'isPublic'), value: data.isPublic ?? null },
    dates: Object.fromEntries(
      ['createdAt', 'updatedAt'].filter((k) => Object.hasOwn(data, k)).map((k) => [k, data[k]]),
    ),
  });
}
function resolveMetadata(opened, base, privacy) {
  if (opened.mode === 'inline') return { metadata: inlineMetadata(opened), needsPrivacy: false };
  const metadata = withRelations(opened, structuredClone(base));
  if (opened.storage.schemaVersion === 1) return { metadata, needsPrivacy: false };
  const fields = opened.storage.fields;
  if (Object.hasOwn(fields, 'isPublic') && fields.isPublic !== null && privacy === undefined)
    return { metadata, needsPrivacy: true };
  metadata.fields = BOOK_LORE_GENERATION_FIELDS.filter((k) =>
    Object.hasOwn(fields, k) ? fields[k] !== null : metadata.fields.includes(k),
  );
  metadata.dates = structuredClone(opened.storage.dates);
  if (Object.hasOwn(fields, 'isPublic'))
    metadata.isPublic =
      fields.isPublic === null
        ? { present: false, value: null }
        : { present: true, value: privacy };
  return { metadata, needsPrivacy: false };
}
export function createBookLoreSourceInspectionService({
  db,
  now = () => Date.now(),
  transaction = null,
}) {
  const transact = (fn) => (transaction ? fn(transaction) : db.runTransaction(fn));
  const service = {
    async startBookLoreSourceInspection(uid, input) {
      const intent = inspectionIntent(uid, input),
        startHash = inspectionStartHash(intent),
        c = inspectionPaths(db, uid, intent.inspectionId),
        hasher = await createSHA256();
      const result = await transact(async (tx) => {
        const old = await loadSourceInspection(tx, c, { startHash });
        if (old) return inspectionView(old);
        assertAnalysisChildUnit(tx, db, uid, 'inspection', intent.inspectionId);
        const { book, opened } = await inspectionSource(tx, c, intent),
          context = {
            ...intent,
            bookBirth: born(book.snapshot),
            mode: opened.mode,
            manifest: opened.manifest,
          },
          scanning = opened.mode === 'payload' && opened.manifest !== null,
          state = scanning
            ? {
                schemaVersion: 1,
                ownerId: uid,
                inspectionId: c.id,
                startHash,
                algorithm: SOURCE_INSPECTION_ALGORITHM,
                hashState: Buffer.from(hasher.save()).toString('base64'),
                parser: createBookLoreBaseIndex(intent.bookId),
              }
            : null;
        const orphans = await Promise.all([tx.get(c.stateRef), tx.get(c.certificateRef)]);
        if (orphans.some((s) => s.exists)) conflict();
        const job = {
          schemaVersion: 1,
          kind: 'inspection',
          ownerId: uid,
          inspectionId: c.id,
          startHash,
          context,
          phase: scanning ? 'base' : 'checking',
          revision: 0,
          nextIndex: 0,
          byteLength: 0,
          stateHash: state ? digest(state) : null,
          metadata: null,
          lastOperationId: null,
          createdAt: date(now),
        };
        tx.create(c.ref, job);
        if (state) tx.create(c.stateRef, state);
        return null;
      });
      return transaction
        ? result
        : (result ?? service.getBookLoreSourceInspection(uid, { inspectionId: c.id, startHash }));
    },
    async getBookLoreSourceInspection(uid, input) {
      const r = inspectionRequest(uid, input),
        c = inspectionPaths(db, uid, r.inspectionId);
      return transact(async (tx) => {
        const loaded = await loadSourceInspection(tx, c, r);
        return loaded ? inspectionView(loaded) : null;
      });
    },
    async advanceBookLoreSourceInspection(uid, input) {
      const r = inspectionRequest(uid, input, true, true),
        c = inspectionPaths(db, uid, r.inspectionId),
        hasher = await createSHA256(),
        stateLength = hasher.save().length;
      return transact(async (tx) => {
        const loaded = await loadSourceInspection(tx, c, r);
        if (!loaded || loaded.job.kind !== 'inspection') conflict();
        const replay = await replaySourceInspection(
          tx,
          loaded,
          'advanceBookLoreSourceInspection',
          r,
        );
        if (replay) return replay;
        assertAnalysisChildUnit(tx, db, uid, 'inspection', c.id);
        const j = loaded.job;
        if (j.revision !== r.expectedRevision || !['base', 'checking', 'privacy'].includes(j.phase))
          conflict();
        const { opened } = await inspectionSource(tx, c, j.context),
          state = await inspectionState(tx, loaded);
        let patch,
          nextState = null,
          finish = null;
        if (j.phase === 'base') {
          const saved = Buffer.from(state.hashState, 'base64');
          if (saved.length !== stateLength || saved.toString('base64') !== state.hashState)
            conflict();
          hasher.load(saved);
          const part = await readBookLoreRecordPart(tx, opened, 'base', 0, j.nextIndex),
            bytes = part.bytes,
            parser = advanceBookLoreBaseIndex(state.parser, bytes),
            nextIndex = j.nextIndex + 1,
            byteLength = j.byteLength + bytes.length;
          hasher.update(bytes);
          patch = { nextIndex, byteLength };
          if (nextIndex === j.context.manifest.chunkCount) {
            if (
              hasher.digest() !== j.context.manifest.contentHash ||
              byteLength !== j.context.manifest.byteLength
            )
              conflict();
            finish = resolveMetadata(opened, finishBookLoreBaseIndex(parser));
          } else
            nextState = {
              ...state,
              hashState: Buffer.from(hasher.save()).toString('base64'),
              parser,
            };
        } else if (j.phase === 'checking') finish = resolveMetadata(opened, empty());
        else {
          const part = await readBookLoreRecordPart(tx, opened, 'field', 0, 0, 'isPublic'),
            text = Buffer.from(part.bytes).toString('utf8');
          if (
            part.manifest.chunkCount !== 1 ||
            !['true', 'false'].includes(text) ||
            createHash('sha256').update(part.bytes).digest('hex') !== part.manifest.contentHash
          )
            conflict();
          finish = resolveMetadata(opened, j.metadata, text === 'true');
        }
        if (finish) {
          inspectionMetadata(finish.metadata);
          patch = {
            ...patch,
            phase: finish.needsPrivacy ? 'privacy' : 'ready',
            metadata: finish.metadata,
            stateHash: null,
          };
        } else patch = { ...patch, stateHash: digest(nextState) };
        let certificate;
        if (patch.phase === 'ready') {
          if ((await tx.get(c.certificateRef)).exists) conflict();
          certificate = inspectionCertificate(loaded, finish.metadata, r.operationId);
        }
        if (nextState) tx.set(c.stateRef, nextState);
        else if (state) tx.delete(c.stateRef);
        if (certificate) tx.create(c.certificateRef, certificate);
        return commitSourceInspection(tx, loaded, 'advanceBookLoreSourceInspection', r, patch);
      });
    },
    async cancelBookLoreSourceInspection(uid, input) {
      const r = inspectionRequest(uid, input, true),
        c = inspectionPaths(db, uid, r.inspectionId),
        run = (fn) => (transaction ? fn(transaction) : db.runTransaction(fn));
      return run(async (tx) => {
        const loaded = await loadSourceInspection(tx, c, r);
        if (!loaded) {
          if (r.jobToken !== undefined) conflict();
          if ((await tx.get(c.stateRef)).exists || (await tx.get(c.certificateRef)).exists)
            conflict();
          const job = {
            schemaVersion: 1,
            kind: 'fence',
            ownerId: uid,
            inspectionId: c.id,
            startHash: r.startHash,
            phase: 'cancelled',
          };
          tx.create(c.ref, job);
          return { receipt: null, progress: inspectionView({ c, job }) };
        }
        if (loaded.job.kind === 'fence') return { receipt: null, progress: inspectionView(loaded) };
        const replay = await replaySourceInspection(
          tx,
          loaded,
          'cancelBookLoreSourceInspection',
          r,
        );
        if (replay) return replay;
        if (loaded.job.phase === 'cancelled')
          return { receipt: null, progress: inspectionView(loaded) };
        const state = await inspectionState(tx, loaded);
        if (state) tx.delete(c.stateRef);
        return commitSourceInspection(tx, loaded, 'cancelBookLoreSourceInspection', r, {
          phase: 'cancelled',
          metadata: null,
          stateHash: null,
        });
      });
    },
  };
  return service;
}
