import { asyncRecordStream } from '@/shared/streams';
import {
  encodeAdventureBackup,
  type AdventureBackupRecord,
  type AdventureBackupSeal,
} from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  adventurePackageHeader,
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  type AdventurePackageCounts,
  type AdventurePackageSection,
} from '../../../../functions/src/adventureBackupPackage.mjs';
import {
  source,
  validId,
  type AdventureInventorySource,
  type AdventureInventoryMethod,
} from './adventureInventoryContracts';
import { verifyAdventureBackupInventory } from './adventureInventory';
import { streamAdventureCoreData, type AdventureCoreProof } from './adventureCoreData';
import { streamAdventureHistoryData } from './adventureHistoryData';
import type { AdventureHistoryMethod, AdventureHistoryProof } from './adventureHistoryContracts';
import { streamAdventureImageData, verifyAdventureImageData } from './adventureImageData';
import type { AdventureImageMethod, AdventureImageProof } from './adventureImageContracts';
import {
  streamAdventureDraftData,
  verifyAdventureDraftData,
  captureAdventureDraftInput,
  type AdventureDraftInput,
  type AdventureDraftOrigin,
  type AdventureDraftProof,
} from './adventureDraftData';
import type { AdventureUnitMethod, AdventureUnitProof } from './adventureUnitContracts';
export type AdventureArchiveMethod =
  AdventureInventoryMethod | AdventureUnitMethod | AdventureHistoryMethod | AdventureImageMethod;
