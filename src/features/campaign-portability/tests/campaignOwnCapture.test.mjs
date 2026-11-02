// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { streamCampaignOwnData as stream, CampaignOwnCaptureError } from '../index';
import { createCampaignBackupOwnReadService } from '../../../../functions/src/campaignBackupOwnRead.mjs';
import {
  uid,
  op,
  fixture,
  richFixture,
  refresh,
  note,
  session,
  preparation,
  link,
} from '../../../../functions/test/helpers/campaignBackup.mjs';

const options = { guard: () => {} };
function attach(f, hooks = {}) {
  const own = createCampaignBackupOwnReadService({ db: f.db });
  f.calls = [];
  f.handlers = {
    getCampaignBackupSource: (data) => f.source.getCampaignBackupSource(uid, data),
    listCampaignBackupOwnInventory: (data) => f.api.listCampaignBackupOwnInventory(uid, data),
    readCampaignBackupOwnContent: (data) => own.readCampaignBackupOwnContent(uid, data),
  };
  f.port = {
    async call(method, input) {
      expect(Object.isFrozen(input)).toBe(true);
      f.calls.push({ method, input });
      if (hooks.before) await hooks.before(method, input, f);
      const result = await f.handlers[method](input);
      if (hooks.after) await hooks.after(method, input, result, f);
      return hooks.map ? hooks.map(method, input, result, f) : result;
    },
  };
  return f;
}
async function collect(iterator) {
  const records = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { records, proof: next.value };
    records.push(next.value);
  }
}
function units(records) {
  const rows = [];
  for (const record of records) {
    expect(Object.keys(record).sort()).toEqual(['id', 'index', 'kind', 'payload']);
    expect(record.payload).toBeInstanceOf(Uint8Array);
    expect(record.payload.length).toBeGreaterThan(0);
    expect(record.payload.length).toBeLessThanOrEqual(65536);
    const prior = rows.at(-1);
    if (prior && prior.kind === record.kind && prior.id === record.id) {
      expect(record.index).toBe(prior.parts.length);
      prior.parts.push(record.payload);
    } else {
      expect(record.index).toBe(0);
      rows.push({ kind: record.kind, id: record.id, parts: [record.payload] });
    }
  }
  return rows.map((row) => {
    const bytes = Buffer.concat(row.parts);
    return {
      ...row,
      bytes,
      dto: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)),
    };
  });
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const omitted = (raw, reason) =>
  Object.fromEntries([
    ...['schemaVersion', 'campaignId', 'sourceToken', 'kind', 'id', 'itemToken'].map((key) => [
      key,
      raw[key],
    ]),
    ['outcome', 'omitted'],
    ['reason', reason],
  ]);

it('streams the native rich campaign, verifies every family twice and returns only own-data proof', async () => {
  const f = attach(await richFixture()),
    before = structuredClone([...f.records]),
    result = await collect(stream(f.id, f.port, options)),
    all = units(result.records);
  expect(result.proof.validation).toBe('own-data-only');
  expect(result.proof.inventory.pages).toBe(9);
  expect(result.proof.inventory.items).toBe(11);
  expect(result.proof.content.units).toBe(13);
  expect(result.proof.content.chunks).toBe(result.records.length);
  expect(result.proof.content.payloadBytes).toBe(
    result.records.reduce((n, row) => n + row.payload.length, 0),
  );
  expect(result.proof.omitted).toEqual({ control: 2, deleted: 0, 'inactive-parent': 0 });
  expect(all.find((row) => row.kind === 'note').dto.data.content).toBe('PRIVATE OWN TEXT 🐉\n  ');
  expect(all.find((row) => row.kind === 'preparation-body').dto.data.body.text).toBe(
    'PRIVATE CLUE',
  );
  expect(all.find((row) => row.kind === 'session-reference').dto.data.target.sourceKey).toBe(
    f.sceneKey,
  );
  expect(all.some((row) => row.kind.endsWith('-state'))).toBe(false);
  expect(f.calls.filter((call) => call.method === 'getCampaignBackupSource')).toHaveLength(2);
  expect(f.calls.filter((call) => call.method === 'listCampaignBackupOwnInventory')).toHaveLength(
    18,
  );
  expect([...f.records]).toEqual(before);
  expect(Object.isFrozen(result.proof)).toBe(true);
  expect(Object.isFrozen(result.proof.inventory.counts)).toBe(true);
});

