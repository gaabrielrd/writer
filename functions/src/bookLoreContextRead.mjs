import { createHash } from 'node:crypto';
import { GenerationError } from './generation.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  loreReadScope,
  readLoreBook,
  loreReadId,
  loreEntityToken,
  loreTransportManifest,
  loreChanged,
} from './bookLoreReadContracts.mjs';
import { openBookLoreRecord, readBookLoreRecordPart } from './bookLoreStorageRead.mjs';
import {
  createBookLoreBaseIndex,
  advanceBookLoreBaseIndex,
  finishBookLoreBaseIndex,
} from './bookLoreBaseIndex.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
import { createBookLoreTextProjection } from './bookLoreTextProjection.mjs';

function validateField(bytes, field, observer) {
  let state = createBookLoreFieldValidation({ field });
  for (let at = 0; at < bytes.length; at += 65536)
    state = advanceBookLoreFieldValidation(state, bytes.subarray(at, at + 65536), observer);
  finishBookLoreFieldValidation(state);
}
/** Own native reads under one authorized transaction; never a transport/source DTO. */
export async function createBookLoreContextReader(tx, db, uid, bookId) {
  const c = loreReadScope(db, uid, { bookId }, []),
    book = await readLoreBook(tx, c);
  return {
    async read(id, selection, budget) {
      const projection = createBookLoreTextProjection(selection, budget),
        requested = Object.keys(projection.observers);
      id = loreReadId(id);
      try {
        const snapshot = await tx.get(db.doc(c.path + '/lore/' + id));
        if (
          snapshot.exists &&
          Object.hasOwn(snapshot.data(), 'deleted') &&
          snapshot.data().deleted !== false
        )
          loreChanged();
        const opened = await openBookLoreRecord(tx, c, snapshot);
        let present = [],
          privacy = { present: false, value: null };
        if (opened.mode === 'inline') {
          budget.reserve({ bytes: opened.bytes.length });
          for (const field of requested) {
            if (!Object.hasOwn(opened.data, field)) continue;
            validateField(
              Buffer.from(JSON.stringify(opened.data[field]), 'utf8'),
              field,
              projection.observers[field],
            );
            present.push(field);
          }
          privacy = {
            present: Object.hasOwn(opened.data, 'isPublic'),
            value: opened.data.isPublic ?? null,
          };
        } else {
          const overrides = opened.storage.schemaVersion === 2 ? opened.storage.fields : {};
          if (opened.manifest !== null) {
            const observers = Object.fromEntries(
              requested
                .filter((field) => !Object.hasOwn(overrides, field))
                .map((field) => [field, projection.observers[field]]),
            );
            let state = createBookLoreBaseIndex(c.bookId);
            await stream('base', undefined, opened.manifest, (bytes) => {
              state = advanceBookLoreBaseIndex(state, bytes, observers);
            });
            const metadata = finishBookLoreBaseIndex(state);
            present = metadata.fields.filter((field) => !Object.hasOwn(overrides, field));
            privacy = metadata.isPublic;
          }
          for (const field of requested) {
            if (!Object.hasOwn(overrides, field)) continue;
            if (overrides[field] === null) continue;
            let state = createBookLoreFieldValidation({ field });
            await stream('field', field, overrides[field].manifest, (bytes) => {
              state = advanceBookLoreFieldValidation(state, bytes, projection.observers[field]);
            });
            finishBookLoreFieldValidation(state);
            present.push(field);
          }
          if (Object.hasOwn(overrides, 'isPublic')) {
            if (overrides.isPublic === null) privacy = { present: false, value: null };
            else {
              if (![4, 5].includes(overrides.isPublic.manifest.byteLength)) loreChanged();
              let state = createBookLoreFieldValidation({ field: 'isPublic' });
              const parts = [];
              await stream('field', 'isPublic', overrides.isPublic.manifest, (bytes) => {
                state = advanceBookLoreFieldValidation(state, bytes);
                if (bytes.length > 5) loreChanged();
                parts.push(bytes);
              });
              finishBookLoreFieldValidation(state);
              privacy = { present: true, value: JSON.parse(Buffer.concat(parts).toString('utf8')) };
            }
          }
        }
        if (
          Object.hasOwn(opened.value, 'isPublic') &&
          (!privacy.present || privacy.value !== opened.value.isPublic)
        )
          loreChanged();
        return {
          mode: opened.mode,
          snapshot,
          sourceToken: loreEntityToken(c, book, snapshot, 2),
          fields: projection.finish(present),
          privacy,
        };
        async function stream(section, field, manifest, consume) {
          budget.reserve({ bytes: manifest.byteLength, parts: manifest.chunkCount });
          const hash = createHash('sha256');
          let length = 0;
          for (let index = 0; index < manifest.chunkCount; index++) {
            const part = await readBookLoreRecordPart(tx, opened, section, 0, index, field);
            if (digest(part.manifest) !== digest(loreTransportManifest(manifest))) loreChanged();
            length += part.bytes.length;
            hash.update(part.bytes);
            consume(part.bytes);
          }
          if (length !== manifest.byteLength || hash.digest('hex') !== manifest.contentHash)
            loreChanged();
        }
      } catch (error) {
        if (error instanceof GenerationError && error.code !== 'resource-exhausted') loreChanged();
        throw error;
      }
    },
  };
}
