import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { bookLoreJSONParts } from './bookLoreWritePayload';
import { readCount } from './bookLoreReadContracts';
import {
  journalFail,
  type LoreJournalHead,
  type LoreJournalBlob,
} from './bookLoreJournalContracts';
import {
  journalCheck,
  journalGrant,
  prepareJournalJSON,
  sealJournalFrame,
  openJournalFrame,
  readJournalDigest,
  journalDigestBytes,
} from './bookLoreJournalCrypto';
import {
  journalFrameKey,
  readJournalFrame,
  type JournalFrameKey,
  type commitJournalHead,
} from './bookLoreJournalDb';
import {
  checkCheckpointOutcome,
  finishCheckpointOutcome,
} from './bookLoreCheckpointOutcomeContracts';
import { readBookLoreCheckpointBundle } from './bookLoreCheckpointBundle';
import type { LoreJournalOptions } from './bookLoreJournal';
export class LoreCheckpointCollectionRequired extends Error {
  constructor() {
    super('Conclua a coleta da cópia anterior antes de salvar outro progresso.');
  }
}
interface CheckpointContext {
  options: LoreJournalOptions;
  inspect(this: void): Promise<LoreJournalHead>;
  mutate(
    this: void,
    update: (head: LoreJournalHead) => LoreJournalHead,
    adds?: Parameters<typeof commitJournalHead>[3],
    removes?: JournalFrameKey[],
  ): Promise<LoreJournalHead>;
}
export function checkpointJournal({ options, inspect, mutate }: CheckpointContext) {
  let busy = false,
    encryptionKey: CryptoKey | null = null;
  const check = (cleanup = false) =>
    journalCheck(cleanup ? { ...options, signal: undefined } : options);
  async function fresh(cleanup = false) {
    check(cleanup);
    const grant = await options.getKey();
    check(cleanup);
    return journalGrant(grant, (await inspect()).identity);
  }
  async function encryptedDigest(
    head: LoreJournalHead,
    blob: LoreJournalBlob,
    key: CryptoKey,
    cleanup = false,
  ) {
    const frame = await readJournalFrame(
      journalFrameKey(head.identity, 'checkpoint', blob.generation, -1),
    );
    check(cleanup);
    const bytes = await openJournalFrame(key, head.identity, 'checkpoint', blob, -1, frame);
    check(cleanup);
    try {
      return readJournalDigest(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
        blob,
      );
    } catch {
      return journalFail();
    }
  }
  async function verifyFrame(
    head: LoreJournalHead,
    blob: LoreJournalBlob,
    key: CryptoKey,
    index: number,
    expected: Uint8Array,
    cleanup: boolean,
  ) {
    const stored = await readJournalFrame(
      journalFrameKey(head.identity, 'checkpoint', blob.generation, index),
    );
    check(cleanup);
    const bytes = await openJournalFrame(key, head.identity, 'checkpoint', blob, index, stored);
    check(cleanup);
    if (bytes.length !== expected.length || bytes.some((b, n) => b !== expected[n])) journalFail();
  }
  async function promote(
    generation: string,
    bundle: ReturnType<typeof readBookLoreCheckpointBundle>,
  ) {
    return mutate((h) => {
      const cp = h.checkpoint,
        b = cp?.pending;
      if (!cp || !b || b.generation !== generation || b.written !== b.chunkCount || cp.garbage)
        journalFail();
      let next = {
        ...h,
        checkpoint: {
          active: { ...b, complete: true },
          pending: null,
          garbage: cp.active ? { blob: cp.active, next: 0 } : null,
        },
      };
      for (const c of bundle.confirmed) {
        const unit = next[c.lane];
        if (!unit || unit.requestHash !== c.requestHash || unit.state === 'sealing') journalFail();
        next = { ...next, [c.lane]: { ...unit, state: 'confirmed' } };
      }
      return finishCheckpointOutcome(h, next, bundle);
    });
  }
  async function writeCheckpoint(value: unknown) {
    if (busy) throw Error('Uma cópia do progresso já está em andamento.');
    busy = true;
    try {
      const initial = await inspect(),
        bundle = readBookLoreCheckpointBundle(value, initial.identity),
        cleanup = bundle.checkpoint.cancelRequested,
        io = cleanup ? { ...options, signal: undefined } : options,
        prepared = await prepareJournalJSON(bundle, io);
      check(cleanup);
      encryptionKey ??= await fresh(cleanup);
      const key = encryptionKey;
      let current = await inspect(),
        cp = current.checkpoint;
      if (!cp?.pending && cp?.active) {
        const prior = await encryptedDigest(current, cp.active, key, cleanup);
        if (prior.contentHash === prepared.manifest.contentHash) {
          let n = 0;
          for (const bytes of bookLoreJSONParts(prepared.value, io))
            await verifyFrame(current, cp.active, key, n++, bytes, cleanup);
          const latest = await inspect();
          if (latest.checkpoint?.active?.generation !== cp.active.generation) journalFail();
          checkCheckpointOutcome(latest, bundle);
          return latest;
        }
      }
      checkCheckpointOutcome(current, bundle);
      if (cp?.garbage) throw new LoreCheckpointCollectionRequired();
      if (cp?.pending) {
        const prior = await encryptedDigest(current, cp.pending, key, cleanup);
        if (
          prior.contentHash !== prepared.manifest.contentHash ||
          prior.byteLength !== prepared.manifest.byteLength
        )
          journalFail();
      } else {
        const blob = {
            generation: crypto.randomUUID(),
            ...prepared.manifest,
            written: 0,
            complete: false,
          },
          { contentHash: _privateHash, ...stored } = blob;
        void _privateHash;
        const sealed = await sealJournalFrame(
          key,
          current.identity,
          'checkpoint',
          stored,
          -1,
          journalDigestBytes(prepared.manifest),
        );
        check(cleanup);
        current = await mutate(
          (h) => {
            if (h.checkpoint?.pending || h.checkpoint?.garbage) journalFail();
            return {
              ...h,
              checkpoint: { active: h.checkpoint?.active ?? null, pending: stored, garbage: null },
            };
          },
          [
            {
              key: journalFrameKey(current.identity, 'checkpoint', stored.generation, -1),
              value: sealed,
            },
          ],
        );
        cp = current.checkpoint;
      }
      const generation = cp!.pending!.generation;
      let index = 0;
      for (const bytes of bookLoreJSONParts(prepared.value, io)) {
        current = await inspect();
        const blob = current.checkpoint?.pending;
        if (!blob || blob.generation !== generation) journalFail();
        if (index >= blob.written) {
          const at = index,
            sealed = await sealJournalFrame(key, current.identity, 'checkpoint', blob, at, bytes);
          check(cleanup);
          await mutate(
            (h) => {
              const b = h.checkpoint?.pending;
              if (!b || b.generation !== generation || b.written !== at) journalFail();
              return { ...h, checkpoint: { ...h.checkpoint!, pending: { ...b, written: at + 1 } } };
            },
            [
              {
                key: journalFrameKey(current.identity, 'checkpoint', generation, at),
                value: sealed,
              },
            ],
          );
        } else {
          await verifyFrame(current, blob, key, index, bytes, cleanup);
          await (options.yieldControl?.() ??
            new Promise<void>((resolve) => setTimeout(resolve, 0)));
          check(cleanup);
        }
        index++;
      }
      check(cleanup);
      return await promote(generation, bundle);
    } finally {
      busy = false;
    }
  }
  async function readCheckpoint(committedOnly = false) {
    const current = await inspect(),
      cp = current.checkpoint,
      pending =
        !committedOnly && cp?.pending?.written === cp?.pending?.chunkCount ? cp?.pending : null,
      blob = pending ?? cp?.active;
    if (!blob) return null;
    const cleanup = current.cancelRequested,
      key = await fresh(cleanup),
      manifest = await encryptedDigest(current, blob, key, cleanup),
      hasher = sha256.create(),
      decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
      text: string[] = [];
    let length = 0;
    try {
      for (let index = 0; index < blob.chunkCount; index++) {
        check(cleanup);
        const frame = await readJournalFrame(
          journalFrameKey(current.identity, 'checkpoint', blob.generation, index),
        );
        check(cleanup);
        const bytes = await openJournalFrame(
          key,
          current.identity,
          'checkpoint',
          blob,
          index,
          frame,
        );
        check(cleanup);
        if (bytes.length !== Math.min(65536, blob.byteLength - index * 65536)) journalFail();
        length += bytes.length;
        hasher.update(bytes);
        text.push(decoder.decode(bytes, { stream: true }));
      }
      text.push(decoder.decode());
    } catch {
      return journalFail();
    }
    if (length !== manifest.byteLength || bytesToHex(hasher.digest()) !== manifest.contentHash)
      journalFail();
    let raw: unknown;
    try {
      raw = JSON.parse(text.join(''));
    } catch {
      return journalFail();
    }
    const bundle = readBookLoreCheckpointBundle(raw, current.identity);
    await fresh(cleanup);
    const latest = await inspect(),
      latestBlob = pending ? latest.checkpoint?.pending : latest.checkpoint?.active;
    if (latestBlob?.generation !== blob.generation) journalFail();
    check(cleanup);
    if (pending) await promote(blob.generation, bundle);
    check(cleanup);
    return bundle;
  }
  async function advanceCheckpointCleanup(limit = 50) {
    check(true);
    readCount(limit);
    if (limit < 1 || limit > 50) journalFail();
    const current = await inspect(),
      garbage = current.checkpoint?.garbage;
    if (!garbage) return current;
    const end = Math.min(garbage.next + limit, garbage.blob.written + 1),
      keys = Array.from({ length: end - garbage.next }, (_, n) =>
        journalFrameKey(
          current.identity,
          'checkpoint',
          garbage.blob.generation,
          garbage.next + n - 1,
        ),
      );
    return mutate(
      (h) => {
        const g = h.checkpoint?.garbage;
        if (
          !g ||
          g.blob.generation !== garbage.blob.generation ||
          g.next !== garbage.next ||
          h.checkpoint?.active?.generation === g.blob.generation ||
          h.checkpoint?.pending?.generation === g.blob.generation
        )
          journalFail();
        return {
          ...h,
          checkpoint: {
            ...h.checkpoint!,
            garbage: end === g.blob.written + 1 ? null : { ...g, next: end },
          },
        };
      },
      [],
      keys,
    );
  }
  return { writeCheckpoint, readCheckpoint, advanceCheckpointCleanup };
}
