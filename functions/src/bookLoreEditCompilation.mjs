import { createSHA256 } from 'hash-wasm';
import { born, date } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  BOOK_LORE_GENERATION_FIELDS,
  loreGenerationStorage,
} from './bookLoreGenerationContracts.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayloadPart,
} from './bookResourcePayloadRead.mjs';
import { openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import {
  editReservationPaths,
  editReservationRequest,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  replayEditReservation,
  commitEditReservation,
} from './bookLoreEditReservationStore.mjs';
import { COMPILATION_ALGORITHM } from './bookLoreEditCompilationContracts.mjs';
import {
  compilationSource,
  compilationSlot,
  prepareCompilationReference,
  prepareCompilationSegment,
  compilationSelection,
  readCompilationAudit,
  compilationAuditRef,
  sourceRelations,
} from './bookLoreEditCompilationStore.mjs';
export function createBookLoreEditCompilationService({ db, now = () => Date.now() }) {
  return {
    async advanceBookLoreEditCompilation(uid, input) {
      const r = editReservationRequest(uid, input, [], true, true),
        c = editReservationPaths(db, uid, r.editId),
        hasher = await createSHA256();
      return db.runTransaction(async (tx) => {
        const l = await loadEditReservation(tx, c, r);
        if (!l || l.job.kind === 'fence') conflict();
        const replay = await replayEditReservation(tx, l, 'advanceBookLoreEditCompilation', r);
        if (replay) return replay;
        const j = l.job;
        if (j.phase !== 'preparing' || j.revision !== r.expectedRevision) conflict();
        const source = await compilationSource(tx, l),
          opened = source.source.opened,
          intent = j.context.intent;
        let s = j.compilation ? structuredClone(j.compilation) : null;
        if (!s) {
          const copied = Object.hasOwn(intent, 'relations'),
            relations = copied ? intent.relations : sourceRelations(source),
            old = sourceRelations(source);
          s = {
            schemaVersion: 1,
            phase: 'base',
            timestamp: date(now),
            base: opened.storage.base,
            fields:
              opened.storage.schemaVersion === 2 ? structuredClone(opened.storage.fields) : {},
            fieldIndex: 0,
            page: 0,
            relations: {
              present: relations.present,
              count: relations.count,
              pages: Math.ceil(relations.count / 64),
              generationId: copied ? j.generationId : old.generationId,
              sealBirth: copied ? null : old.sealBirth,
              copied,
            },
            auditSelector: 0,
            auditIndex: 0,
            auditedParts: 0,
            auditHash: null,
            cleanupPage: 0,
            storage: null,
          };
          const orphanState = await tx.get(compilationAuditRef(l)),
            orphanCertificate = await tx.get(db.doc(c.path + '/compilationCertificate/current')),
            orphanSegments = await tx.get(
              db
                .collection(c.path + '/compilationSegments')
                .limit(1)
                .select(),
            );
          if (orphanState.exists || orphanCertificate.exists || orphanSegments.docs.length)
            conflict();
        } else await readCompilationAudit(tx, l);
        if (s.phase === 'ready') conflict();
        const finish = () =>
          commitEditReservation(tx, l, 'advanceBookLoreEditCompilation', r, { compilation: s });
        if (s.phase === 'base') {
          if (s.base) {
            const plan = await prepareCompilationReference(tx, l, s.base, {
              section: 'base',
              page: 0,
            });
            if (!plan.complete) {
              plan.commit();
              return finish();
            }
          }
          s.phase = 'fields';
          return finish();
        }
        if (s.phase === 'fields') {
          if (s.fieldIndex === 7) {
            s.phase = 'relations';
            return finish();
          }
          const field = BOOK_LORE_GENERATION_FIELDS[s.fieldIndex];
          let pointer = s.fields[field];
          if (Object.hasOwn(intent.fields, field))
            pointer =
              intent.fields[field] === null ? null : await compilationSlot(tx, l, { field }, true);
          if (pointer) {
            const plan = await prepareCompilationReference(tx, l, pointer, {
              section: 'field',
              field,
              page: 0,
            });
            if (!plan.complete) {
              plan.commit();
              return finish();
            }
          }
          if (pointer !== undefined) s.fields[field] = pointer;
          s.fieldIndex++;
          return finish();
        }
        if (s.phase === 'relations') {
          if (s.page === s.relations.pages) {
            s.phase = 'audit';
            return finish();
          }
          const page = s.page,
            count = Math.min(64, s.relations.count - page * 64),
            target = { field: 'relations', page, count };
          let pointer = s.relations.copied ? await compilationSlot(tx, l, target) : null;
          if (!pointer) {
            const old = sourceRelations(source);
            if (page >= old.pages || Math.min(64, old.count - page * 64) !== count) conflict();
            pointer = (await openBookLoreRelationPage(tx, opened, page)).pointer;
          }
          const plan = await prepareCompilationReference(tx, l, pointer, {
            section: 'relations',
            page,
          });
          if (!plan.complete) {
            plan.commit();
            return finish();
          }
          const segment = s.relations.copied
            ? await prepareCompilationSegment(tx, l, r, page, pointer, count)
            : null;
          s.page++;
          segment?.commit();
          return finish();
        }
        if (s.phase === 'audit') {
          if (s.auditSelector === 8 + s.relations.pages) {
            if (s.auditHash !== null) conflict();
            s.phase = 'finalize';
            return finish();
          }
          const selected = await compilationSelection(tx, l, source, s.auditSelector);
          if (!selected) {
            s.auditSelector++;
            return finish();
          }
          const { pointer } = selected,
            plan = await prepareCompilationReference(tx, l, pointer, selected.selector);
          if (!plan.complete) conflict();
          const body = await openBookResourcePayload(tx, db, {
              uid,
              bookId: intent.bookId,
              resource: { kind: 'lore', parentId: null, id: intent.loreId },
              ...pointer,
            }),
            saved = await readCompilationAudit(tx, l);
          let parser =
            selected.field === null
              ? null
              : createBookLoreFieldValidation(
                  selected.field === 'relations'
                    ? { field: 'relations', count: selected.count }
                    : { field: selected.field },
                );
          if (saved) {
            if (saved.manifestHash !== digest(pointer.manifest)) conflict();
            hasher.load(Buffer.from(saved.hashState, 'base64'));
            parser = saved.parser;
          } else if (s.auditIndex !== 0) conflict();
          const bytes = await readBookResourcePayloadPart(tx, db, body, s.auditIndex);
          hasher.update(bytes);
          if (parser) parser = advanceBookLoreFieldValidation(parser, bytes);
          s.auditIndex++;
          s.auditedParts++;
          if (s.auditIndex === pointer.manifest.chunkCount) {
            if (hasher.digest('hex') !== pointer.manifest.contentHash) conflict();
            if (parser) finishBookLoreFieldValidation(parser);
            s.auditSelector++;
            s.auditIndex = 0;
            s.auditHash = null;
            if (saved) tx.delete(compilationAuditRef(l));
          } else {
            const state = {
              schemaVersion: 1,
              editToken: l.token,
              algorithm: COMPILATION_ALGORITHM,
              operationId: r.operationId,
              selector: s.auditSelector,
              index: s.auditIndex,
              manifestHash: digest(pointer.manifest),
              hashState: Buffer.from(hasher.save()).toString('base64'),
              parser,
            };
            s.auditHash = digest(state);
            tx.set(compilationAuditRef(l), state);
          }
          return finish();
        }
        if (
          s.phase !== 'finalize' ||
          s.auditHash !== null ||
          s.auditSelector !== 8 + s.relations.pages
        )
          conflict();
        const old = await tx.get(db.doc(c.path + '/compilationCertificate/current'));
        if (old.exists) conflict();
        const sealBirth = born({ createTime: l.snapshot.updateTime });
        s.storage = loreGenerationStorage({
          schemaVersion: 2,
          generationId: j.generationId,
          base: s.base,
          fields: s.fields,
          dates: {
            ...(Object.hasOwn(source.metadata.dates, 'createdAt')
              ? { createdAt: source.metadata.dates.createdAt }
              : {}),
            updatedAt: s.timestamp,
          },
          relations: {
            present: s.relations.present,
            count: s.relations.count,
            pages: s.relations.pages,
            generationId: s.relations.generationId,
            sealBirth: s.relations.sealBirth ?? sealBirth,
          },
          sealBirth,
        });
        s.phase = 'ready';
        tx.create(db.doc(c.path + '/compilationCertificate/current'), {
          schemaVersion: 1,
          editToken: l.token,
          operationId: r.operationId,
          storageHash: digest(s.storage),
          sourceMetadataHash: digest(source.metadata),
          auditedParts: s.auditedParts,
        });
        return finish();
      });
    },
  };
}
