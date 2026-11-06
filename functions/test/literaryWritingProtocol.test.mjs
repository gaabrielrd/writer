import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLiteraryWritingManifest,
  normalizeLiteraryWritingSnapshot,
} from '../src/literaryWritingProtocol.mjs';
const hash = 'a'.repeat(64);
const manifest = () => ({
  version: 1,
  target: { kind: 'book', id: 'book' },
  resource: { kind: 'chapter', id: 'chapter' },
  bookToken: hash,
  selection: 'explicit',
  contractRevision: 1,
  planIds: [],
  plans: [],
  references: [],
});
test('the writing wire accepts only metadata in its authorization manifest', () => {
  const value = manifest();
  assert.deepEqual(normalizeLiteraryWritingManifest(value), value);
  assert.throws(() =>
    normalizeLiteraryWritingManifest({ ...value, privateText: 'not a metadata field' }),
  );
  assert.throws(() => normalizeLiteraryWritingManifest({ ...value, planIds: ['same', 'same'] }));
});
test('snapshots state editorial coverage without claiming a whole-book review', () => {
  const value = {
    version: 1,
    manifest: manifest(),
    stateToken: hash,
    mode: 'chat',
    instruction: 'Guia',
    documents: [],
    coverage: {
      scope: 'selected-editorial-sources',
      completeForSelection: true,
      wholeBook: false,
      omittedFields: [],
    },
  };
  assert.deepEqual(normalizeLiteraryWritingSnapshot(value), value);
  assert.throws(() =>
    normalizeLiteraryWritingSnapshot({
      ...value,
      coverage: { ...value.coverage, wholeBook: true },
    }),
  );
});
test('a compact snapshot may not exceed its byte budget', () => {
  const value = {
    version: 1,
    manifest: manifest(),
    stateToken: hash,
    mode: 'autocomplete',
    instruction: 'X'.repeat(48000),
    documents: [],
    coverage: {
      scope: 'selected-editorial-sources',
      completeForSelection: false,
      wholeBook: false,
      omittedFields: [],
    },
  };
  assert.throws(() => normalizeLiteraryWritingSnapshot(value));
});
