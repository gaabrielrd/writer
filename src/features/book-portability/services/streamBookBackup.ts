import type {
  WorkHistoryBackupPart,
  WorkHistoryStreamProof,
  WorkHistoryStreamOptions,
} from '@/features/manuscript-history';
import type {
  BookStructureApi,
  BookStructureSource,
} from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookResourceApi } from '../../../../functions/src/bookBackupResources.mjs';
import type { BookPersonaApi } from '../../../../functions/src/bookBackupPersonas.mjs';
import type { BookUniverseApi } from '../../../../functions/src/bookBackupUniverse.mjs';
import type { BookDraftApi } from '../../../../functions/src/bookBackupDraft.mjs';
import type { BookCoverApi } from '../../../../functions/src/bookBackupCover.mjs';
import {
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  type BookPackageSection,
} from '../../../../functions/src/bookBackupPackage.mjs';
import {
  encodeBookBackup,
  BookBackupFormatError,
  type BookBackupRecord,
  type BookBackupSeal,
} from '../model/backupContainer';
import { bookStructureApi } from './bookStructureCallables';
import { bookResourceApi } from './bookResourceCallables';
import { bookPersonaApi } from './bookPersonaCallables';
import { bookUniverseApi } from './bookUniverseCallables';
import { bookDraftApi } from './bookDraftCallables';
import { bookCoverApi } from './bookCoverCallables';
import { captureBookBackupStructure, verifyBookBackupStructure } from './bookStructureCapture';
import { captureBookBackupResources, verifyBookBackupResources } from './bookResourceCapture';
import { captureBookBackupPersonas, verifyBookBackupPersonas } from './bookPersonaCapture';
import { captureBookBackupUniverse, verifyBookBackupUniverse } from './bookUniverseCapture';
import { bookHistoryBackupRecords } from './bookHistoryBackupRecords';
import {
  bookDraftBackupRecords,
  verifyBookBackupDraft,
  type BookDraftInput,
} from './bookDraftBackupRecords';
import { bookCoverBackupRecords, verifyBookBackupCover } from './bookCoverBackupRecords';
import { recordCaptureStream } from './recordCaptureStream';
import { validId, source } from './bookSnapshotCapture';
export interface BookBackupHistoryPort {
  stream(
    this: void,
    target: { kind: 'book'; id: string },
    options: WorkHistoryStreamOptions,
  ): AsyncGenerator<WorkHistoryBackupPart, WorkHistoryStreamProof | undefined, void>;
  verify(
    this: void,
    proof: WorkHistoryStreamProof,
    options: WorkHistoryStreamOptions,
  ): Promise<void>;
}
export interface BookBackupOptions {
  history: BookBackupHistoryPort;
  draft?: BookDraftInput | null;
  source?: BookStructureSource;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  apis?: {
    structure?: BookStructureApi;
    resources?: BookResourceApi;
    personas?: BookPersonaApi;
    universe?: BookUniverseApi;
    draft?: BookDraftApi;
    cover?: BookCoverApi;
  };
}
function invalid(): never {
  throw new BookBackupFormatError(
    'invalid-record',
    'Não foi possível completar todas as seções do backup.',
  );
}
/** Freezes the local contribution now. Records stay provisional until all proofs and the M2 seal. */
export function streamBookBackup(
  bookId: string,
  options: BookBackupOptions,
): AsyncGenerator<Uint8Array, BookBackupSeal | undefined, void> {
  const settings = { ...options, apis: { ...options.apis }, history: { ...options.history } },
    controller = new AbortController();
  function check() {
    settings.signal?.throwIfAborted();
    controller.signal.throwIfAborted();
    if (settings.isCurrent && !settings.isCurrent())
      throw new DOMException('A captura não pertence mais à sessão atual.', 'AbortError');
  }
  check();
  if (
    !validId(bookId) ||
    typeof settings.history.stream !== 'function' ||
    typeof settings.history.verify !== 'function'
  )
    invalid();
  const expected =
    settings.source === undefined ? undefined : source(settings.source, bookId).sourceToken;
  const guard = async <T>(operation: () => Promise<T>): Promise<T> => {
    check();
    const result = await operation();
    check();
    return result;
  };
  const bases = {
    structure: settings.apis.structure ?? bookStructureApi,
    resources: settings.apis.resources ?? bookResourceApi,
    personas: settings.apis.personas ?? bookPersonaApi,
    universe: settings.apis.universe ?? bookUniverseApi,
    draft: settings.apis.draft ?? bookDraftApi,
    cover: settings.apis.cover ?? bookCoverApi,
  };
  const structureApi: BookStructureApi = {
    getSource: (input) => guard(() => bases.structure.getSource(input)),
    list: (input) => guard(() => bases.structure.list(input)),
    read: (input) => guard(() => bases.structure.read(input)),
  };
  const resourcesApi: BookResourceApi = {
    getSource: (input) => guard(() => bases.resources.getSource(input)),
    list: (input) => guard(() => bases.resources.list(input)),
    read: (input) => guard(() => bases.resources.read(input)),
  };
  const personasApi: BookPersonaApi = {
    getSource: (input) => guard(() => bases.personas.getSource(input)),
    list: (input) => guard(() => bases.personas.list(input)),
    read: (input) => guard(() => bases.personas.read(input)),
  };
  const universeApi: BookUniverseApi = {
    getSource: (input) => guard(() => bases.universe.getSource(input)),
    read: (input) => guard(() => bases.universe.read(input)),
  };
  const coverApi: BookCoverApi = {
    getSource: (input) => guard(() => bases.cover.getSource(input)),
    cover: (input) => guard(() => bases.cover.cover(input)),
    read: (input) => guard(() => bases.cover.read(input)),
    verify: (input) => guard(() => bases.cover.verify(input)),
  };
  let anchor: BookStructureSource | undefined;
  const draftApi: BookDraftApi = {
    getSource: async (input) => {
      if (!anchor) invalid();
      const pin = anchor.sourceToken;
      return source(
        await guard(() => bases.draft.getSource({ ...input, expectedSourceToken: pin })),
        bookId,
        pin,
      );
    },
    persona: (input) => guard(() => bases.draft.persona(input)),
  };
  // M8 freezes the draft here, before this function returns or any server/sink await.
  const draftStream = bookDraftBackupRecords(bookId, settings.draft ?? null, {
    api: draftApi,
    signal: controller.signal,
    isCurrent: () => {
      check();
      return true;
    },
  });
  const counts = createBookPackageCounts();
  const bridge = <T>(
    produce: (
      write: (record: BookBackupRecord) => Promise<void>,
      signal: AbortSignal,
    ) => Promise<T>,
  ) => recordCaptureStream(produce, { signal: controller.signal, check });
  async function* section<T>(
    name: BookPackageSection,
    stream: AsyncGenerator<BookBackupRecord, T | undefined, void>,
  ): AsyncGenerator<BookBackupRecord, T | undefined, void> {
    let complete = false;
    try {
      for (;;) {
        check();
        const next = await stream.next();
        check();
        if (next.done) {
          complete = true;
          return next.value;
        }
        countBookPackageRecord(counts, name, next.value);
        yield next.value;
      }
    } finally {
      if (!complete) await stream.return(undefined);
    }
  }
  function same(value: { source: BookStructureSource } | undefined) {
    if (!value || !anchor) invalid();
    source(value.source, bookId, anchor.sourceToken);
  }
  async function* records(): AsyncGenerator<BookBackupRecord, void, void> {
    anchor = source(
      await structureApi.getSource({
        bookId,
        ...(expected === undefined ? {} : { expectedSourceToken: expected }),
      }),
      bookId,
      expected,
    );
    check();
    yield bookPackageHeader(bookId);
    const structure = yield* section(
      'structure',
      bridge((write, signal) =>
        captureBookBackupStructure({ bookId, source: anchor, api: structureApi, write, signal }),
      ),
    );
    same(structure);
    const resources = yield* section(
      'resources',
      bridge((write, signal) =>
        captureBookBackupResources({ bookId, source: anchor, api: resourcesApi, write, signal }),
      ),
    );
    same(resources);
    const personas = yield* section(
      'personas',
      bridge((write, signal) =>
        captureBookBackupPersonas({ bookId, source: anchor, api: personasApi, write, signal }),
      ),
    );
    same(personas);
    const universe = yield* section(
      'universe',
      bridge((write, signal) =>
        captureBookBackupUniverse({ bookId, source: anchor, api: universeApi, write, signal }),
      ),
    );
    same(universe);
    const history = yield* section(
      'history',
      bookHistoryBackupRecords(
        bookId,
        settings.history.stream(
          { kind: 'book', id: bookId },
          {
            signal: controller.signal,
            isCurrent: () => {
              check();
              return true;
            },
          },
        ),
      ),
    );
    if (!history) invalid();
    const draft = yield* section('draft', draftStream);
    same(draft);
    const cover = yield* section(
      'cover',
      bookCoverBackupRecords(bookId, {
        api: coverApi,
        source: anchor,
        signal: controller.signal,
        isCurrent: () => {
          check();
          return true;
        },
      }),
    );
    same(cover);
    if (!structure || !resources || !personas || !universe || !draft || !cover) invalid();
    await verifyBookBackupStructure(structure, { api: structureApi, signal: controller.signal });
    await verifyBookBackupResources(resources, { api: resourcesApi, signal: controller.signal });
    await verifyBookBackupPersonas(personas, { api: personasApi, signal: controller.signal });
    await verifyBookBackupUniverse(universe, { api: universeApi, signal: controller.signal });
    await guard(() =>
      settings.history.verify(history, {
        signal: controller.signal,
        isCurrent: () => {
          check();
          return true;
        },
      }),
    );
    await verifyBookBackupDraft(draft, {
      api: draftApi,
      signal: controller.signal,
      isCurrent: () => {
        check();
        return true;
      },
    });
    await verifyBookBackupCover(cover, {
      api: coverApi,
      signal: controller.signal,
      isCurrent: () => {
        check();
        return true;
      },
    });
    source(
      await structureApi.getSource({ bookId, expectedSourceToken: anchor.sourceToken }),
      bookId,
      anchor.sourceToken,
    );
    check();
    yield bookPackageEnd(bookId, counts);
    check();
  }
  return bytes();
  async function* bytes(): AsyncGenerator<Uint8Array, BookBackupSeal | undefined, void> {
    const onAbort = () => controller.abort(settings.signal?.reason);
    settings.signal?.addEventListener('abort', onAbort, { once: true });
    if (settings.signal?.aborted) onAbort();
    try {
      check();
      return yield* encodeBookBackup(records(), { signal: controller.signal });
    } finally {
      controller.abort(new DOMException('Fluxo de backup encerrado.', 'AbortError'));
      settings.signal?.removeEventListener('abort', onAbort);
      await draftStream.return(undefined);
    }
  }
}
