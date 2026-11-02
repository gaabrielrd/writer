import { readFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createPublicKey } from 'node:crypto';
import assert from 'node:assert/strict';
import { adventureImportDb } from './adventureImportDb.mjs';
import { createCampaignRestoreTransferService } from '../../src/campaignRestoreTransfer.mjs';
export async function legacyVariantFixture() {
  const compressed = await readFile(
    new URL('../fixtures/campaign-legacy-variant.json.br', import.meta.url),
  );
  assert.ok(compressed.length < 1024 * 1024);
  const bytes = brotliDecompressSync(compressed, { maxOutputLength: 2 * 1024 * 1024 }),
    data = JSON.parse(bytes.toString('utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.kind, 'test-only-native-legacy-variant');
  assert.equal(data.baseCommit, 'be6a8ca');
  assert.equal(data.uid, 'author');
  assert.equal(data.rid, 'campaign-origin-restore-0001');
  assert.doesNotMatch(bytes.toString('utf8'), /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  const f = adventureImportDb({ nativeUpdates: true });
  for (const [path, value] of data.records) f.records.set(path, structuredClone(value));
  for (const [path, value] of data.native) f.metadata.set(path, structuredClone(value));
  f.keys = data.keys.map((key) => ({ ...key, publicKey: createPublicKey(key.publicKey) }));
  f.p = data.progress;
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys });
  return f;
}
