import {
  BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION,
  BOOK_EDITORIAL_CAPTURE_FAMILIES,
  BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
  BOOK_EDITORIAL_CAPTURE_LIMITS as limits,
  type BookEditorialCaptureApi,
  type BookEditorialCaptureFamily,
  type BookEditorialCaptureSource,
  type BookEditorialCaptureMetadata,
  type BookEditorialCaptureItem,
  type BookEditorialCapturePart,
} from '../../../../functions/src/bookEditorialCaptureCatalog.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialLink,
  normalizeBookEditorialControl,
  bookEditorialArtifactReferences,
  type BookEditorialArtifact,
} from '../../../../functions/src/bookEditorialProtocol.mjs';
import { encodeBookBackupJSON } from '../../../../functions/src/bookBackupStructure.mjs';
import { BookBackupFormatError, type BookBackupRecord } from '../model/backupContainer';
import {
  closed,
  validId,
  validHash,
  validCount,
  compareIds,
  hash,
  textHash,
} from './bookSnapshotCapture';
export interface BookEditorialFamilyProof {
  family: BookEditorialCaptureFamily;
  items: number;
  aliases: number;
  artifacts: number;
  links: number;
  digest: string;
}
export interface BookEditorialBackupProof {
  source: BookEditorialCaptureSource;
  catalogToken: string;
  census: readonly BookEditorialFamilyProof[];
  artifacts: number;
  links: number;
}
export interface BookEditorialBackupOptions {
  api: BookEditorialCaptureApi;
  expectedBookSourceToken: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}
