import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  bookEditorialBackupRecords,
  verifyBookEditorialBackup,
} from '../services/bookEditorialBackupRecords';
import {
  BOOK_EDITORIAL_CAPTURE_FAMILIES,
  BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
  type BookEditorialCaptureApi,
  type BookEditorialCaptureFamily,
  type BookEditorialCaptureMetadata,
} from '../../../../functions/src/bookEditorialCaptureCatalog.mjs';
import type { BookEditorialArtifact } from '../../../../functions/src/bookEditorialProtocol.mjs';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const source = {
  schemaVersion: 1 as const,
  bookId: 'book',
  bookSourceToken: 'a'.repeat(64),
  editorialSourceToken: 'b'.repeat(64),
  coverage: 'saved-editorial-records-only' as const,
};
const artifact = (label = 'Conteúdo próprio'): BookEditorialArtifact => ({
  schemaVersion: 1,
  id: hash(label),
  kind: 'document',
  revision: null,
  createdAt: null,
  updatedAt: null,
  provenance: 'author',
  availability: { state: 'included' },
  content: {
    role: 'progress',
    title: 'História',
    sections: [{ label: 'Nota', text: label }],
    references: [],
  },
});
interface Row {
  id: string;
  family: BookEditorialCaptureFamily;
  body: unknown;
  alias?: boolean;
  hidden?: boolean;
}
function fixture() {
  const rows: Row[] = [
    { id: 'note', family: 'progress-current', body: { schemaVersion: 1, artifacts: [artifact()] } },
  ];
  const calls: Array<{ method: string; id?: string; family?: string }> = [];
  let inspectHook: (() => void) | undefined;
  function meta(row: Row): BookEditorialCaptureMetadata {
    const body = JSON.stringify(row.body),
      bundle = row.body as { artifacts: BookEditorialArtifact[] };
    return {
      ...source,
      family: row.family,
      id: row.id,
      itemToken: hash(row.id),
      state: row.alias ? 'current-alias' : 'artifact',
      artifactId: bundle.artifacts[0]!.id,
      projectionToken: hash(row.id + body),
      contentHash: hash(body),
      payload: 'editorial-bundle',
      recordCount: bundle.artifacts.length,
    };
  }
  const api: BookEditorialCaptureApi = {
    getSource: vi.fn<BookEditorialCaptureApi['getSource']>(() => Promise.resolve({ ...source })),
    catalog: vi.fn<BookEditorialCaptureApi['catalog']>((input) => {
      expect(Object.keys(input).sort()).toEqual([
        'bookId',
        'bookSourceToken',
        'editorialSourceToken',
      ]);
      return Promise.resolve({
        ...source,
        catalogVersion: 1 as const,
        catalogToken: 'c'.repeat(64),
        families: [...BOOK_EDITORIAL_CAPTURE_FAMILIES],
        fenceCoverage: BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
      });
    }),
    list: vi.fn<BookEditorialCaptureApi['list']>((input) => {
      calls.push({ method: 'list', family: input.family });
      const candidates = rows
        .filter((row) => row.family === input.family && (!input.cursor || row.id > input.cursor))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const selected = candidates.slice(0, input.limit),
        lastId = selected.at(-1)?.id ?? null;
      return Promise.resolve({
        ...source,
        family: input.family,
        items: selected
          .filter((row) => !row.hidden)
          .map((row) => ({ id: row.id, itemToken: hash(row.id) })),
        lastId,
        nextCursor: candidates.length > input.limit ? lastId : null,
      });
    }),
    read: vi.fn<BookEditorialCaptureApi['read']>((input) => {
      calls.push({ method: 'read', id: input.id });
      const row = rows.find((row) => row.family === input.family && row.id === input.id);
      if (!row) return Promise.reject(Error('missing'));
      const value = meta(row);
      if (row.alias) return Promise.resolve(value);
      const body = Buffer.from(JSON.stringify(row.body)),
        bytes = body.subarray(input.index * 65536, (input.index + 1) * 65536);
      return Promise.resolve({
        ...value,
        index: input.index,
        byteLength: body.length,
        chunkCount: Math.ceil(body.length / 65536),
        chunkHash: hash(bytes),
        chunkBase64: bytes.toString('base64'),
      });
    }),
    inspect: vi.fn<BookEditorialCaptureApi['inspect']>((input) => {
      inspectHook?.();
      calls.push({ method: 'inspect', id: input.id });
      return Promise.resolve(
        meta(rows.find((row) => row.family === input.family && row.id === input.id)!),
      );
    }),
    verify: vi.fn<BookEditorialCaptureApi['verify']>((input) =>
      Promise.resolve(
        meta(rows.find((row) => row.family === input.family && row.id === input.id)!),
      ),
    ),
    verifySource: vi.fn<BookEditorialCaptureApi['verifySource']>(() =>
      Promise.resolve({ ...source }),
    ),
  };
  const options = { api, expectedBookSourceToken: source.bookSourceToken };
  return {
    rows,
    api,
    calls,
    options,
    setInspectHook: (hook: () => void) => {
      inspectHook = hook;
    },
  };
}
async function collect(f: ReturnType<typeof fixture>) {
  const stream = bookEditorialBackupRecords('book', f.options),
    records = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { records, proof: next.value! };
    records.push(next.value);
  }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

