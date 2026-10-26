import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PERSONAS } from '../../../../functions/src/personaProfile.mjs';
import {
  encodeBookBackupDraftPersona,
  type BookDraftApi,
} from '../../../../functions/src/bookBackupDraft.mjs';
import {
  bookDraftBackupRecords,
  verifyBookBackupDraft,
  type BookDraftInput,
  type BookDraftProof,
  type BookBackupRecord,
} from '../index';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function fixture(persona = true) {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) };
  const profile = encodeBookBackupDraftPersona({
    ...structuredClone(DEFAULT_PERSONAS[0]!),
    id: 'custom-draft',
    archived: true,
  }).profile;
  const state = { token: 'b'.repeat(64), profile, profileHash: hash(JSON.stringify(profile)) };
  const api: BookDraftApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    persona: vi.fn((input: Parameters<BookDraftApi['persona']>[0]) =>
      Promise.resolve({
        ...anchor,
        personaId: input.personaId,
        personaToken: state.token,
        profileHash: state.profileHash,
        profile: structuredClone(state.profile),
      }),
    ),
  };
  const input: BookDraftInput = {
    chapter: {
      id: 'removed-chapter',
      bookId: 'book',
      title: 'Open chapter',
      order: 3,
      actId: 'removed-act',
      createdAt: 12,
      updatedAt: 34,
      ...(persona
        ? {
            personaComplement: {
              personaId: 'custom-draft',
              overrides: [{ traitId: 'sensory', value: 27 }],
            },
          }
        : {}),
    },
    content: '\ufeff<p>Own unsaved prose 🌙</p>',
  };
  return { anchor, state, api, input };
}
async function drain(stream: ReturnType<typeof bookDraftBackupRecords>) {
  const records: BookBackupRecord[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { records, proof: next.value! };
    records.push(next.value);
  }
}
function header(records: BookBackupRecord[]): Record<string, unknown> {
  return JSON.parse(
    Buffer.concat(
      records.filter((r) => r.kind === 'book-draft').map((r) => Buffer.from(r.payload)),
    ).toString('utf8'),
  ) as Record<string, unknown>;
}
function body(records: BookBackupRecord[]) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Buffer.concat(
      records.filter((r) => r.kind === 'book-draft-text').map((r) => Buffer.from(r.payload)),
    ),
  );
}
it('freezes local prose/metadata/complement before first next and includes only its authorized style', async () => {
  const f = fixture(),
    original = f.input.content,
    stream = bookDraftBackupRecords('book', f.input, { api: f.api });
  expect(f.api.getSource).not.toHaveBeenCalled();
  f.input.content = 'Changed while backup starts';
  f.input.chapter.title = 'Changed title';
  f.input.chapter.personaComplement!.overrides[0]!.value = 99;
  const result = await drain(stream),
    meta = header(result.records);
  expect(body(result.records)).toBe(original);
  expect(meta.state).toBe('present');
  expect(meta.chapter).toMatchObject({
    id: 'removed-chapter',
    title: 'Open chapter',
    actId: 'removed-act',
    createdAt: 12,
    updatedAt: 34,
    personaComplement: {
      personaId: 'custom-draft',
      overrides: [{ traitId: 'sensory', value: 27 }],
    },
  });
  expect(meta.persona).toMatchObject({ id: 'custom-draft', archived: true });
  expect(JSON.stringify(meta)).not.toContain(f.state.token);
  expect(JSON.stringify(meta)).not.toContain(f.anchor.sourceToken);
  expect(result.proof.contentHash).toBe(hash(original));
  await verifyBookBackupDraft(result.proof, { api: f.api });
  expect(f.api.persona).toHaveBeenLastCalledWith({
    bookId: 'book',
    sourceToken: f.anchor.sourceToken,
    personaId: 'custom-draft',
    expectedPersonaToken: f.state.token,
  });
});
it('absent contribution differs from explicitly empty removed chapter', async () => {
  const f = fixture(false),
    absent = await drain(bookDraftBackupRecords('book', null, { api: f.api }));
  expect(header(absent.records)).toEqual({ schemaVersion: 1, state: 'none' });
  expect(absent.records).toHaveLength(1);
  expect(absent.proof).toMatchObject({
    state: 'none',
    byteLength: 0,
    chunkCount: 0,
    chapterId: null,
  });
  f.input.content = '';
  const empty = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  expect(header(empty.records)).toMatchObject({
    state: 'present',
    byteLength: 0,
    chunkCount: 1,
    contentHash: hash(''),
  });
  expect(empty.records.filter((r) => r.kind === 'book-draft-text')).toMatchObject([
    { id: 'removed-chapter', part: 0, payload: new Uint8Array(0) },
  ]);
  expect(f.api.persona).not.toHaveBeenCalled();
});
it('Unicode/BOM/NUL are exact across byte boundaries and each emitted text part is independent UTF-8', async () => {
  const f = fixture(false);
  f.input.content = 'a'.repeat(65535) + '🌙\ufeff\u0000' + '界'.repeat(44000);
  const result = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  expect(body(result.records)).toBe(f.input.content);
  for (const part of result.records.filter((r) => r.kind === 'book-draft-text')) {
    expect(part.payload.byteLength).toBeLessThanOrEqual(65536);
    expect(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(part.payload),
    ).not.toContain('\ufffd');
  }
  expect(result.proof.contentHash).toBe(hash(f.input.content));
  expect(result.proof.byteLength).toBe(Buffer.byteLength(f.input.content));
});
it('20 MiB draft uses bounded encodeInto and incremental hash without retaining parts or encoding whole prose', async () => {
  const f = fixture(false),
    digest = createHash('sha256'),
    text = 'a'.repeat(20 * 1024 * 1024);
  f.input.content = text;
  const encode = vi.spyOn(TextEncoder.prototype, 'encode'),
    into = vi.spyOn(TextEncoder.prototype, 'encodeInto');
  const stream = bookDraftBackupRecords('book', f.input, { api: f.api });
  let proof: BookDraftProof | undefined,
    count = 0,
    bytes = 0;
  try {
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        proof = next.value;
        break;
      }
      if (next.value.kind === 'book-draft-text') {
        digest.update(next.value.payload);
        count++;
        bytes += next.value.payload.byteLength;
      }
    }
    expect(count).toBe(320);
    expect(bytes).toBe(text.length);
    expect(proof?.contentHash).toBe(digest.digest('hex'));
    expect(encode.mock.calls.some(([value]) => value === text)).toBe(false);
    expect(
      into.mock.calls.every(
        ([value, destination]) => value.length <= 65536 && destination.byteLength === 65536,
      ),
    ).toBe(true);
  } finally {
    encode.mockRestore();
    into.mockRestore();
  }
});
it.each(['\ud800', 'text\udfff'] as const)(
  'unpaired surrogate rejects before any header: %j',
  async (text) => {
    const f = fixture(false);
    f.input.content = text;
    await expect(bookDraftBackupRecords('book', f.input, { api: f.api }).next()).rejects.toThrow(
      'rascunho explícito',
    );
  },
);
it('metadata extras/undefined optionals are omitted and large valid metadata is emitted in bounded parts', async () => {
  const f = fixture(false);
  f.input.chapter.title = 'Title '.repeat(20000);
  Object.assign(f.input.chapter, {
    apiKey: 'DO NOT COPY',
    coverUrl: 'DO NOT COPY',
    actId: undefined,
    personaComplement: undefined,
  });
  const result = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  expect(result.records.filter((r) => r.kind === 'book-draft').length).toBeGreaterThan(1);
  expect(result.records.every((r) => r.payload.length <= 65536)).toBe(true);
  expect(JSON.stringify(header(result.records))).not.toContain('DO NOT COPY');
  expect(header(result.records).chapter).not.toHaveProperty('actId');
  expect(header(result.records).chapter).not.toHaveProperty('personaComplement');
});
it('wrong book, composed chapter and malformed local input fail synchronously before I/O', () => {
  const f = fixture();
  for (const changes of [
    { bookId: 'other' },
    { contentMode: 'scenes' },
    { id: '../x' },
    { order: NaN },
    { createdAt: undefined },
    {
      personaComplement: {
        personaId: 'custom-draft',
        overrides: [{ traitId: 'sensory', value: 101 }],
      },
    },
  ]) {
    expect(() =>
      bookDraftBackupRecords(
        'book',
        { ...f.input, chapter: { ...f.input.chapter, ...changes } as BookDraftInput['chapter'] },
        { api: f.api },
      ),
    ).toThrow();
  }
  expect(f.api.getSource).not.toHaveBeenCalled();
});
it('profile hash/private-field corruption rejects before header and changed profile/root invalidates final proof', async () => {
  for (const issue of ['hash', 'extra']) {
    const f = fixture();
    if (issue === 'hash') f.state.profileHash = '0'.repeat(64);
    else f.state.profile.apiKey = 'DO NOT COPY';
    await expect(bookDraftBackupRecords('book', f.input, { api: f.api }).next()).rejects.toThrow(
      'rascunho explícito',
    );
  }
  const f = fixture(),
    result = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  f.state.token = 'c'.repeat(64);
  await expect(verifyBookBackupDraft(result.proof, { api: f.api })).rejects.toThrow(
    'rascunho explícito',
  );
  f.anchor.sourceToken = 'd'.repeat(64);
  await expect(verifyBookBackupDraft(result.proof, { api: f.api })).rejects.toThrow();
});
it('backpressure, context switch and early return never provide successful proof or another profile read', async () => {
  const f = fixture(),
    stream = bookDraftBackupRecords('book', f.input, { api: f.api });
  const first = await stream.next();
  expect(first.done).toBe(false);
  expect(f.api.persona).toHaveBeenCalledTimes(1);
  expect((await stream.return(undefined)).value).toBeUndefined();
  expect((await stream.next()).done).toBe(true);
  let current = true;
  const switched = bookDraftBackupRecords('book', f.input, {
    api: f.api,
    isCurrent: () => current,
  });
  await switched.next();
  current = false;
  await expect(switched.next()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.persona).toHaveBeenCalledTimes(2);
});
it('abort can interrupt manifest pass before header and an aborted start performs no reads', async () => {
  const f = fixture(false),
    controller = new AbortController();
  controller.abort();
  expect(() =>
    bookDraftBackupRecords('book', f.input, { api: f.api, signal: controller.signal }),
  ).toThrow();
  expect(f.api.getSource).not.toHaveBeenCalled();
  const hashing = new AbortController();
  f.input.content = 'a'.repeat(2 * 1024 * 1024);
  const stream = bookDraftBackupRecords('book', f.input, { api: f.api, signal: hashing.signal });
  const timeout = setTimeout(() => hashing.abort(), 0);
  try {
    await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    clearTimeout(timeout);
  }
});
it('transport error propagates once and malformed proof is rejected before remote I/O', async () => {
  const f = fixture(),
    error = new Error('lost response');
  vi.mocked(f.api.persona).mockRejectedValueOnce(error);
  await expect(bookDraftBackupRecords('book', f.input, { api: f.api }).next()).rejects.toBe(error);
  expect(f.api.persona).toHaveBeenCalledTimes(1);
  const result = await drain(bookDraftBackupRecords('book', null, { api: f.api }));
  const calls = vi.mocked(f.api.getSource).mock.calls.length;
  await expect(
    verifyBookBackupDraft({ ...result.proof, chunkCount: 1 }, { api: f.api }),
  ).rejects.toThrow('rascunho explícito');
  expect(f.api.getSource).toHaveBeenCalledTimes(calls);
});