it('empty campaigns still traverse terminal pages and represent absent progress without side effects', async () => {
  const f = attach(await fixture()),
    before = structuredClone([...f.records]),
    result = await collect(stream(f.id, f.port, options)),
    all = units(result.records);
  expect(result.proof.inventory.pages).toBe(9);
  expect(result.proof.inventory.items).toBe(0);
  expect(result.proof.content.units).toBe(2);
  expect(all.map((row) => row.kind)).toEqual(['campaign', 'progress']);
  expect(all[1].dto.present).toBe(false);
  expect(all[1].dto.data).toEqual({});
  expect([...f.records]).toEqual(before);
});

it('many native notes paginate at the fixed page bound and all pages are replayed from the beginning', async () => {
  const f = await fixture();
  for (let n = 0; n < 61; n++) await note(f, 'paged-' + String(n).padStart(3, '0'));
  await refresh(f);
  attach(f);
  const result = await collect(stream(f.id, f.port, options));
  expect(result.proof.inventory.counts.note).toBe(61);
  expect(result.proof.inventory.pages).toBe(11);
  const pages = f.calls.filter(
    (call) => call.method === 'listCampaignBackupOwnInventory' && call.input.family === 'note',
  );
  expect(pages).toHaveLength(6);
  expect(pages[0].input.cursor).toBe(null);
  expect(pages[3].input.cursor).toBe(null);
  expect(pages.every((call) => call.input.limit === 25)).toBe(true);
  expect(units(result.records).filter((row) => row.kind === 'note')).toHaveLength(61);
});

it('each emitted part is bounded and the complete content manifest matches an independent digest', async () => {
  const f = await fixture(),
    id = op('stream-unicode'),
    text = '\ufeff  ' + '🐉é漢'.repeat(30000) + '\n  ';
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'Unicode',
    content: text,
  });
  await refresh(f);
  attach(f);
  const result = await collect(stream(f.id, f.port, options)),
    all = units(result.records),
    digest = createHash('sha256').update(
      JSON.stringify(['writer-campaign-own-content-v1', f.id]) + '\n',
    );
  for (const row of all)
    digest.update(
      JSON.stringify([
        'unit',
        row.kind,
        row.id,
        {
          byteLength: row.bytes.length,
          chunkCount: row.parts.length,
          contentHash: createHash('sha256').update(row.bytes).digest('hex'),
        },
      ]) + '\n',
    );
  expect(result.proof.content.digest).toBe(digest.digest('hex'));
  expect(all.find((row) => row.kind === 'note').dto.data.content).toBe(text);
  expect(all.find((row) => row.kind === 'note').parts.length).toBeGreaterThan(4);
});

it('backpressure performs no next RPC until consumption resumes, and early close returns no proof', async () => {
  const f = attach(await richFixture()),
    iterator = stream(f.id, f.port, options);
  expect(f.calls).toHaveLength(0);
  expect((await iterator.next()).value.kind).toBe('campaign');
  const calls = f.calls.length;
  await Promise.resolve();
  await Promise.resolve();
  expect(f.calls.length).toBe(calls);
  expect(calls).toBe(2);
  expect(await iterator.return()).toEqual({ done: true, value: undefined });
  await Promise.resolve();
  expect(f.calls.length).toBe(calls);
  expect(await iterator.next()).toEqual({ done: true, value: undefined });
});

it('closing before the first pull makes no RPC', async () => {
  const f = attach(await fixture()),
    iterator = stream(f.id, f.port, options);
  expect(await iterator.return()).toEqual({ done: true, value: undefined });
  expect(f.calls).toHaveLength(0);
});

it('abort during a suspended RPC settles the consumer and rejects late content without a proof', async () => {
  const entered = deferred(),
    release = deferred(),
    controller = new AbortController(),
    f = attach(await richFixture(), {
      after: async (method) => {
        if (method === 'readCampaignBackupOwnContent') {
          entered.resolve();
          await release.promise;
        }
      },
    }),
    iterator = stream(f.id, f.port, { ...options, signal: controller.signal }),
    pending = iterator.next();
  await entered.promise;
  controller.abort(new DOMException('Stop', 'AbortError'));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  release.resolve();
  await Promise.resolve();
  expect(f.calls.filter((call) => call.method === 'readCampaignBackupOwnContent')).toHaveLength(1);
  expect(await iterator.return()).toEqual({ done: true, value: undefined });
});