const sourceKeys = [
  'schemaVersion',
  'bookId',
  'bookSourceToken',
  'editorialSourceToken',
  'coverage',
];
const metadataKeys = [
  ...sourceKeys,
  'family',
  'id',
  'itemToken',
  'state',
  'artifactId',
  'projectionToken',
  'contentHash',
  'payload',
  'recordCount',
];
function invalid(): never {
  throw new BookBackupFormatError(
    'invalid-record',
    'Não foi possível conferir todos os registros editoriais do backup.',
  );
}
function anchor(raw: unknown, bookId: string, expected: string): BookEditorialCaptureSource {
  if (
    !closed(raw, sourceKeys) ||
    raw.schemaVersion !== 1 ||
    raw.bookId !== bookId ||
    raw.bookSourceToken !== expected ||
    !validHash(raw.bookSourceToken) ||
    !validHash(raw.editorialSourceToken) ||
    raw.coverage !== 'saved-editorial-records-only'
  )
    invalid();
  return Object.freeze({
    schemaVersion: 1,
    bookId,
    bookSourceToken: raw.bookSourceToken,
    editorialSourceToken: raw.editorialSourceToken,
    coverage: raw.coverage,
  });
}
const wire = (source: BookEditorialCaptureSource) => ({
  bookId: source.bookId,
  bookSourceToken: source.bookSourceToken,
  editorialSourceToken: source.editorialSourceToken,
});
function same(raw: BookEditorialCaptureSource, source: BookEditorialCaptureSource) {
  for (const key of sourceKeys as (keyof BookEditorialCaptureSource)[])
    if (raw[key] !== source[key]) invalid();
}
function metadata(
  raw: BookEditorialCaptureMetadata,
  source: BookEditorialCaptureSource,
  family: BookEditorialCaptureFamily,
  item: BookEditorialCaptureItem,
) {
  same(raw, source);
  if (
    raw.family !== family ||
    raw.id !== item.id ||
    raw.itemToken !== item.itemToken ||
    !['artifact', 'current-alias'].includes(raw.state) ||
    !validHash(raw.artifactId) ||
    !validHash(raw.projectionToken) ||
    !validHash(raw.contentHash) ||
    !['editorial-artifact', 'editorial-bundle'].includes(raw.payload) ||
    !validCount(raw.recordCount) ||
    raw.recordCount < 1 ||
    raw.recordCount > 512 ||
    (raw.payload === 'editorial-artifact' && raw.recordCount !== 1)
  )
    invalid();
  return Object.fromEntries(
    metadataKeys.map((key) => [key, raw[key as keyof BookEditorialCaptureMetadata]]),
  );
}
/** One item buffer, one page and constant-size family digests; no project-sized body or ID cache. */
function createEditorialCapture(bookId: string, options: BookEditorialBackupOptions) {
  const settings = { ...options, api: { ...options.api } };
  function check() {
    settings.signal?.throwIfAborted();
    if (settings.isCurrent && !settings.isCurrent())
      throw new DOMException('Captura editorial encerrada.', 'AbortError');
  }
  check();
  if (!validId(bookId) || !validHash(settings.expectedBookSourceToken)) invalid();
  for (const method of [
    'getSource',
    'catalog',
    'list',
    'read',
    'inspect',
    'verify',
    'verifySource',
  ] as const)
    if (typeof settings.api[method] !== 'function') invalid();
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    check();
    const result = await run();
    check();
    return result;
  };
  async function* records(): AsyncGenerator<
    BookBackupRecord,
    BookEditorialBackupProof | undefined,
    void
  > {
    const source = anchor(
      await guard(() =>
        settings.api.getSource({
          bookId,
          expectedBookSourceToken: settings.expectedBookSourceToken,
        }),
      ),
      bookId,
      settings.expectedBookSourceToken,
    );
    const catalog = await guard(() => settings.api.catalog(wire(source)));
    same(catalog, source);
    if (
      !closed(catalog, [
        ...sourceKeys,
        'catalogVersion',
        'catalogToken',
        'families',
        'fenceCoverage',
      ]) ||
      catalog.catalogVersion !== BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION ||
      !validHash(catalog.catalogToken) ||
      catalog.fenceCoverage !== BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE ||
      !Array.isArray(catalog.families) ||
      JSON.stringify(catalog.families) !== JSON.stringify(BOOK_EDITORIAL_CAPTURE_FAMILIES)
    )
      invalid();
    const census: BookEditorialFamilyProof[] = [];
    let artifacts = 0,
      links = 0;
    for (const family of catalog.families) {
      const proof = yield* familyRecords(source, family, true);
      census.push(proof);
      artifacts += proof.artifacts;
      links += proof.links;
      if (!validCount(artifacts) || !validCount(links)) invalid();
    }
    const proof: BookEditorialBackupProof = Object.freeze({
      source,
      catalogToken: catalog.catalogToken,
      census: Object.freeze(census.map((value) => Object.freeze({ ...value }))),
      artifacts,
      links,
    });
    await verify(proof);
    const control = normalizeBookEditorialControl({
      schemaVersion: 1,
      bookId,
      presence: 'captured',
      artifacts,
      links,
    });
    yield* split('book-editorial', bookId, encodeBookBackupJSON(control).bytes);
    check();
    return proof;
  }
  function* split(
    kind: string,
    id: string,
    bytes: Uint8Array,
  ): Generator<BookBackupRecord, void, void> {
    for (let offset = 0, part = 0; offset < bytes.length; offset += limits.partBytes, part++) {
      check();
      yield { kind, id, part, payload: bytes.slice(offset, offset + limits.partBytes) };
      check();
    }
  }
  async function item(
    source: BookEditorialCaptureSource,
    family: BookEditorialCaptureFamily,
    listed: BookEditorialCaptureItem,
  ) {
    const request = { ...wire(source), family, ...listed },
      first = await guard(() => settings.api.read({ ...request, index: 0 }));
    const meta = metadata(first, source, family, listed);
    if (first.state === 'current-alias') {
      if (!closed(first, metadataKeys)) invalid();
      return { first, meta, body: null };
    }
    if (
      !closed(first, [
        ...metadataKeys,
        'index',
        'byteLength',
        'chunkCount',
        'chunkHash',
        'chunkBase64',
      ]) ||
      !validCount(first.byteLength) ||
      first.byteLength < 1 ||
      first.byteLength > limits.itemBytes ||
      first.chunkCount !== Math.ceil(first.byteLength / limits.partBytes)
    )
      invalid();
    const length = first.byteLength,
      body = new Uint8Array(length);
    for (let index = 0; index < (first.chunkCount ?? 0); index++) {
      const part: BookEditorialCapturePart =
        index === 0
          ? first
          : await guard(() =>
              settings.api.read({ ...request, index, projectionToken: first.projectionToken }),
            );
      if (
        !closed(part, [
          ...metadataKeys,
          'index',
          'byteLength',
          'chunkCount',
          'chunkHash',
          'chunkBase64',
        ]) ||
        JSON.stringify(metadata(part, source, family, listed)) !== JSON.stringify(meta) ||
        part.index !== index ||
        part.byteLength !== length ||
        part.chunkCount !== first.chunkCount ||
        !validHash(part.chunkHash) ||
        typeof part.chunkBase64 !== 'string' ||
        part.chunkBase64.length > 4 * Math.ceil(limits.partBytes / 3) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.chunkBase64)
      )
        invalid();
      const binary = atob(part.chunkBase64);
      if (btoa(binary) !== part.chunkBase64) invalid();
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (
        bytes.length !== Math.min(limits.partBytes, length - index * limits.partBytes) ||
        (await guard(() => hash(bytes))) !== part.chunkHash
      )
        invalid();
      body.set(bytes, index * limits.partBytes);
    }
    if ((await guard(() => hash(body))) !== first.contentHash) invalid();
    const confirmed = await guard(() =>
      settings.api.verify({ ...request, projectionToken: first.projectionToken }),
    );
    if (
      !closed(confirmed, metadataKeys) ||
      JSON.stringify(metadata(confirmed, source, family, listed)) !== JSON.stringify(meta)
    )
      invalid();
    return { first, meta, body };
  }
  async function* familyRecords(
    source: BookEditorialCaptureSource,
    family: BookEditorialCaptureFamily,
    emit: boolean,
  ): AsyncGenerator<BookBackupRecord, BookEditorialFamilyProof, void> {
    let cursor: string | undefined,
      last: string | null = null,
      digest = await guard(() => textHash(JSON.stringify({ version: 1, source, family }))),
      items = 0,
      aliases = 0,
      artifacts = 0,
      links = 0;
    for (;;) {
      const page = await guard(() =>
        settings.api.list({
          ...wire(source),
          family,
          limit: limits.pageItems,
          ...(cursor ? { cursor } : {}),
        }),
      );
      same(page, source);
      if (
        !closed(page, [...sourceKeys, 'family', 'items', 'nextCursor', 'lastId']) ||
        page.family !== family ||
        !Array.isArray(page.items) ||
        page.items.length > limits.pageItems ||
        (page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' ||
            !page.nextCursor ||
            page.nextCursor.length > 16000 ||
            page.nextCursor === cursor)) ||
        (page.lastId !== null &&
          (!validId(page.lastId) || (last !== null && compareIds(last, page.lastId) >= 0))) ||
        (page.lastId === null && (page.items.length !== 0 || page.nextCursor !== null))
      )
        invalid();
      let prior = last;
      for (const listed of page.items) {
        if (
          !closed(listed, ['id', 'itemToken']) ||
          !validId(listed.id) ||
          !validHash(listed.itemToken) ||
          (prior !== null && compareIds(prior, listed.id) >= 0) ||
          page.lastId === null ||
          compareIds(listed.id, page.lastId) > 0
        )
          invalid();
        prior = listed.id;
      }
      digest = await guard(() =>
        textHash(
          JSON.stringify({
            previous: digest,
            page: { items: page.items, nextCursor: page.nextCursor, lastId: page.lastId },
          }),
        ),
      );
      for (const listed of page.items) {
        check();
        let meta: ReturnType<typeof metadata>,
          first: BookEditorialCaptureMetadata,
          body: Uint8Array | null = null;
        if (emit) {
          const captured = await item(source, family, listed);
          meta = captured.meta;
          first = captured.first;
          body = captured.body;
        } else {
          first = await guard(() => settings.api.inspect({ ...wire(source), family, ...listed }));
          if (!closed(first, metadataKeys)) invalid();
          meta = metadata(first, source, family, listed);
        }
        digest = await guard(() => textHash(JSON.stringify({ previous: digest, item: meta })));
        items++;
        if (!validCount(items)) invalid();
        if (first.state === 'current-alias') {
          aliases++;
          continue;
        }
        let values: BookEditorialArtifact[];
        if (emit) {
          if (!body) invalid();
          let raw: unknown;
          try {
            raw = JSON.parse(
              new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body),
            );
          } catch {
            invalid();
          }
          if (first.payload === 'editorial-bundle') {
            if (
              !closed(raw, ['schemaVersion', 'artifacts']) ||
              raw.schemaVersion !== 1 ||
              !Array.isArray(raw.artifacts) ||
              raw.artifacts.length !== first.recordCount
            )
              invalid();
            values = raw.artifacts.map(normalizeBookEditorialArtifact);
          } else values = [normalizeBookEditorialArtifact(raw)];
          if (
            values.length !== first.recordCount ||
            values[0]?.id !== first.artifactId ||
            new Set(values.map((value) => value.id)).size !== values.length
          )
            invalid();
          for (const value of values) {
            artifacts++;
            yield* split('book-editorial-artifact', value.id, encodeBookBackupJSON(value).bytes);
            const refs = bookEditorialArtifactReferences(value, source.bookId);
            for (const [ordinal, to] of refs.entries()) {
              const link = normalizeBookEditorialLink({
                schemaVersion: 1,
                id: await guard(() =>
                  textHash(
                    JSON.stringify({
                      domain: 'writer-editorial-archive-reference-v1',
                      from: value.id,
                      ordinal,
                      to,
                    }),
                  ),
                ),
                from: {
                  kind: 'artifact',
                  id: value.id,
                  parentId: null,
                  scope: { kind: 'book', id: source.bookId },
                  revision: value.revision,
                  contentHash: null,
                  state: 'recorded',
                  purpose: 'source',
                },
                to,
                relation: 'references',
              });
              links++;
              yield* split('book-editorial-link', link.id, encodeBookBackupJSON(link).bytes);
            }
          }
        } else artifacts += first.recordCount;
        if (![items, aliases, artifacts, links].every(validCount)) invalid();
      }
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
      last = page.lastId;
    }
    return { family, items, aliases, artifacts, links, digest };
  }
  async function verify(proof: BookEditorialBackupProof) {
    if (
      !closed(proof, ['source', 'catalogToken', 'census', 'artifacts', 'links']) ||
      !validHash(proof.catalogToken) ||
      !Array.isArray(proof.census) ||
      !validCount(proof.artifacts) ||
      !validCount(proof.links)
    )
      invalid();
    anchor(proof.source, bookId, settings.expectedBookSourceToken);
    let artifacts = 0,
      links = 0;
    for (const row of proof.census) {
      if (
        !closed(row, ['family', 'items', 'aliases', 'artifacts', 'links', 'digest']) ||
        !validCount(row.items) ||
        !validCount(row.aliases) ||
        !validCount(row.artifacts) ||
        !validCount(row.links) ||
        !validHash(row.digest) ||
        row.aliases > row.items
      )
        invalid();
      artifacts += row.artifacts;
      links += row.links;
      if (!validCount(artifacts) || !validCount(links)) invalid();
    }
    if (artifacts !== proof.artifacts || links !== proof.links) invalid();
    const catalog = await guard(() => settings.api.catalog(wire(proof.source)));
    same(catalog, proof.source);
    if (
      catalog.catalogToken !== proof.catalogToken ||
      catalog.catalogVersion !== BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION ||
      catalog.fenceCoverage !== BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE ||
      JSON.stringify(catalog.families) !== JSON.stringify(BOOK_EDITORIAL_CAPTURE_FAMILIES) ||
      proof.census.length !== catalog.families.length
    )
      invalid();
    for (const [index, family] of catalog.families.entries()) {
      const expected: unknown = proof.census[index];
      if (!closed(expected, ['family', 'items', 'aliases', 'artifacts', 'links', 'digest']))
        invalid();
      if (expected.family !== family) invalid();
      const stream = familyRecords(proof.source, family, false),
        next = await stream.next();
      if (
        !next.done ||
        !next.value ||
        next.value.digest !== expected.digest ||
        next.value.items !== expected.items ||
        next.value.aliases !== expected.aliases ||
        next.value.artifacts !== expected.artifacts
      )
        invalid();
    }
    same(
      anchor(
        await guard(() => settings.api.verifySource(wire(proof.source))),
        bookId,
        proof.source.bookSourceToken,
      ),
      proof.source,
    );
  }
  return { records, verify };
}
export function bookEditorialBackupRecords(
  bookId: string,
  options: BookEditorialBackupOptions,
): AsyncGenerator<BookBackupRecord, BookEditorialBackupProof | undefined, void> {
  return createEditorialCapture(bookId, options).records();
}
export function verifyBookEditorialBackup(
  proof: BookEditorialBackupProof,
  options: BookEditorialBackupOptions,
): Promise<void> {
  return createEditorialCapture(proof.source.bookId, options).verify(proof);
}
