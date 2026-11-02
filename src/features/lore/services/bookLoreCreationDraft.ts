import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareBookLoreCreationOperation } from './bookLoreCreationOperation';
import type { BookLoreCreationInput } from './bookLoreCreationPlan';
import { bookLoreJSONParts, type BookLoreWriteOptions } from './bookLoreWritePayload';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import {
  journalGrant,
  prepareJournalJSON,
  sealJournalFrame,
  openJournalFrame,
  readJournalDigest,
  journalDigestBytes,
} from './bookLoreJournalCrypto';
import {
  journalFail,
  sameJournalIdentity,
  type LoreJournalGrant,
  type LoreJournalBlob,
  type LoreJournalIdentity,
} from './bookLoreJournalContracts';
import { creationFrameKey, getCreationFrame } from './bookLoreCreationTicketDb';
import type { CreationTicketHandle } from './bookLoreCreationTicket';
import type { CreationTicket } from './bookLoreCreationTicketContracts';

export interface CreationDraftOptions extends BookLoreWriteOptions {
  guard: () => void;
  getKey: (identity: LoreJournalIdentity) => Promise<LoreJournalGrant>;
}
export function creationDraftStore(ticket: CreationTicketHandle, options: CreationDraftOptions) {
  const { guard, signal, yieldControl, getKey } = options;
  const check = () => {
    guard();
    signal?.throwIfAborted();
  };
  let writing = false;
  const copy = async () => {
    check();
    const t = await ticket.inspect();
    check();
    if (!t.identity || t.releaseRequested || t.discard || t.keyView?.phase !== 'reserved')
      journalFail();
    return t;
  };
  async function fresh(t: CreationTicket) {
    check();
    const grant = await getKey(t.identity!);
    check();
    const latest = await copy();
    if (!sameJournalIdentity(latest.identity!, t.identity!)) journalFail();
    return journalGrant(grant, t.identity!);
  }
  async function validate(value: unknown, t: CreationTicket): Promise<BookLoreCreationInput> {
    const input = freezeLoreEditValue(value) as BookLoreCreationInput;
    const op = await prepareBookLoreCreationOperation(
      input,
      {
        call() {
          throw Error('Validation never sends.');
        },
      },
      { guard, signal, yieldControl },
    );
    check();
    const s = op.snapshot();
    if (
      s.uid !== t.uid ||
      s.writeId !== t.writeId ||
      s.bookId !== t.bookId ||
      s.loreId !== t.loreId ||
      s.creationId !== t.creationId ||
      s.intentHash !== t.intentHash
    )
      journalFail();
    return input;
  }
  const readFrame = async (t: CreationTicket, blob: LoreJournalBlob, n: number) => {
    check();
    const frame = await getCreationFrame(creationFrameKey(t, blob.generation, n));
    check();
    return frame;
  };
  async function manifest(key: CryptoKey, t: CreationTicket, blob: LoreJournalBlob) {
    const raw = await openJournalFrame(
      key,
      t.identity!,
      'draft',
      blob,
      -1,
      await readFrame(t, blob, -1),
    );
    check();
    try {
      return readJournalDigest(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
        blob,
      );
    } catch {
      return journalFail();
    }
  }
  async function saveDraft(value: BookLoreCreationInput) {
    if (writing) throw Error('Uma cópia desta preparação já está em andamento.');
    writing = true;
    try {
      let t = await copy();
      const input = await validate(value, t),
        prepared = await prepareJournalJSON(input, { guard, signal, yieldControl });
      const key = await fresh(t);
      t = await copy();
      if (t.draft) {
        const old = await manifest(key, t, t.draft);
        if (
          old.contentHash !== prepared.manifest.contentHash ||
          old.byteLength !== prepared.manifest.byteLength
        )
          journalFail();
      } else {
        const blob: LoreJournalBlob = {
          generation: crypto.randomUUID(),
          byteLength: prepared.manifest.byteLength,
          chunkCount: prepared.manifest.chunkCount,
          written: 0,
          complete: false,
        };
        const seal = await sealJournalFrame(
          key,
          t.identity!,
          'draft',
          blob,
          -1,
          journalDigestBytes(prepared.manifest),
        );
        check();
        t = await ticket.mutate(
          (h) => {
            if (
              h.draft ||
              h.releaseRequested ||
              h.discard ||
              !h.identity ||
              !sameJournalIdentity(h.identity, t.identity!)
            )
              journalFail();
            return { ...h, draft: blob };
          },
          [{ key: creationFrameKey(t, blob.generation, -1), value: seal }],
        );
      }
      let index = 0;
      for (const bytes of bookLoreJSONParts(prepared.value, { guard, signal, yieldControl })) {
        t = await copy();
        const blob = t.draft;
        if (!blob) journalFail();
        if (index < blob.written) {
          const old = await openJournalFrame(
            key,
            t.identity!,
            'draft',
            blob,
            index,
            await readFrame(t, blob, index),
          );
          if (old.length !== bytes.length || old.some((n, at) => n !== bytes[at])) journalFail();
        } else {
          if (index !== blob.written || blob.complete) journalFail();
          const sealed = await sealJournalFrame(key, t.identity!, 'draft', blob, index, bytes);
          check();
          t = await ticket.mutate(
            (h) => {
              if (
                !h.draft ||
                h.draft.generation !== blob.generation ||
                h.draft.written !== index ||
                h.releaseRequested ||
                h.discard
              )
                journalFail();
              return { ...h, draft: { ...h.draft, written: index + 1 } };
            },
            [{ key: creationFrameKey(t, blob.generation, index), value: sealed }],
          );
        }
        index++;
      }
      t = await copy();
      await fresh(t);
      check();
      if (!t.draft || t.draft.written !== t.draft.chunkCount) journalFail();
      if (!t.draft.complete)
        await ticket.mutate((h) => {
          if (!h.draft || h.releaseRequested || h.discard || h.draft.written !== h.draft.chunkCount)
            journalFail();
          return { ...h, draft: { ...h.draft, complete: true } };
        });
      return ticket.inspect();
    } finally {
      writing = false;
    }
  }
  async function readDraft() {
    const t = await copy(),
      blob = t.draft;
    if (!blob || blob.written !== blob.chunkCount)
      throw Error('A primeira cópia ainda não foi confirmada.');
    const key = await fresh(t),
      expected = await manifest(key, t, blob),
      hasher = sha256.create();
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
      text: string[] = [];
    let count = 0;
    for (let n = 0; n < blob.chunkCount; n++) {
      const bytes = await openJournalFrame(
        key,
        t.identity!,
        'draft',
        blob,
        n,
        await readFrame(t, blob, n),
      );
      if (bytes.length !== Math.min(65536, blob.byteLength - count)) journalFail();
      count += bytes.length;
      hasher.update(bytes);
      text.push(decoder.decode(bytes, { stream: true }));
    }
    text.push(decoder.decode());
    if (count !== blob.byteLength || bytesToHex(hasher.digest()) !== expected.contentHash)
      journalFail();
    let raw: unknown;
    try {
      raw = JSON.parse(text.join(''));
    } catch {
      return journalFail();
    }
    const input = await validate(raw, t);
    await fresh(t);
    const latest = await copy();
    if (
      !latest.draft ||
      latest.draft.generation !== blob.generation ||
      latest.draft.written !== blob.chunkCount ||
      !sameJournalIdentity(latest.identity!, t.identity!)
    )
      journalFail();
    if (!latest.draft.complete)
      await ticket.mutate((h) => {
        if (!h.draft || h.draft.generation !== blob.generation || h.releaseRequested || h.discard)
          journalFail();
        return { ...h, draft: { ...h.draft, complete: true } };
      });
    return input;
  }
  return Object.freeze({ saveDraft, readDraft });
}