it('account guard runs after a suspended response and blocks adoption before the first chunk', async () => {
  const entered = deferred(),
    release = deferred();
  let current = true;
  const f = attach(await richFixture(), {
      after: async (method) => {
        if (method === 'readCampaignBackupOwnContent') {
          entered.resolve();
          await release.promise;
        }
      },
    }),
    iterator = stream(f.id, f.port, {
      guard: () => {
        if (!current) throw new Error('Account changed');
      },
    }),
    pending = iterator.next();
  await entered.promise;
  current = false;
  release.resolve();
  await expect(pending).rejects.toThrow('Account changed');
  expect(f.calls.filter((call) => call.method === 'readCampaignBackupOwnContent')).toHaveLength(1);
});

it('real S3 creation after the content pass invalidates full replay even with the same global source', async () => {
  let pages = 0,
    changed = false;
  const f = attach(await richFixture(), {
    before: async (method) => {
      if (method === 'listCampaignBackupOwnInventory' && ++pages === 10) {
        const previous = f.sourceToken;
        await link(f, 'late-link', f.sessionId, f.questId);
        await refresh(f);
        expect(f.sourceToken).toBe(previous);
        changed = true;
      }
    },
  });
  await expect(collect(stream(f.id, f.port, options))).rejects.toMatchObject({
    code: 'campaign-backup-inventory-changed',
  });
  expect(changed).toBe(true);
});

it('real S2 removal after content pass is detected by the replayed session and control proofs', async () => {
  let pages = 0;
  const f = attach(await richFixture(), {
    before: async (method) => {
      if (method === 'listCampaignBackupOwnInventory' && ++pages === 10) {
        const previous = f.sourceToken;
        await f.references.removeCampaignSessionReference(uid, {
          ...f.scope,
          sessionId: f.sessionId,
          expectedSessionRevision: 1,
          referenceId: f.referenceId,
          operationId: op('late-reference-remove'),
          expectedRevision: 1,
          expectedReferenceCollectionRevision: 1,
        });
        await refresh(f);
        expect(f.sourceToken).toBe(previous);
      }
    },
  });
  await expect(collect(stream(f.id, f.port, options))).rejects.toMatchObject({
    code: 'campaign-backup-inventory-changed',
  });
});

it('insertion behind a multi-page S3 cursor cannot disappear from the final replay', async () => {
  const f = await fixture(),
    sid = await session(f, 'behind-session'),
    ids = [];
  for (let n = 0; n < 27; n++)
    ids.push(await preparation(f, 'behind-item-' + String(n).padStart(2, '0')));
  for (let n = 0; n < 26; n++)
    await link(f, 'behind-link-' + String(n).padStart(2, '0'), sid, ids[n]);
  await refresh(f);
  let rounds = 0,
    changed = false;
  attach(f, {
    before: async (method, input) => {
      if (
        method === 'listCampaignBackupOwnInventory' &&
        input.family === 'note' &&
        ++rounds === 2
      ) {
        const previous = f.sourceToken;
        await link(f, 'AAA-behind-link', sid, ids[26]);
        await refresh(f);
        expect(f.sourceToken).toBe(previous);
        changed = true;
      }
    },
  });
  await expect(collect(stream(f.id, f.port, options))).rejects.toMatchObject({
    code: 'campaign-backup-inventory-changed',
  });
  expect(changed).toBe(true);
  expect(
    f.calls.some(
      (call) =>
        call.method === 'listCampaignBackupOwnInventory' &&
        call.input.family === 'session-preparation-link' &&
        call.input.cursor !== null,
    ),
  ).toBe(true);
});

it('final source recheck blocks a last-moment own text change after both inventory passes', async () => {
  let anchors = 0;
  const f = attach(await richFixture(), {
    before: async (method) => {
      if (method === 'getCampaignBackupSource' && ++anchors === 2) {
        await f.notes.saveCampaignNote(uid, {
          ...f.scope,
          noteId: f.noteId,
          operationId: op('last-own-edit'),
          expectedRevision: 1,
          title: 'Changed',
          content: 'NEW OWN TEXT',
        });
      }
    },
  });
  await expect(collect(stream(f.id, f.port, options))).rejects.toMatchObject({
    details: { reason: 'campaign-backup-source-changed' },
  });
});

it('deleted parents produce only explicit omissions while active own item text remains in the stream', async () => {
  const f = await richFixture();
  await f.sessions.deleteCampaignSession(uid, {
    ...f.scope,
    sessionId: f.sessionId,
    operationId: op('deleted-session'),
    expectedRevision: 1,
  });
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + f.adventureId)));
  await refresh(f);
  attach(f);
  const result = await collect(stream(f.id, f.port, options)),
    all = units(result.records);
  expect(result.proof.omitted).toEqual({ control: 2, deleted: 1, 'inactive-parent': 2 });
  expect(
    all.some((row) =>
      ['session', 'session-reference', 'session-preparation-link'].includes(row.kind),
    ),
  ).toBe(false);
  expect(all.find((row) => row.kind === 'preparation-body').dto.data.body.text).toBe(
    'PRIVATE CLUE',
  );
});