export interface AdventureArchiveApi {
  call(method: AdventureArchiveMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface AdventureArchiveOptions {
  guard: () => void;
  signal?: AbortSignal;
  source?: AdventureInventorySource;
  draft?: AdventureDraftInput | null;
}
export interface AdventureArchiveProof {
  readonly validation: 'captured-data-only';
  readonly core: AdventureCoreProof;
  readonly history: AdventureHistoryProof;
  readonly draft: AdventureDraftProof;
  readonly images: AdventureImageProof;
  readonly sections: AdventurePackageCounts;
}
export interface AdventureArchiveByteProof {
  readonly validation: 'captured-data-only';
  readonly capture: AdventureArchiveProof;
  readonly seal: AdventureBackupSeal;
}
export class AdventureArchiveError extends Error {
  readonly code = 'adventure-backup-incomplete-capture';
  constructor() {
    super('Não foi possível completar o backup da aventura. Faça uma nova captura.');
    this.name = 'AdventureArchiveError';
  }
}
function invalid(): never {
  throw new AdventureArchiveError();
}
function capture(adventureId: string, api: AdventureArchiveApi, options: AdventureArchiveOptions) {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    invalid();
  return {
    invoke: api.call.bind(api),
    guard: options.guard,
    signal: options.signal,
    expected:
      options.source === undefined ? undefined : source(options.source, adventureId).sourceToken,
    draft: captureAdventureDraftInput(adventureId, options.draft ?? null),
  };
}
async function drain<R, T>(
  stream: AsyncGenerator<R, T | undefined, void>,
  write: (record: R) => Promise<void>,
): Promise<T> {
  let done = false;
  try {
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        done = true;
        if (!next.value) invalid();
        return next.value;
      }
      await write(next.value);
    }
  } finally {
    if (!done) await stream.return(undefined);
  }
}
/** Source-checked capture. Importers still need independent domain validation before using the file. */
export function streamAdventureArchiveRecords(
  adventureId: string,
  api: AdventureArchiveApi,
  options: AdventureArchiveOptions,
): AsyncGenerator<AdventureBackupRecord, AdventureArchiveProof | undefined, void> {
  const settings = capture(adventureId, api, options);
  return asyncRecordStream(
    async (write, signal) => {
      function check() {
        settings.guard();
        settings.signal?.throwIfAborted();
        signal.throwIfAborted();
      }
      const call = async (
        method: AdventureArchiveMethod,
        input: Readonly<Record<string, unknown>>,
      ) => {
        check();
        const result = await settings.invoke(method, Object.freeze({ ...input }));
        check();
        return result;
      };
      const port = { call },
        anchor = source(
          await call('getAdventureBackupSource', {
            adventureId,
            ...(settings.expected === undefined ? {} : { expectedSourceToken: settings.expected }),
          }),
          adventureId,
          settings.expected,
        );
      const counts = createAdventurePackageCounts();
      async function emit(record: AdventureBackupRecord, section?: AdventurePackageSection) {
        check();
        if (section) countAdventurePackageRecord(counts, section, record);
        await write(Object.freeze({ ...record }));
        check();
      }
      await emit(adventurePackageHeader(adventureId));
      let head: AdventureUnitProof | undefined, body: AdventureUnitProof | undefined;
      const core = await drain(
        streamAdventureCoreData(adventureId, port, {
          guard: check,
          signal,
          source: anchor,
          onUnit: (proof) => {
            const selected = settings.draft?.resource;
            if (!selected || proof.scope.family !== 'resources') return;
            if (proof.scope.kind === selected.kind && proof.item.id === selected.id) head = proof;
            if (
              proof.scope.kind === selected.kind + '-body' &&
              proof.scope.parentId === selected.id
            )
              body = proof;
          },
        }),
        (row) => emit(row.record, row.section),
      );
      for (const section of ['structure', 'resources', 'lore', 'personas', 'universe'] as const)
        if (
          counts[section].records !== core.sections[section].records ||
          counts[section].payloadBytes !== core.sections[section].payloadBytes
        )
          invalid();
      let origin: AdventureDraftOrigin | null = null;
      if (settings.draft) {
        if (!head || !body) invalid();
        origin = Object.freeze({ head, body });
      }
      const history = await drain(
        streamAdventureHistoryData(adventureId, port, { guard: check, signal, source: anchor }),
        (row) => emit(row, 'history'),
      );
      if (history.nativeRecords !== core.inventory.counts.history) invalid();
      const draft = await drain(
        streamAdventureDraftData(adventureId, settings.draft, port, {
          guard: check,
          signal,
          source: anchor,
          origin,
        }),
        (row) => emit(row, 'drafts'),
      );
      const images = await drain(
        streamAdventureImageData(adventureId, port, { guard: check, signal, source: anchor }),
        (row) => emit(row, 'images'),
      );
      if (images.bindings !== core.inventory.counts.images) invalid();
      await verifyAdventureImageData(images, port, { guard: check, signal, source: anchor });
      await verifyAdventureDraftData(draft, port, { guard: check, signal });
      await verifyAdventureBackupInventory(core.inventory, port, { guard: check, signal });
      check();
      await emit(adventurePackageEnd(adventureId, counts));
      const sections = Object.freeze(
        Object.fromEntries(
          Object.entries(counts).map(([key, value]) => [key, Object.freeze({ ...value })]),
        ),
      ) as AdventurePackageCounts;
      return Object.freeze({
        validation: 'captured-data-only' as const,
        core,
        history,
        draft,
        images,
        sections,
      });
    },
    { signal: settings.signal, check: settings.guard },
  );
}
/** Bounds the byte bridge and checks account/abort between every framed output, including the final container seal. */
export function streamAdventureArchive(
  adventureId: string,
  api: AdventureArchiveApi,
  options: AdventureArchiveOptions,
): AsyncGenerator<Uint8Array, AdventureArchiveByteProof | undefined, void> {
  const settings = capture(adventureId, api, options),
    controller = new AbortController();
  function check() {
    settings.guard();
    settings.signal?.throwIfAborted();
    controller.signal.throwIfAborted();
  }
  const records = streamAdventureArchiveRecords(
    adventureId,
    { call: settings.invoke },
    {
      guard: check,
      signal: settings.signal,
      draft: settings.draft,
      ...(settings.expected === undefined
        ? {}
        : { source: { schemaVersion: 1, adventureId, sourceToken: settings.expected } }),
    },
  );
  return asyncRecordStream(
    async (write, signal) => {
      function active() {
        check();
        signal.throwIfAborted();
      }
      let proof: AdventureArchiveProof | undefined,
        finished = false;
      async function* input() {
        try {
          for (;;) {
            active();
            const next = await records.next();
            active();
            if (next.done) {
              proof = next.value;
              finished = true;
              return;
            }
            yield next.value;
          }
        } finally {
          if (!finished) await records.return(undefined);
        }
      }
      const framed = encodeAdventureBackup(input(), { signal });
      try {
        for (;;) {
          active();
          const next = await framed.next();
          active();
          if (next.done) {
            if (!proof) invalid();
            return Object.freeze({
              validation: 'captured-data-only' as const,
              capture: proof,
              seal: Object.freeze({ ...next.value }),
            });
          }
          await write(next.value);
          active();
        }
      } finally {
        controller.abort();
        await records.return(undefined);
        void framed.throw(new DOMException('Captura encerrada.', 'AbortError')).catch(() => {});
      }
    },
    { signal: settings.signal, check: settings.guard },
  );
}
