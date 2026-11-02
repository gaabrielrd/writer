import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const corpus = JSON.parse(
  readFileSync(new URL('./fixtures/visible-prose.json', import.meta.url), 'utf8'),
);
import { countVisibleWords } from '../src/visibleWordCount.mjs';

for (const { id, content, tokens, wordCount } of corpus) {
  test(`counts visible manuscript prose: ${id}`, () => {
    assert.equal(wordCount, tokens.length, 'Golden count describes the visible tokens.');
    const actual = countVisibleWords(content);
    assert.equal(actual, wordCount);
    assert.equal(Number.isSafeInteger(actual), true);
    assert.ok(actual >= 0);
  });
}

test('counts a large legacy manuscript completely without truncating or rewriting it', () => {
  const content = '<p>Lua cheia &amp; maré alta.</p>'.repeat(30000);
  const original = content;
  assert.equal(countVisibleWords(content), 120000);
  assert.equal(content, original);
});

test('rejects non-text instead of silently confirming a zero manuscript', () => {
  for (const content of [null, undefined, 42, {}, []])
    assert.throws(() => countVisibleWords(content), TypeError);
});