it('corrupted, cross-scope or noncanonical chunk responses never produce a capture proof', async () => {
  const patches = [
    (raw) => ({ ...raw, sourceToken: 'f'.repeat(64) }),
    (raw) => ({ ...raw, id: 'foreign' }),
    (raw) => ({ ...raw, itemToken: 'f'.repeat(64) }),
    (raw) => ({ ...raw, kind: 'note' }),
    (raw) => ({ ...raw, index: 1 }),
    (raw) => ({ ...raw, byteLength: 0 }),
    (raw) => ({ ...raw, chunkCount: 2 }),
    (raw) => ({ ...raw, contentHash: 'f'.repeat(64) }),
    (raw) => ({ ...raw, chunkBase64: '!!!!' }),
    (raw) => ({ ...raw, chunkBase64: raw.chunkBase64 + '=' }),
    (raw) => ({ ...raw, extra: 'not allowed' }),
    (raw) => omitted(raw, 'deleted'),
    (raw) => {
      const bytes = Buffer.from(raw.chunkBase64, 'base64');
      bytes[0] ^= 1;
      return { ...raw, chunkBase64: bytes.toString('base64') };
    },
  ];
  for (const patch of patches) {
    const f = attach(await fixture(), {
      map: (method, _input, raw) => (method === 'readCampaignBackupOwnContent' ? patch(raw) : raw),
    });
    await expect(collect(stream(f.id, f.port, options))).rejects.toBeInstanceOf(
      CampaignOwnCaptureError,
    );
  }
});

it('impossible omitted body/checklist records and corrupted inventory responses are rejected', async () => {
  for (const kind of ['checklist', 'preparation-body']) {
    const f = attach(await richFixture(), {
      map: (method, input, raw) =>
        method === 'readCampaignBackupOwnContent' && input.kind === kind
          ? omitted(raw, 'deleted')
          : raw,
    });
    await expect(collect(stream(f.id, f.port, options))).rejects.toBeInstanceOf(
      CampaignOwnCaptureError,
    );
  }
  for (const patch of [
    (raw) => ({ ...raw, family: 'session' }),
    (raw) => ({ ...raw, pageToken: 'bad' }),
    (raw) => ({ ...raw, sourceToken: 'f'.repeat(64) }),
    (raw) => ({ ...raw, items: [raw.items[0], raw.items[0]] }),
    (raw) => ({ ...raw, nextCursor: 'invalid' }),
    (raw) => ({ ...raw, extra: true }),
  ]) {
    const f = attach(await richFixture(), {
      map: (method, input, raw) =>
        method === 'listCampaignBackupOwnInventory' && input.family === 'note' ? patch(raw) : raw,
    });
    await expect(collect(stream(f.id, f.port, options))).rejects.toBeInstanceOf(
      CampaignOwnCaptureError,
    );
  }
});

it('full-page cursor tampering is rejected before accepting the next page', async () => {
  const f = await fixture();
  for (let n = 0; n < 26; n++) await note(f, 'cursor-' + String(n).padStart(2, '0'));
  await refresh(f);
  attach(f, {
    map: (method, input, raw) => {
      if (
        method !== 'listCampaignBackupOwnInventory' ||
        input.family !== 'note' ||
        raw.nextCursor === null
      )
        return raw;
      const parsed = JSON.parse(Buffer.from(raw.nextCursor, 'base64url').toString());
      parsed.after = 'foreign';
      return { ...raw, nextCursor: Buffer.from(JSON.stringify(parsed)).toString('base64url') };
    },
  });
  await expect(collect(stream(f.id, f.port, options))).rejects.toBeInstanceOf(
    CampaignOwnCaptureError,
  );
  expect(
    f.calls.filter(
      (call) => call.method === 'listCampaignBackupOwnInventory' && call.input.family === 'note',
    ),
  ).toHaveLength(1);
});