it('unpacks native bundles and completes every family census before declaring editorial totals', async () => {
  const f = fixture(),
    result = await collect(f);
  expect(result.proof.census).toHaveLength(BOOK_EDITORIAL_CAPTURE_FAMILIES.length);
  expect(result.records.map((row) => row.kind)).toEqual([
    'book-editorial-artifact',
    'book-editorial',
  ]);
  expect(JSON.parse(new TextDecoder().decode(result.records.at(-1)!.payload))).toMatchObject({
    presence: 'captured',
    artifacts: 1,
    links: 0,
  });
  expect(f.calls.filter((call) => call.method === 'inspect')).toHaveLength(1);
});

it('skips alias bytes while retaining them in the complete native census', async () => {
  const f = fixture();
  f.rows.push({ ...f.rows[0]!, id: 'version', family: 'progress-version', alias: true });
  const result = await collect(f);
  expect(result.proof.artifacts).toBe(1);
  expect(result.proof.census.find((row) => row.family === 'progress-version')?.aliases).toBe(1);
  expect(result.records.filter((row) => row.kind === 'book-editorial-artifact')).toHaveLength(1);
});

it('preserves typed references as explicit portable links', async () => {
  const f = fixture(),
    value = artifact('Referência');
  if (value.kind !== 'document' || !value.content) throw Error('fixture');
  value.content.references.push({
    kind: 'chapter',
    id: 'chapter',
    parentId: null,
    scope: { kind: 'book', id: 'book' },
    revision: null,
    contentHash: null,
    state: 'unavailable',
    purpose: 'subject',
  });
  f.rows[0]!.body = { schemaVersion: 1, artifacts: [value] };
  const result = await collect(f);
  expect(result.proof.links).toBe(1);
  expect(
    JSON.parse(
      new TextDecoder().decode(
        result.records.find((row) => row.kind === 'book-editorial-link')!.payload,
      ),
    ),
  ).toMatchObject({ relation: 'references', to: { state: 'unavailable' } });
});

it('streams a large valid item in 64 KiB records without fetching the next native item early', async () => {
  const f = fixture();
  f.rows[0]!.body = { schemaVersion: 1, artifacts: [artifact('x'.repeat(150000))] };
  f.rows.push({
    id: 'second',
    family: 'progress-current',
    body: { schemaVersion: 1, artifacts: [artifact('Outro')] },
  });
  const stream = bookEditorialBackupRecords('book', f.options),
    first = await stream.next();
  expect(first.done).toBe(false);
  expect(first.value && 'payload' in first.value ? first.value.payload.length : 0).toBe(65536);
  expect(f.calls.some((call) => call.method === 'read' && call.id === 'second')).toBe(false);
  await stream.return(undefined);
});

