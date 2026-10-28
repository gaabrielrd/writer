// @vitest-environment node
import { it, expect } from 'vitest';
import { createAdventureRestoreUploadDriver as create } from '../services/adventureRestoreUploadDriver.ts';
import { uploadHarness } from './adventureTransferHarness.mjs';
const driver = (f, extra = {}) =>
  create({
    identity: f.identity,
    source: f.descriptor,
    file: f.file,
    check: () => {},
    api: f.remote,
    ...extra,
  });
it('uploads exact bounded chunks and pauses after the complete real byte stream', async () => {
  const f = await uploadHarness(),
    upload = driver(f);
  let result;
  for (let n = 0; n < 3; n++) {
    result = await upload.step();
    expect(result).toMatchObject({ kind: 'confirmed', index: n });
  }
  expect((await upload.step()).kind).toBe('paused');
  const rows = [...f.records]
    .filter(([k]) => k.startsWith(f.path + '/chunks/'))
    .sort(([a], [b]) => a.localeCompare(b));
  expect(Buffer.concat(rows.map(([, v]) => Buffer.from(v.chunkBase64, 'base64')))).toEqual(f.bytes);
  expect(result.progress.uploadedBytes).toBe(f.bytes.length);
  expect(
    f.calls
      .filter((c) => c.name === 'append')
      .every((c) => Buffer.from(c.input.chunkBase64, 'base64').length <= 65536),
  ).toBe(true);
});
it('unknown append response retains exactly the same pending bytes and operation', async () => {
  const f = await uploadHarness(),
    append = f.remote.append;
  let first = true;
  f.remote.append = async (input) => {
    const r = await append(input);
    if (first) {
      first = false;
      throw Error('Lost append response');
    }
    return r;
  };
  const upload = driver(f);
  await expect(upload.step()).rejects.toThrow('Lost append');
  const result = await upload.step(),
    calls = f.calls.filter((c) => c.name === 'append');
  expect(calls[0]).toEqual(calls[1]);
  expect(result.index).toBe(0);
  expect(f.records.get(f.path).uploadedChunks).toBe(1);
});
it('fresh driver reads the acknowledged offset after response loss without duplicating the prior block', async () => {
  const f = await uploadHarness(),
    append = f.remote.append;
  f.remote.append = async (input) => {
    await append(input);
    throw Error('Lost');
  };
  await expect(driver(f).step()).rejects.toThrow();
  f.remote.append = append;
  expect(await driver(f).step()).toMatchObject({ kind: 'confirmed', index: 1 });
  expect(f.records.get(f.path).uploadedChunks).toBe(2);
});
it('new driver uses the same operation and bytes if the first request never reached the server', async () => {
  const f = await uploadHarness(),
    append = f.remote.append,
    attempts = [];
  f.remote.append = async (input) => {
    attempts.push(structuredClone(input));
    throw Error('Unsent');
  };
  await expect(driver(f).step()).rejects.toThrow();
  f.remote.append = async (input) => {
    attempts.push(structuredClone(input));
    return append(input);
  };
  await driver(f).step();
  expect(attempts[0]).toEqual(attempts[1]);
});
it('wrong size or same-size changed content cannot send bytes or erase existing work', async () => {
  const f = await uploadHarness();
  expect(() => driver(f, { file: new Blob(['too short']) })).toThrow();
  await expect(
    driver(f, { file: new Blob([Buffer.alloc(f.bytes.length, 66)]) }).step(),
  ).rejects.toMatchObject({ code: 'adventure-restore-file-mismatch' });
  expect(f.calls.filter((c) => c.name === 'append')).toHaveLength(0);
  expect(f.records.get(f.path).uploadedChunks).toBe(0);
});
it.each(['id', 'sequence', 'bytes', 'state', 'source', 'identity'])(
  'malformed append acknowledgement %s preserves the original pending request',
  async (field) => {
    const f = await uploadHarness(),
      append = f.remote.append;
    f.remote.append = async (input) => {
      const r = await append(input);
      if (field === 'id') r.receipt.operationId = 'another-operation-0001';
      if (field === 'sequence') r.receipt.sequence++;
      if (field === 'bytes') r.receipt.uploadedBytes--;
      if (field === 'state') r.receipt.state = 'activated';
      if (field === 'source') r.progress.source.sha256 = 'd'.repeat(64);
      if (field === 'identity') r.progress.jobToken = 'd'.repeat(64);
      return r;
    };
    const upload = driver(f);
    await expect(upload.step()).rejects.toThrow();
    f.remote.append = append;
    await upload.step();
    const calls = f.calls.filter((c) => c.name === 'append');
    expect(calls[0]).toEqual(calls[1]);
  },
);
it('native Blob snapshot ignores caller slice overrides and captures identity/source before awaits', async () => {
  const f = await uploadHarness(),
    identity = { ...f.identity },
    source = { ...f.descriptor };
  f.file.slice = () => {
    throw Error('Caller slice must not be used');
  };
  const upload = driver(f, { identity, source });
  identity.adventureId = 'another-adventure-0001';
  source.sha256 = 'd'.repeat(64);
  expect(await upload.step()).toMatchObject({ kind: 'confirmed', index: 0 });
});
it('terminal/cancelling state pauses without appending and guard loss preserves any unacknowledged block', async () => {
  const f = await uploadHarness();
  await f.service.cancelAdventureRestore(f.uid, {
    restoreId: f.id,
    jobToken: f.identity.jobToken,
    operationId: 'upload-cancel-terminal-0001',
    expectedCheckpoint: 0,
  });
  expect(await driver(f).step()).toMatchObject({
    kind: 'paused',
    progress: { state: 'cancelling' },
  });
  expect(f.calls.filter((c) => c.name === 'append')).toHaveLength(0);
  const g = await uploadHarness();
  let active = true;
  const append = g.remote.append;
  g.remote.append = async (input) => {
    const r = await append(input);
    active = false;
    return r;
  };
  const upload = driver(g, {
    check: () => {
      if (!active) throw Error('Expired');
    },
  });
  await expect(upload.step()).rejects.toThrow('Expired');
  active = true;
  g.remote.append = append;
  expect(await upload.step()).toMatchObject({ kind: 'confirmed', index: 0 });
});