it('explicit unavailable draft keeps its neutral style and frozen marker without consulting a matching library profile', async () => {
  const f = fixture();
  f.input.chapter.personaAvailability = {
    schemaVersion: 1,
    personaId: 'custom-draft',
    reason: 'profile-not-recorded',
  };
  const stream = bookDraftBackupRecords('book', f.input, { api: f.api });
  f.input.chapter.personaAvailability.reason = 'legacy-overrides';
  const result = await drain(stream),
    meta = header(result.records);
  expect(meta).toMatchObject({
    persona: null,
    chapter: {
      personaAvailability: {
        schemaVersion: 1,
        personaId: 'custom-draft',
        reason: 'profile-not-recorded',
      },
      personaComplement: {
        personaId: 'custom-draft',
        overrides: [{ traitId: 'sensory', value: 27 }],
      },
    },
  });
  expect(body(result.records)).toBe(f.input.content);
  expect(result.proof.persona).toBeNull();
  await verifyBookBackupDraft(result.proof, { api: f.api });
  expect(f.api.persona).not.toHaveBeenCalled();
  f.anchor.sourceToken = 'd'.repeat(64);
  await expect(verifyBookBackupDraft(result.proof, { api: f.api })).rejects.toThrow();
});
it('explicit old overrides retain an authorized snapshot and normal final persona revalidation', async () => {
  const f = fixture();
  f.input.chapter.personaAvailability = {
    schemaVersion: 1,
    personaId: 'custom-draft',
    reason: 'legacy-overrides',
  };
  f.input.chapter.personaComplement!.overrides = [{ traitId: 'old-trait', value: 77 }];
  const result = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  expect(header(result.records)).toMatchObject({
    persona: f.state.profile,
    chapter: {
      personaAvailability: { reason: 'legacy-overrides' },
      personaComplement: { overrides: [{ traitId: 'old-trait', value: 77 }] },
    },
  });
  await verifyBookBackupDraft(result.proof, { api: f.api });
  expect(f.api.persona).toHaveBeenCalledTimes(2);
  f.state.token = 'c'.repeat(64);
  await expect(verifyBookBackupDraft(result.proof, { api: f.api })).rejects.toThrow();
});
it('changing the draft binding omits stale absence metadata and still captures the chosen profile', async () => {
  const f = fixture();
  f.input.chapter.personaAvailability = {
    schemaVersion: 1,
    personaId: 'custom-old',
    reason: 'profile-not-recorded',
  };
  const result = await drain(bookDraftBackupRecords('book', f.input, { api: f.api }));
  expect(header(result.records).chapter).not.toHaveProperty('personaAvailability');
  expect(header(result.records).persona).toEqual(f.state.profile);
  expect(f.api.persona).toHaveBeenCalledTimes(1);
});
it('malformed absence fails synchronously and an unmarked unavailable profile still propagates its failure', async () => {
  const f = fixture();
  Object.assign(f.input.chapter, {
    personaAvailability: {
      schemaVersion: 1,
      personaId: 'custom-draft',
      reason: 'profile-not-recorded',
      key: 'DO NOT COPY',
    },
  });
  expect(() => bookDraftBackupRecords('book', f.input, { api: f.api })).toThrow();
  expect(f.api.getSource).not.toHaveBeenCalled();
  delete f.input.chapter.personaAvailability;
  const error = new Error('Profile unavailable');
  vi.mocked(f.api.persona).mockRejectedValueOnce(error);
  await expect(bookDraftBackupRecords('book', f.input, { api: f.api }).next()).rejects.toBe(error);
});