it('rejects a corrupted chunk before yielding the item or editorial summary', async () => {
  const f = fixture(),
    read = f.api.read;
  f.api.read = async (input) => ({ ...(await read(input)), chunkHash: 'f'.repeat(64) });
  const stream = bookEditorialBackupRecords('book', f.options);
  await expect(stream.next()).rejects.toMatchObject({ code: 'invalid-record' });
});

it('detects changed projections in the second census and refuses the final summary', async () => {
  const f = fixture();
  f.setInspectHook(() => {
    f.rows[0]!.body = { schemaVersion: 1, artifacts: [artifact('Mudou')] };
  });
  const stream = bookEditorialBackupRecords('book', f.options);
  expect((await stream.next()).done).toBe(false);
  await expect(stream.next()).rejects.toMatchObject({ code: 'invalid-record' });
});

it('detects a new record in an initially empty family during final census', async () => {
  const f = fixture(),
    list = f.api.list;
  let passes = 0;
  f.api.list = async (input) => {
    if (input.family === BOOK_EDITORIAL_CAPTURE_FAMILIES[0] && ++passes === 2)
      f.rows.push({
        id: 'late',
        family: input.family,
        body: { schemaVersion: 1, artifacts: [artifact('Novo')] },
      });
    return list(input);
  };
  await expect(collect(f)).rejects.toMatchObject({ code: 'invalid-record' });
});

it('handles filtered empty pages without losing later owned records', async () => {
  const f = fixture();
  f.rows.length = 0;
  for (let index = 0; index < 50; index++)
    f.rows.push({
      id: 'a' + String(index).padStart(3, '0'),
      family: 'impact-current',
      body: { schemaVersion: 1, artifacts: [artifact()] },
      hidden: true,
    });
  f.rows.push({
    id: 'zowned',
    family: 'impact-current',
    body: { schemaVersion: 1, artifacts: [artifact('Próprio')] },
  });
  const result = await collect(f);
  expect(result.proof.artifacts).toBe(1);
  expect(result.proof.census.find((row) => row.family === 'impact-current')?.items).toBe(1);
});

it('rejects a catalog with missing families or incomplete writer coverage', async () => {
  const f = fixture(),
    catalog = f.api.catalog;
  f.api.catalog = async (input) => ({ ...(await catalog(input)), families: [] });
  await expect(collect(f)).rejects.toMatchObject({ code: 'invalid-record' });
  f.api.catalog = async (input) => ({
    ...(await catalog(input)),
    fenceCoverage: 'process-headers-partial',
  });
  await expect(collect(f)).rejects.toMatchObject({ code: 'invalid-record' });
});

it('guards the session after a pending native response and emits no stale body', async () => {
  const f = fixture();
  let current = true;
  const read = f.api.read;
  f.api.read = async (input) => {
    const result = await read(input);
    current = false;
    return result;
  };
  const stream = bookEditorialBackupRecords('book', { ...f.options, isCurrent: () => current });
  await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
});

it('supports a separate final recheck after the host has processed the other sections', async () => {
  const f = fixture(),
    result = await collect(f);
  await verifyBookEditorialBackup(result.proof, f.options);
  f.rows[0]!.body = { schemaVersion: 1, artifacts: [artifact('Mudança tardia')] };
  await expect(verifyBookEditorialBackup(result.proof, f.options)).rejects.toMatchObject({
    code: 'invalid-record',
  });
});

it('rejects duplicate IDs within a bundle and mismatched record counts', async () => {
  const f = fixture();
  f.rows[0]!.body = { schemaVersion: 1, artifacts: [artifact(), artifact()] };
  await expect(collect(f)).rejects.toMatchObject({ code: 'invalid-record' });
});
