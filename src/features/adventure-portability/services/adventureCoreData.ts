import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import {
  ADVENTURE_CORE_SECTIONS,
  adventureCoreCounts,
  adventureCoreManifest,
  adventureCoreRecordIdentity,
  adventureNullPersona,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  type AdventureCoreSection,
} from '../../../../functions/src/adventureArchiveCore.mjs';
import type { AdventureBackupRecord } from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  source,
  validId,
  validCount,
  invalid,
  type AdventureInventorySource,
  type AdventureInventoryMethod,
  type AdventureInventoryScope,
  type AdventureInventoryItem,
  type AdventureInventoryProof,
} from './adventureInventoryContracts';
import { scanAdventureBackupInventory } from './adventureInventory';
import { readAdventureBackupUnit } from './adventureUnit';
import type { AdventureUnitMethod, AdventureUnitProof } from './adventureUnitContracts';
export interface AdventureCoreApi {
  call(
    method: AdventureInventoryMethod | AdventureUnitMethod,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}
export interface AdventureCoreOptions {
  guard: () => void;
  signal?: AbortSignal;
  source?: AdventureInventorySource;
  onUnit?: (proof: AdventureUnitProof) => Promise<void>;
}
export interface AdventureCoreRecord {
  readonly section: AdventureCoreSection;
  readonly record: AdventureBackupRecord;
}
export interface AdventureCoreProof {
  readonly validation: 'core-data-only';
  readonly inventory: AdventureInventoryProof;
  readonly sections: Readonly<
    Record<
      AdventureCoreSection,
      { units: number; records: number; payloadBytes: number; digest: string }
    >
  >;
}
interface State {
  units: number;
  records: number;
  payloadBytes: number;
  counts: Record<string, number> | null;
  hash: ReturnType<typeof sha256.create>;
  digest: string | null;
}
const encoder = new TextEncoder();
const endKinds = {
  resources: 'adventure-resources',
  lore: 'adventure-lore-end',
  personas: 'adventure-personas',
} as const;
/** First content pass for five sections. Caller must capture the remaining sections and verify all proofs before any file footer. */
export function streamAdventureCoreData(
  adventureId: string,
  api: AdventureCoreApi,
  options: AdventureCoreOptions,
): AsyncGenerator<AdventureCoreRecord, AdventureCoreProof | undefined, void> {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    invalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal,
    onUnit = options.onUnit;
  const expected =
    options.source === undefined ? undefined : source(options.source, adventureId).sourceToken;
  return asyncRecordStream<AdventureCoreRecord, AdventureCoreProof>(
    async (write, activeSignal) => {
      function check() {
        guard();
        signal?.throwIfAborted();
        activeSignal.throwIfAborted();
      }
      const call = async (
        method: AdventureInventoryMethod | AdventureUnitMethod,
        input: Readonly<Record<string, unknown>>,
      ) => {
        check();
        const result = await invoke(method, Object.freeze({ ...input }));
        check();
        return result;
      };
      const port = { call };
      const anchor = source(
        await call('getAdventureBackupSource', {
          adventureId,
          ...(expected === undefined ? {} : { expectedSourceToken: expected }),
        }),
        adventureId,
        expected,
      );
      const states = Object.fromEntries(
        ADVENTURE_CORE_SECTIONS.map((section) => [
          section,
          {
            units: 0,
            records: 0,
            payloadBytes: 0,
            counts: ['resources', 'lore', 'personas'].includes(section)
              ? adventureCoreCounts(section)
              : null,
            hash: sha256.create().update(encoder.encode(adventureCoreDigestSeed(section))),
            digest: null,
          },
        ]),
      ) as Record<AdventureCoreSection, State>;
      let current = 0;
      async function emit(section: AdventureCoreSection, record: AdventureBackupRecord) {
        check();
        const state = states[section];
        state.records++;
        state.payloadBytes += record.payload.byteLength;
        if (
          !validCount(state.records) ||
          !validCount(state.payloadBytes) ||
          record.payload.length > 65536
        )
          invalid();
        await write(Object.freeze({ section, record: Object.freeze({ ...record }) }));
        check();
      }
      function note(
        section: AdventureCoreSection,
        identity: { kind: string; id: string },
        manifest: { byteLength: number; chunkCount: number; contentHash: string },
        key?: string,
      ) {
        const state = states[section];
        state.units++;
        if (!validCount(state.units)) invalid();
        if (state.counts) {
          if (!key || !Object.hasOwn(state.counts, key)) invalid();
          state.counts[key]!++;
          if (!validCount(state.counts[key])) invalid();
        }
        state.hash.update(encoder.encode(adventureCoreDigestLine(identity, manifest)));
      }
      async function tiny(
        section: AdventureCoreSection,
        scope: AdventureInventoryScope,
        id: string,
        value: unknown,
        key?: string,
      ) {
        check();
        const identity = await adventureCoreRecordIdentity(scope, id);
        check();
        const bytes = encoder.encode(JSON.stringify(value));
        if (!bytes.length || bytes.length > 65536) invalid();
        const manifest = {
          byteLength: bytes.length,
          chunkCount: 1,
          contentHash: bytesToHex(sha256(bytes)),
        };
        await emit(section, { ...identity, part: 0, payload: bytes });
        note(section, identity, manifest, key);
      }
      async function unit(
        section: AdventureCoreSection,
        scope: AdventureInventoryScope,
        item: AdventureInventoryItem,
        key?: string,
      ) {
        check();
        const identity = await adventureCoreRecordIdentity(scope, item.id);
        check();
        const stream = readAdventureBackupUnit(anchor, scope, item, port, {
          guard: check,
          signal: activeSignal,
        });
        let complete = false,
          part = 0,
          proof: AdventureUnitProof | undefined;
        try {
          for (;;) {
            check();
            const next = await stream.next();
            check();
            if (next.done) {
              complete = true;
              proof = next.value;
              break;
            }
            await emit(section, { ...identity, part: part++, payload: next.value });
          }
        } finally {
          if (!complete) await stream.return(undefined);
        }
        if (
          !proof ||
          proof.validation !== 'unit-bytes-only' ||
          proof.source.sourceToken !== anchor.sourceToken ||
          part !== proof.chunkCount
        )
          invalid();
        if (onUnit) {
          check();
          await onUnit(proof);
          check();
        }
        note(section, identity, proof, key);
      }
      async function finish(section: AdventureCoreSection) {
        check();
        const state = states[section];
        if (state.digest !== null) invalid();
        state.digest = bytesToHex(state.hash.digest());
        if (state.counts) {
          const manifest = adventureCoreManifest(section, state.units, state.digest, state.counts);
          const kind = endKinds[section as keyof typeof endKinds];
          if (!kind) invalid();
          await emit(section, {
            kind,
            id: adventureId,
            part: 0,
            payload: encoder.encode(JSON.stringify(manifest)),
          });
        }
      }
      async function advance(section: AdventureCoreSection) {
        const index = ADVENTURE_CORE_SECTIONS.indexOf(section);
        if (index < current) invalid();
        while (current < index) {
          await finish(ADVENTURE_CORE_SECTIONS[current]!);
          current++;
        }
      }
      try {
        await unit(
          'structure',
          { family: 'structure', kind: 'adventure' },
          { id: adventureId, itemToken: anchor.sourceToken },
        );
        const inventory = await scanAdventureBackupInventory(adventureId, port, {
          guard: check,
          signal: activeSignal,
          source: anchor,
          visit: async (scope, item) => {
            const family = scope.family;
            if (family === 'history' || family === 'images') return;
            await advance(family);
            if (family === 'universe') {
              await tiny('universe', scope, item.id, { schemaVersion: 1, origin: item.origin });
            } else if (family === 'personas' && item.personaId === null) {
              await tiny(
                'personas',
                scope,
                item.id,
                adventureNullPersona(scope.scope!, item.id),
                scope.scope,
              );
            } else {
              await unit(
                family,
                scope,
                item,
                family === 'resources' || family === 'lore'
                  ? scope.kind
                  : family === 'personas'
                    ? scope.scope
                    : undefined,
              );
            }
          },
        });
        await finish('universe');
        check();
        for (const section of ADVENTURE_CORE_SECTIONS)
          if (
            states[section].units !==
            inventory.counts[section] + (section === 'structure' ? 1 : 0)
          )
            invalid();
        const sections = Object.fromEntries(
          ADVENTURE_CORE_SECTIONS.map((section) => {
            const state = states[section];
            if (state.digest === null) invalid();
            return [
              section,
              Object.freeze({
                units: state.units,
                records: state.records,
                payloadBytes: state.payloadBytes,
                digest: state.digest,
              }),
            ];
          }),
        ) as AdventureCoreProof['sections'];
        return Object.freeze({
          validation: 'core-data-only',
          inventory,
          sections: Object.freeze(sections),
        });
      } finally {
        for (const state of Object.values(states)) state.hash.destroy();
      }
    },
    { signal, check: guard },
  );
}
