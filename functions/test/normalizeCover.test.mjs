import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeCover } from '../src/normalizeCover.mjs';
test('normalizes a landscape provider response to an exact 1200x1800 PNG', async () => {
  const source = await sharp({
    create: { width: 500, height: 300, channels: 3, background: '#24383e' },
  })
    .jpeg()
    .toBuffer();
  const output = await normalizeCover(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1800);
  assert.equal(metadata.format, 'png');
});
test('rejects a malformed provider image instead of persisting an unusable cover', async () => {
  await assert.rejects(normalizeCover(Buffer.from('not an image')));
});
