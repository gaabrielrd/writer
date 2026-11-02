import { resourcesRestoreFixture } from './bookRestoreResourcesFixture.mjs';
import {
  readyRestorePersonaLibrary,
  finishRestorePersonaLibrary,
} from './bookRestorePersonaLibraryFixture.mjs';
import { record, resource, address, hash } from './bookContentFixture.mjs';
import { sourceText } from './bookSceneSourceFixture.mjs';
const decode = (r) => JSON.parse(new TextDecoder().decode(r.payload));
export function sourceIndexesRecords({
  content = sourceText,
  sources = 1,
  inlineExtra = false,
} = {}) {
  const records = resourcesRestoreFixture(),
    source = decode(records.find((r) => r.kind === 'book-scene-source')),
    binding = decode(
      records.find((r) => r.kind === 'book-persona' && decode(r).scope === 'scene-source'),
    ),
    filtered = records.filter(
      (r) =>
        r.kind !== 'book-scene-source' &&
        !(r.kind === 'book-persona' && decode(r).scope === 'scene-source'),
    ),
    sourceRows = [],
    bindings = [];
  for (let i = 0; i < sources; i++) {
    const id = i === 0 ? 'chapter' : 'extra-source-' + i,
      text = i > 0 && inlineExtra ? 'Inline preserved' : content,
      data = {
        ...source.data,
        original: { ...source.data.original, content: text },
        hash: hash(text),
      };
    sourceRows.push(resource('scene-source', id, data));
    bindings.push(
      record('book-persona', address(['scene-source', id]), {
        ...structuredClone(binding),
        ownerId: id,
      }),
    );
  }
  const at = filtered.findIndex((r) => r.kind === 'book-resources');
  filtered.splice(at, 0, ...sourceRows);
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i].kind === 'book-resources') {
      const value = decode(filtered[i]);
      value.counts['scene-source'] = sources;
      filtered[i] = record('book-resources', 'book', value);
    } else if (filtered[i].kind === 'book-personas') {
      const value = decode(filtered[i]);
      value.owners['scene-source'] = sources;
      value.bindings['scene-source'] = sources;
      filtered[i] = record('book-personas', 'book', value);
    }
  }
  filtered.splice(
    filtered.findIndex((r) => r.kind === 'book-personas'),
    0,
    ...bindings,
  );
  return filtered.flatMap((r) =>
    r.payload.length <= 65536
      ? [r]
      : Array.from({ length: Math.ceil(r.payload.length / 65536) }, (_, part) => ({
          ...r,
          part,
          payload: r.payload.subarray(part * 65536, (part + 1) * 65536),
        })),
  );
}
/** Reproduce the old optional-field representation at native birth, never by timestamp repair. */
export function sourceIndexesLegacyDb(db, mode = 'missing') {
  return new Proxy(db, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'runTransaction')
        return (operation, ...options) =>
          value.call(
            target,
            async (tx) =>
              operation(
                new Proxy(tx, {
                  get(transaction, property) {
                    const method = Reflect.get(transaction, property, transaction);
                    if (property === 'create')
                      return (ref, data, ...args) => {
                        let stored = data;
                        if (Object.hasOwn(data, 'sceneSourceEncoding')) {
                          stored = { ...data };
                          if (mode === 'missing') delete stored.sceneSourceEncoding;
                          else if (mode === 'corrupt')
                            stored.sceneSourceEncoding = {
                              ...stored.sceneSourceEncoding,
                              byteLength: stored.sceneSourceEncoding.byteLength + 1,
                            };
                        }
                        return method.call(transaction, ref, stored, ...args);
                      };
                    return typeof method === 'function' ? method.bind(transaction) : method;
                  },
                }),
              ),
            ...options,
          );
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
export async function readyRestoreSourceIndexes(
  factory,
  uid,
  id,
  records = sourceIndexesRecords(),
) {
  return finishRestorePersonaLibrary(
    factory,
    uid,
    id,
    await readyRestorePersonaLibrary(factory, uid, id, records),
  );
}
export async function finishRestoreSourceIndexes(
  factory,
  uid,
  id,
  progress,
  prefix = id + '-source-index-',
) {
  let unit = 0;
  while (!progress.preparation.sourceIndexes?.complete) {
    if (unit > 10000) throw new Error('Source indexing did not finish');
    progress = (
      await factory().advanceBookRestoreSourceIndexes(uid, {
        restoreId: id,
        jobToken: progress.jobToken,
        expectedCheckpoint: progress.checkpoint,
        operationId: prefix + unit++,
      })
    ).progress;
  }
  return progress;
}
