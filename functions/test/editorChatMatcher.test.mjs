import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  editorChatMatcherId,
  findEditorChatLoreMatches,
  preferredEditorChatTerms,
  selectEditorChatLore,
  createEditorChatLoreAccumulator,
  advanceEditorChatLoreAccumulator,
  finishEditorChatLoreAccumulator,
} from '../src/editorChatMatcher.mjs';
const vectors = JSON.parse(
  readFileSync(new URL('./editorChatVectors.json', import.meta.url), 'utf8'),
);
const reject = (fn) => assert.throws(fn, (e) => e.details?.reason === 'context-too-complex');
for (const v of vectors.matcher)
  test('independent deterministic matcher: ' + v.name, () => {
    assert.deepEqual(findEditorChatLoreMatches(v.text, v.entities), v.result);
    assert.deepEqual(findEditorChatLoreMatches(v.text, [...v.entities].reverse()), v.result);
    let accumulator = createEditorChatLoreAccumulator();
    for (let i = 0; i < v.entities.length; i += 25)
      accumulator = advanceEditorChatLoreAccumulator(
        v.text,
        accumulator,
        v.entities.slice(i, i + 25),
      );
    assert.deepEqual(finishEditorChatLoreAccumulator(v.text, accumulator).matches, v.result);
  });
test('qualified identity separates same document ID across scopes and ambiguous delimiters', () => {
  const local = { kind: 'adventure', scopeId: 'a', entityId: 'same' };
  const global = { kind: 'universe', scopeId: 'w', entityId: 'same' };
  const metadata = [
    { id: editorChatMatcherId(local), reference: local, global: false, name: 'Aria', aliases: [] },
    {
      id: editorChatMatcherId(global),
      reference: global,
      global: true,
      name: 'Aria',
      aliases: ['World'],
    },
  ];
  const matches = findEditorChatLoreMatches('Aria World', metadata);
  assert.deepEqual(
    selectEditorChatLore(matches).ids,
    metadata.map((v) => v.id),
  );
  assert.equal(preferredEditorChatTerms(metadata).get('aria').id, metadata[0].id);
  assert.notEqual(
    editorChatMatcherId({ kind: 'book', scopeId: 'a:b', entityId: 'c' }),
    editorChatMatcherId({ kind: 'book', scopeId: 'a', entityId: 'b:c' }),
  );
  assert.throws(() => findEditorChatLoreMatches('Aria', [{ ...metadata[0], id: 'same' }]));
});
test('composed key may exceed1500 bytes while each source ID is valid', () => {
  const reference = { kind: 'book', scopeId: 's'.repeat(1400), entityId: 'e'.repeat(1400) };
  const id = editorChatMatcherId(reference);
  assert.ok(new TextEncoder().encode(id).length > 1500);
  const e = { id, reference, name: 'Aria', aliases: [], global: false };
  assert.equal(findEditorChatLoreMatches('Aria', [e])[0].id, id);
  const a = advanceEditorChatLoreAccumulator('Aria', createEditorChatLoreAccumulator(), [e]);
  assert.equal(finishEditorChatLoreAccumulator('Aria', a).ids[0], id);
});
test('paged scan does not cap the library or depend on discovery/page order', () => {
  const filler = Array.from({ length: 2000 }, (_, i) => ({
    id: 'e' + i,
    name: 'Other' + i,
    aliases: [],
    global: false,
  }));
  const local = { id: 'zlocal', name: 'Aria', aliases: [], global: false };
  const global = { id: 'aglobal', name: 'Aria', aliases: [], global: true };
  let a = createEditorChatLoreAccumulator();
  a = advanceEditorChatLoreAccumulator('Aria', a, [global]);
  for (let i = 0; i < filler.length; i += 50)
    a = advanceEditorChatLoreAccumulator('Aria', a, filler.slice(i, i + 50));
  a = advanceEditorChatLoreAccumulator('Aria', a, [local]);
  assert.equal(a.terms.length, 1);
  assert.deepEqual(finishEditorChatLoreAccumulator('Aria', a).ids, ['zlocal']);
});
test('128 relevant terms fit;129 fail without modifying prior accumulator', () => {
  const entities = Array.from({ length: 129 }, (_, i) => ({
    id: 'e' + i,
    name: 'n' + String(i).padStart(3, '0'),
    aliases: [],
    global: false,
  }));
  const text = entities.map((e) => e.name).join(' '),
    initial = createEditorChatLoreAccumulator();
  const a = advanceEditorChatLoreAccumulator(text, initial, entities.slice(0, 128));
  assert.equal(a.terms.length, 128);
  assert.deepEqual(initial, createEditorChatLoreAccumulator());
  const before = structuredClone(a);
  reject(() => advanceEditorChatLoreAccumulator(text, a, [entities[128]]));
  assert.deepEqual(a, before);
});
test('4096 intervals fit context;4097 fail while mentions remain uncapped by context budget', () => {
  const e = { id: 'e', name: 'x', aliases: [], global: false };
  const text = 'x '.repeat(4096);
  const a = advanceEditorChatLoreAccumulator(text, createEditorChatLoreAccumulator(), [e]);
  assert.equal(finishEditorChatLoreAccumulator(text, a).matches.length, 4096);
  reject(() =>
    advanceEditorChatLoreAccumulator(text + 'x', createEditorChatLoreAccumulator(), [e]),
  );
  assert.equal(findEditorChatLoreMatches(text + 'x', [e]).length, 4097);
});
test('serialized accumulator limit counts UTF8 references and never truncates', () => {
  const entities = Array.from({ length: 128 }, (_, i) => {
    const reference = {
      kind: 'book',
      scopeId: 's'.repeat(1000),
      entityId: String(i) + 'e'.repeat(1000),
    };
    return {
      id: editorChatMatcherId(reference),
      reference,
      name: 'n' + String(i).padStart(3, '0'),
      aliases: [],
      global: false,
    };
  });
  reject(() =>
    advanceEditorChatLoreAccumulator(
      entities.map((e) => e.name).join(' '),
      createEditorChatLoreAccumulator(),
      entities,
    ),
  );
});
test('selection reports all distinct winners and explicit12 budget in mention order', () => {
  const v = vectors.matcher.find((v) => v.name === 'thirteen-distinct-entities-selection-budget');
  const matches = findEditorChatLoreMatches(v.text, v.entities);
  const selected = selectEditorChatLore([...matches, matches[0]]);
  assert.deepEqual(selected, {
    ids: v.entities.slice(0, 12).map((e) => e.id),
    matchedEntityCount: 13,
    includedEntityCount: 12,
    omittedEntityCount: 1,
  });
});
