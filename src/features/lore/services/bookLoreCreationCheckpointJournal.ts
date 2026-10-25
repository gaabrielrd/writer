import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreJSONParts, bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { journalFail, sameJournalIdentity, type LoreJournalBlob } from './bookLoreJournalContracts';
import {
  prepareJournalJSON,
  journalGrant,
  sealJournalFrame,
  openJournalFrame,
  journalDigestBytes,
  readJournalDigest,
} from './bookLoreJournalCrypto';
import { getCreationFrame, type CreationFrameKey } from './bookLoreCreationTicketDb';
import {
  emptyCreationCheckpoint,
  readCreationCheckpointOutcome,
  creationOutcomeHash,
  type CreationCheckpointBundle,
  type CreationCheckpointOutcome,
} from './bookLoreCreationCheckpointContracts';
import {
  validateCreationCheckpoint,
  mergeCreationCheckpointOutcome,
} from './bookLoreCreationCheckpointBundle';
import type { BookLoreCreationInput } from './bookLoreCreationPlan';
import type { CreationTicketHandle } from './bookLoreCreationTicket';
import type { CreationTicket } from './bookLoreCreationTicketContracts';
import type { CreationDraftOptions } from './bookLoreCreationDraft';

export class CreationCheckpointCollectionRequired extends Error {
  constructor() {
    super('Conclua a coleta da cópia anterior antes de salvar outro progresso.');
  }
}
export function creationCheckpointJournal(
  ticket: CreationTicketHandle,
  input: BookLoreCreationInput,
  options: CreationDraftOptions,
) {
  const frozen = freezeLoreEditValue(input) as BookLoreCreationInput,
    { guard, signal, yieldControl, getKey } = options;
  let busy = false;
  const check = () => {
    guard();
    signal?.throwIfAborted();
  };
  function authorized(t: CreationTicket, write = false) {
    check();
    if (
      !t.identity ||
      !t.draft?.complete ||
      t.releaseRequested ||
      t.discard ||
      t.keyView?.phase !== 'reserved' ||
      (write && (t.cancelRequested || t.jobsClosed || t.parent?.phase === 'adopted'))
    )
      journalFail();
    return t;
  }
  async function copy(write = false) {
    return authorized(await ticket.inspect(), write);
  }
  async function fresh(t: CreationTicket) {
    check();
    const grant = await getKey(t.identity!);
    check();
    const latest = await copy();
    if (!sameJournalIdentity(latest.identity!, t.identity!)) journalFail();
    return journalGrant(grant, t.identity!);
  }
  const key = (t: CreationTicket, b: LoreJournalBlob, n: number): CreationFrameKey => [
    t.uid,
    t.writeId,
    'checkpoint',
    b.generation,
    n,
  ];
  async function openPart(t: CreationTicket, b: LoreJournalBlob, n: number, k: CryptoKey) {
    check();
    const f = await getCreationFrame(key(t, b, n));
    check();
    const bytes = await openJournalFrame(k, t.identity!, 'checkpoint', b, n, f);
    check();
    return bytes;
  }
  async function digest(t: CreationTicket, b: LoreJournalBlob, k: CryptoKey) {
    const bytes = await openPart(t, b, -1, k);
    try {
      return readJournalDigest(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        b,
      );
    } catch {
      return journalFail();
    }
  }
  async function blobRead(t: CreationTicket, b: LoreJournalBlob, role: 'active' | 'pending') {
    if (b.written !== b.chunkCount) journalFail();
    const k = await fresh(t),
      expected = await digest(t, b, k),
      hasher = sha256.create(),
      decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
      text: string[] = [];
    let count = 0;
    for (let n = 0; n < b.chunkCount; n++) {
      const bytes = await openPart(t, b, n, k);
      if (bytes.length !== Math.min(65536, b.byteLength - count)) journalFail();
      count += bytes.length;
      hasher.update(bytes);
      text.push(decoder.decode(bytes, { stream: true }));
    }
    text.push(decoder.decode());
    if (count !== b.byteLength || bytesToHex(hasher.digest()) !== expected.contentHash)
      journalFail();
    let value: unknown;
    try {
      value = JSON.parse(text.join(''));
    } catch {
      return journalFail();
    }
    const bundle = await validateCreationCheckpoint(value, frozen, t, {
      guard,
      signal,
      yieldControl,
    });
    await fresh(t);
    const latest = await copy();
    if (latest.checkpoint?.[role]?.generation !== b.generation) journalFail();
    return bundle;
  }
  async function read() {
    const t = await copy(),
      b = t.checkpoint?.active;
    if (!b) throw Error('O primeiro checkpoint ainda não foi confirmado.');
    return blobRead(t, b, 'active');
  }
  async function promote(generation: string, bundle: CreationCheckpointBundle) {
    check();
    return ticket.mutate((h) => {
      authorized(h, true);
      const c = h.checkpoint,
        b = c?.pending;
      if (!c || !b || b.generation !== generation || b.written !== b.chunkCount || c.garbage)
        journalFail();
      if (c.outcome) {
        if (
          c.outcome.baseGeneration !== c.active?.generation ||
          hash(c.outcome.checkpoint) !== hash(bundle.checkpoint) ||
          (c.outcome.patch &&
            hash(c.outcome.patch.page) !== hash(bundle.pages[c.outcome.patch.offset / 50]))
        )
          journalFail();
      }
      return {
        ...h,
        checkpoint: {
          active: { ...b, complete: true },
          pending: null,
          garbage: c.active ? { blob: c.active, next: 0 } : null,
          outcome: null,
          receipt: c.outcome
            ? { id: c.outcome.id, hash: creationOutcomeHash(c.outcome) }
            : c.receipt,
        },
      };
    });
  }
  async function write(value: CreationCheckpointBundle) {
    check();
    if (busy) throw Error('Um checkpoint desta criação já está em andamento.');
    const captured = freezeLoreEditValue(value);
    busy = true;
    try {
      let t = await copy(true);
      const bundle = await validateCreationCheckpoint(captured, frozen, t, {
          guard,
          signal,
          yieldControl,
        }),
        prepared = await prepareJournalJSON(bundle, { guard, signal, yieldControl });
      if (!t.checkpoint)
        t = await ticket.mutate((h) => {
          authorized(h, true);
          return { ...h, checkpoint: emptyCreationCheckpoint() };
        });
      let c = t.checkpoint!;
      const active = c.active ? await blobRead(t, c.active, 'active') : null;
      t = await copy(true);
      c = t.checkpoint!;
      if (c.outcome) {
        if (!active) journalFail();
        const expected = mergeCreationCheckpointOutcome(active, c.outcome, c.active!.generation);
        await validateCreationCheckpoint(expected, frozen, t, { guard, signal, yieldControl });
        if (hash(bundle) !== hash(expected)) journalFail();
      }
      if (!c.pending && !c.outcome && active && hash(active) === hash(bundle)) return t;
      if (c.garbage) throw new CreationCheckpointCollectionRequired();
      const k = await fresh(t);
      t = await copy(true);
      c = t.checkpoint!;
      if (c.pending) {
        const old = await digest(t, c.pending, k);
        if (
          old.contentHash !== prepared.manifest.contentHash ||
          old.byteLength !== prepared.manifest.byteLength
        )
          journalFail();
      } else {
        const b: LoreJournalBlob = {
            generation: crypto.randomUUID(),
            byteLength: prepared.manifest.byteLength,
            chunkCount: prepared.manifest.chunkCount,
            written: 0,
            complete: false,
          },
          frame = await sealJournalFrame(
            k,
            t.identity!,
            'checkpoint',
            b,
            -1,
            journalDigestBytes(prepared.manifest),
          );
        check();
        t = await ticket.mutate(
          (h) => {
            authorized(h, true);
            if (h.checkpoint?.pending || h.checkpoint?.garbage) journalFail();
            return { ...h, checkpoint: { ...h.checkpoint!, pending: b } };
          },
          [{ key: key(t, b, -1), value: frame }],
        );
      }
      let n = 0;
      for (const bytes of bookLoreJSONParts(prepared.value, { guard, signal, yieldControl })) {
        t = await copy(true);
        const b = t.checkpoint?.pending;
        if (!b) journalFail();
        if (n < b.written) {
          const old = await openPart(t, b, n, k);
          if (old.length !== bytes.length || old.some((v, at) => v !== bytes[at])) journalFail();
        } else {
          if (n !== b.written) journalFail();
          const frame = await sealJournalFrame(k, t.identity!, 'checkpoint', b, n, bytes);
          check();
          t = await ticket.mutate(
            (h) => {
              authorized(h, true);
              const p = h.checkpoint?.pending;
              if (!p || p.generation !== b.generation || p.written !== n) journalFail();
              return { ...h, checkpoint: { ...h.checkpoint!, pending: { ...p, written: n + 1 } } };
            },
            [{ key: key(t, b, n), value: frame }],
          );
        }
        n++;
      }
      t = await copy(true);
      const b = t.checkpoint!.pending!;
      const verified = await blobRead(t, b, 'pending');
      if (hash(verified) !== hash(bundle)) journalFail();
      return await promote(b.generation, verified);
    } finally {
      busy = false;
    }
  }
  async function recordOutcome(value: CreationCheckpointOutcome) {
    guard();
    if (busy) throw Error('Conclua a gravação pendente antes de registrar outro resultado.');
    const captured = freezeLoreEditValue(value),
      t = await ticket.inspect();
    guard();
    const o = readCreationCheckpointOutcome(captured, t);
    return ticket.mutate((h) => {
      guard();
      if (busy) throw Error('Conclua a gravação pendente antes de registrar outro resultado.');
      const c = h.checkpoint;
      if (!c || h.releaseRequested || h.discard || h.jobsClosed || h.cancelRequested) journalFail();
      if (c.receipt?.id === o.id && c.receipt.hash === creationOutcomeHash(o)) return h;
      if (!c.active || c.active.generation !== o.baseGeneration) journalFail();
      if (c.outcome && creationOutcomeHash(c.outcome) !== creationOutcomeHash(o)) journalFail();
      return { ...h, checkpoint: { ...c, outcome: o } };
    });
  }
  async function recover() {
    let t = await copy(),
      c = t.checkpoint;
    if (!c) return null;
    const baseGeneration = c.active?.generation ?? null,
      base = c.active ? await blobRead(t, c.active, 'active') : null;
    t = await copy();
    c = t.checkpoint;
    if (!c || (c.active?.generation ?? null) !== baseGeneration) journalFail();
    if (c.outcome) {
      if (!base || !c.active) journalFail();
      const value = mergeCreationCheckpointOutcome(base, c.outcome, c.active.generation);
      await write(value);
      return read();
    }
    if (c.pending?.written === c.pending?.chunkCount && c.pending) {
      const value = await blobRead(t, c.pending, 'pending');
      await write(value);
      return read();
    }
    t = await copy();
    c = t.checkpoint;
    if ((c?.active?.generation ?? null) !== baseGeneration) journalFail();
    return base;
  }
  async function collect(limit = 50) {
    check();
    if (busy) throw Error('Um checkpoint desta criação já está em andamento.');
    const t = await copy(true);
    if (!t.checkpoint?.garbage) return t;
    // A verified successor is required before deleting any predecessor frame.
    await read();
    await copy(true);
    return ticket.collect(limit, t.checkpoint.active!.generation);
  }
  return Object.freeze({
    inspect: () => ticket.inspect(),
    write,
    read,
    recover,
    recordOutcome,
    collect,
  });
}
