import { resourcesRestoreFixture } from './bookRestoreResourcesFixture.mjs';
import { record, hash } from './bookContentFixture.mjs';
export const sourceText = '\ufeff  Ação 🌙\n' + 'Literal frozen source  '.repeat(52000);
export function largeSceneSourceFixture(content = sourceText) {
  return resourcesRestoreFixture().flatMap((r) => {
    if (r.kind !== 'book-scene-source') return [r];
    const value = JSON.parse(new TextDecoder().decode(r.payload));
    value.data.original.content = content;
    value.data.hash = hash(content);
    const updated = record(r.kind, r.id, value);
    return Array.from({ length: Math.ceil(updated.payload.length / 65536) }, (_, part) => ({
      ...updated,
      part,
      payload: updated.payload.subarray(part * 65536, (part + 1) * 65536),
    }));
  });
}
