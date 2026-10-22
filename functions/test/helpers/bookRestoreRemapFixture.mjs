import assert from 'node:assert/strict';
import { fixture, record, resource } from './bookContentFixture.mjs';
/** Test-only collector: production consumers must keep pages/parts bounded. */
export async function collectMappedRestore(reader, verify) {
  const records = [];
  for (let index = 0; index < reader.itemCount; index++) {
    const item = await reader.readMappedItem(index);
    await verify(item);
    if (item.loreRelations !== null) {
      item.value.data.relations = [];
      let offset = 0;
      do {
        const page = await item.loreRelations.read(offset);
        assert.ok(page.values.length <= 64);
        await verify(page);
        item.value.data.relations.push(...page.values);
        offset += page.values.length;
        if (page.done) break;
      } while (offset < item.loreRelations.count);
    }
    const encoded = record(item.record.kind, item.record.id, item.value);
    for (let offset = 0; offset < encoded.payload.length; offset += 65536)
      records.push({
        ...encoded,
        part: offset / 65536,
        payload: encoded.payload.slice(offset, offset + 65536),
      });
    if (item.raw) {
      assert.ok(item.rawIdentity);
      for await (const part of item.raw()) {
        await verify(part);
        records.push({ ...item.rawIdentity, part: part.part, payload: part.bytes });
      }
    } else assert.equal(item.rawIdentity, null);
  }
  return records;
}

/** Local ID intentionally resembles an external qualifier; it must win by indexed identity. */
export function qualifiedLoreRestoreFixture() {
  const records = fixture(),
    localId = 'universe:shared:local',
    at = records.findIndex((r) => r.kind === 'book-lore');
  records[at] = resource('lore', localId, {
    name: 'Own local lore',
    category: 'character',
    details: 'Own prose',
    relations: [
      {
        targetEntityId: localId,
        relationType: 'self',
        description: 'literal universe:shared:local',
      },
      { targetEntityId: 'universe:other:external', relationType: 'knows' },
      { targetEntityId: 'gone', relationType: 'knows' },
    ],
  });
  return records;
}