it('caller mutations cannot replace the captured API, source, guard or a detached pending page', async () => {
  const f = await fixture(),
    firstId = await note(f, 'frozen-a'),
    secondId = await note(f, 'frozen-b');
  await refresh(f);
  let pendingPage;
  attach(f, {
    after: (method, input, raw) => {
      if (method === 'listCampaignBackupOwnInventory' && input.family === 'note' && !pendingPage)
        pendingPage = raw;
    },
  });
  const anchor = { schemaVersion: 1, campaignId: f.id, sourceToken: f.sourceToken },
    capturedOptions = { guard: () => {}, source: anchor },
    iterator = stream(f.id, f.port, capturedOptions),
    records = [];
  anchor.sourceToken = 'f'.repeat(64);
  capturedOptions.guard = () => {
    throw new Error('Replacement guard must not be used');
  };
  f.port.call = () => {
    throw new Error('Replacement API must not be used');
  };
  for (;;) {
    const next = await iterator.next();
    if (next.done) {
      expect(next.value.validation).toBe('own-data-only');
      break;
    }
    records.push(next.value);
    if (next.value.kind === 'note' && next.value.id === firstId)
      pendingPage.items[1].id = 'foreign';
  }
  expect(
    units(records)
      .filter((row) => row.kind === 'note')
      .map((row) => row.id),
  ).toEqual([firstId, secondId]);
});

it('invalid source, ID and missing guards fail before any API call', () => {
  let calls = 0;
  const api = {
    call: async () => {
      calls++;
      return null;
    },
  };
  for (const id of ['', '..', 'bad/id', 'x'.repeat(1501), '\ud800'])
    expect(() => stream(id, api, options)).toThrow(CampaignOwnCaptureError);
  expect(() => stream(op('campaign'), api, {})).toThrow(CampaignOwnCaptureError);
  expect(() =>
    stream(op('campaign'), api, {
      ...options,
      source: {
        schemaVersion: 1,
        campaignId: 'other',
        sourceToken: 'a'.repeat(64),
      },
    }),
  ).toThrow(CampaignOwnCaptureError);
  expect(calls).toBe(0);
});

it('closing during a suspended RPC cancels the pending consumer and never adopts the late response', async () => {
  const entered = deferred(),
    release = deferred(),
    f = attach(await richFixture(), {
      after: async (method) => {
        if (method === 'readCampaignBackupOwnContent') {
          entered.resolve();
          await release.promise;
        }
      },
    }),
    iterator = stream(f.id, f.port, options),
    pending = iterator.next();
  await entered.promise;
  expect(await iterator.return()).toEqual({ done: true, value: undefined });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  release.resolve();
  await Promise.resolve();
  expect(f.calls.filter((call) => call.method === 'readCampaignBackupOwnContent')).toHaveLength(1);
});

it('changed manifests, borrowed tokens or omission after the first chunk reject the entire capture', async () => {
  for (const patch of [
    (raw) => ({ ...raw, byteLength: raw.byteLength + 1 }),
    (raw) => ({ ...raw, itemToken: 'f'.repeat(64) }),
    (raw) => omitted(raw, 'deleted'),
  ]) {
    const f = await fixture(),
      id = op('changing-manifest');
    await f.notes.saveCampaignNote(uid, {
      ...f.scope,
      noteId: id,
      operationId: id,
      expectedRevision: 0,
      title: 'Long',
      content: 'x'.repeat(150000),
    });
    await refresh(f);
    attach(f, {
      map: (method, input, raw) =>
        method === 'readCampaignBackupOwnContent' && input.kind === 'note' && input.index === 1
          ? patch(raw)
          : raw,
    });
    await expect(collect(stream(f.id, f.port, options))).rejects.toBeInstanceOf(
      CampaignOwnCaptureError,
    );
  }
});

it('permitted expanded S3 bodies stream above two MiB with bounded parts and no project buffer', async () => {
  const f = await fixture(),
    id = op('expanded-stream'),
    text = '\u0001'.repeat(150000);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: id,
    operationId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'Expanded',
    status: 'pending',
    body: { text, condition: text, recipient: text },
  });
  await refresh(f);
  attach(f);
  const iterator = stream(f.id, f.port, options);
  let bytes = 0,
    bodyParts = 0,
    proof;
  for (;;) {
    const next = await iterator.next();
    if (next.done) {
      proof = next.value;
      break;
    }
    expect(next.value.payload.length).toBeLessThanOrEqual(65536);
    bytes += next.value.payload.length;
    if (next.value.kind === 'preparation-body') bodyParts++;
  }
  expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
  expect(bodyParts).toBeGreaterThan(32);
  expect(proof.validation).toBe('own-data-only');
  expect(proof.content.payloadBytes).toBe(bytes);
});
