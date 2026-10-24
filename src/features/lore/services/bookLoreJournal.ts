import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readObject } from './bookLoreReadContracts';
import { checkpointJournal } from './bookLoreCheckpointJournal';
import { restoreBookLoreEditOperation } from './bookLoreEditOperation';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreJSONParts, type BookLoreWriteOptions } from './bookLoreWritePayload';
import {
  prepareBookLoreEditOperation,
  type BookLoreEditOperationInput,
  type BookLoreEditPort,
} from './bookLoreEditOperation';
import {
  journalIdentity,
  journalHead,
  journalFail,
  journalWire,
  metadataJournalWire,
  sameJournalIdentity,
  type LoreJournalIdentity,
  type LoreJournalHead,
  type LoreJournalBlob,
  type LoreJournalLane,
  type LoreJournalSection,
  type LoreJournalGrant,
  type LoreJournalUnit,
  type LoreJournalWire,
} from './bookLoreJournalContracts';
import {
  readJournalHead,
  commitJournalHead,
  readJournalFrame,
  journalFrameKey,
  type JournalFrameKey,
} from './bookLoreJournalDb';
import {
  journalCheck,
  prepareJournalJSON,
  journalGrant,
  sealJournalFrame,
  openJournalFrame,
  readJournalDigest,
  journalDigestBytes,
} from './bookLoreJournalCrypto';
export interface LoreJournalOptions extends BookLoreWriteOptions {
  guard: () => void;
  getKey: () => Promise<LoreJournalGrant>;
}
type TextJournalSection = Exclude<LoreJournalSection, 'checkpoint'>;
const stamp = () => crypto.randomUUID();
export async function createBookLoreJournal(
  identity: LoreJournalIdentity,
  options: LoreJournalOptions,
) {
  const i = journalIdentity(identity);
  journalCheck(options);
  const head: LoreJournalHead = {
    schemaVersion: 1,
    identity: i,
    stamp: stamp(),
    cancelRequested: false,
    draft: null,
    production: null,
    cleanup: null,
    diagnostic: null,
    checkpoint: null,
  };
  const saved = await commitJournalHead(i, null, head);
  journalCheck(options);
  return handle(saved, options);
}
export async function openBookLoreJournal(
  identity: LoreJournalIdentity,
  options: LoreJournalOptions,
) {
  const i = journalIdentity(identity);
  journalCheck(options);
  const current = await readJournalHead(i.uid, i.writeId);
  journalCheck(options);
  if (!current || !sameJournalIdentity(current.identity, i)) journalFail();
  // Explicit local takeover fences stale tabs; it neither decrypts nor sends.
  const claimed = await commitJournalHead(i, current.stamp, { ...current, stamp: stamp() });
  journalCheck(options);
  return handle(claimed, options);
}
function handle(initial: LoreJournalHead, options: LoreJournalOptions) {
  let head = initial,
    queue = Promise.resolve(),
    encryptionKey: CryptoKey | null = null;
  const active = new Set<TextJournalSection>();
  const io = (cleanup = false): BookLoreWriteOptions =>
    cleanup ? { ...options, signal: undefined } : options;
  const check = (cleanup = false) => journalCheck(io(cleanup));
  const blobAt = (h: LoreJournalHead, s: TextJournalSection) =>
    s === 'draft' ? h.draft : (h.production?.blob ?? null);
  async function freshKey() {
    check();
    const grant = await options.getKey();
    check();
    return journalGrant(grant, head.identity);
  }
  async function inspect() {
    check(true);
    const current = await readJournalHead(head.identity.uid, head.identity.writeId);
    check(true);
    if (
      !current ||
      current.stamp !== head.stamp ||
      !sameJournalIdentity(current.identity, head.identity)
    )
      journalFail();
    return current;
  }
  function mutate(
    update: (h: LoreJournalHead) => LoreJournalHead,
    adds: Parameters<typeof commitJournalHead>[3] = [],
    removes: JournalFrameKey[] = [],
  ) {
    const result = queue.then(async () => {
      check(true);
      const next = journalHead(
        { ...update(head), stamp: stamp() },
        head.identity.uid,
        head.identity.writeId,
      );
      const saved = await commitJournalHead(head.identity, head.stamp, next, adds, removes);
      head = saved;
      check(true);
      return saved;
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  const frame = (section: LoreJournalSection, blob: LoreJournalBlob, index: number) =>
    readJournalFrame(journalFrameKey(head.identity, section, blob.generation, index));
  async function digest(key: CryptoKey, section: LoreJournalSection, blob: LoreJournalBlob) {
    check();
    const seal = await frame(section, blob, -1);
    check();
    const bytes = await openJournalFrame(key, head.identity, section, blob, -1, seal);
    check();
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return journalFail();
    }
    return readJournalDigest(value, blob);
  }
  async function draft(value: unknown): Promise<BookLoreEditOperationInput> {
    const v = readObject(freezeLoreEditValue(value), ['uid', 'writeId', 'source', 'changes']),
      i = head.identity,
      input = v as unknown as BookLoreEditOperationInput;
    if (
      input.uid !== i.uid ||
      input.writeId !== i.writeId ||
      input.source.bookId !== i.bookId ||
      input.source.id !== i.loreId ||
      input.source.sourceToken !== i.sourceToken
    )
      journalFail();
    const op = await prepareBookLoreEditOperation(
      input,
      {
        call() {
          throw Error('Journal never sends during validation.');
        },
      },
      io(),
    );
    check();
    if (op.snapshot().intentHash !== i.intentHash) journalFail();
    return input;
  }
  async function write(
    section: TextJournalSection,
    value: unknown,
    metadata?: Omit<LoreJournalUnit, 'state' | 'blob'>,
  ) {
    check();
    if (active.has(section)) throw Error('Uma cópia desta operação já está em andamento.');
    active.add(section);
    try {
      const prepared = await prepareJournalJSON(
        value,
        io(),
        section === 'production' ? 262144 : Number.MAX_SAFE_INTEGER,
      );
      encryptionKey ??= await freshKey();
      const key = encryptionKey;
      const previous = section === 'production' ? head.production : null;
      const replacing = !!previous && previous.requestHash !== metadata?.requestHash;
      if (replacing && previous.state !== 'confirmed') journalFail();
      const existing = replacing ? null : blobAt(head, section);
      if (existing) {
        const old = await digest(key, section, existing);
        if (
          old.contentHash !== prepared.manifest.contentHash ||
          old.byteLength !== prepared.manifest.byteLength
        )
          journalFail();
      } else {
        const blob: LoreJournalBlob = {
            generation: stamp(),
            byteLength: prepared.manifest.byteLength,
            chunkCount: prepared.manifest.chunkCount,
            written: 0,
            complete: false,
          },
          seal = await sealJournalFrame(
            key,
            head.identity,
            section,
            blob,
            -1,
            journalDigestBytes(prepared.manifest),
          );
        check();
        await mutate(
          (h) => {
            if (
              blobAt(h, section) &&
              !(
                section === 'production' &&
                h.production?.state === 'confirmed' &&
                h.production.requestHash !== metadata?.requestHash
              )
            )
              journalFail();
            if (section === 'draft') return { ...h, draft: blob };
            if (!metadata || h.cancelRequested || !h.draft?.complete) journalFail();
            return { ...h, production: { ...metadata, state: 'sealing', blob } };
          },
          [{ key: journalFrameKey(head.identity, section, blob.generation, -1), value: seal }],
          replacing && previous.blob
            ? Array.from({ length: previous.blob.written + 1 }, (_, n) =>
                journalFrameKey(head.identity, 'production', previous.blob!.generation, n - 1),
              )
            : [],
        );
      }
      let index = 0;
      for (const bytes of bookLoreJSONParts(prepared.value, io())) {
        if (section === 'production' && head.cancelRequested) journalFail();
        const blob = blobAt(head, section);
        if (!blob) journalFail();
        if (index >= blob.written) {
          const sealed = await sealJournalFrame(key, head.identity, section, blob, index, bytes);
          check();
          const at = index;
          await mutate(
            (h) => {
              const current = blobAt(h, section);
              if (!current || current.generation !== blob.generation || current.written !== at)
                journalFail();
              const next = { ...current, written: at + 1 };
              return section === 'draft'
                ? { ...h, draft: next }
                : { ...h, production: { ...h.production!, blob: next } };
            },
            [{ key: journalFrameKey(head.identity, section, blob.generation, at), value: sealed }],
          );
        } else {
          await (options.yieldControl?.() ??
            new Promise<void>((resolve) => setTimeout(resolve, 0)));
          check();
        }
        index++;
      }
      await mutate((h) => {
        const blob = blobAt(h, section);
        if (!blob || blob.written !== blob.chunkCount || index !== blob.chunkCount) journalFail();
        const next = { ...blob, complete: true };
        return section === 'draft'
          ? { ...h, draft: next }
          : { ...h, production: { ...h.production!, state: 'pending', blob: next } };
      });
      return head;
    } finally {
      active.delete(section);
    }
  }
  async function read(section: TextJournalSection) {
    const current = await inspect(),
      blob = blobAt(current, section);
    if (!blob || blob.written !== blob.chunkCount) journalFail();
    const key = await freshKey(),
      manifest = await digest(key, section, blob),
      hasher = sha256.create(),
      decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
      text: string[] = [];
    let count = 0;
    try {
      for (let index = 0; index < blob.chunkCount; index++) {
        check();
        const stored = await frame(section, blob, index);
        check();
        const bytes = await openJournalFrame(key, head.identity, section, blob, index, stored);
        check();
        if (bytes.length !== Math.min(65536, blob.byteLength - index * 65536)) journalFail();
        count += bytes.length;
        hasher.update(bytes);
        text.push(decoder.decode(bytes, { stream: true }));
      }
      text.push(decoder.decode());
    } catch {
      journalFail();
    }
    check();
    const latest = await inspect(),
      again = blobAt(latest, section);
    if (
      !again ||
      again.written !== again.chunkCount ||
      again.generation !== blob.generation ||
      count !== manifest.byteLength ||
      bytesToHex(hasher.digest()) !== manifest.contentHash
    )
      journalFail();
    try {
      return { value: JSON.parse(text.join('')) as unknown, blob };
    } catch {
      return journalFail();
    }
  }
  async function sealRecovered(section: TextJournalSection, original: LoreJournalBlob) {
    const latest = await inspect(),
      current = blobAt(latest, section);
    if (
      !current ||
      current.generation !== original.generation ||
      current.written !== current.chunkCount
    )
      journalFail();
    if (current.complete) return latest;
    return mutate((h) => {
      const blob = blobAt(h, section);
      if (!blob || blob.generation !== original.generation || blob.written !== blob.chunkCount)
        journalFail();
      const complete = { ...blob, complete: true };
      return section === 'draft'
        ? { ...h, draft: complete }
        : { ...h, production: { ...h.production!, state: 'pending', blob: complete } };
    });
  }
  async function writeDraft(value: BookLoreEditOperationInput) {
    const frozen = await draft(value);
    await write('draft', frozen);
    return inspect();
  }
  async function readDraft() {
    const decoded = await read('draft');
    const value = await draft(decoded.value);
    await freshKey();
    await sealRecovered('draft', decoded.blob);
    return value;
  }
  async function stagePending(value: LoreJournalWire) {
    const { wire, metadata } = journalWire(value, head.identity);
    check(metadata.lane !== 'production');
    const old = head[metadata.lane];
    if (old && old.requestHash !== metadata.requestHash && old.state !== 'confirmed') journalFail();
    if (metadata.lane !== 'production') {
      await mutate((h) => ({
        ...h,
        cancelRequested: h.cancelRequested || metadata.lane === 'cleanup',
        [metadata.lane]: {
          ...metadata,
          state: old?.requestHash === metadata.requestHash ? old.state : 'pending',
          blob: null,
        },
      }));
      return head[metadata.lane]!;
    }
    if (head.cancelRequested || !head.draft?.complete) journalFail();
    if (old?.requestHash === metadata.requestHash && old.state === 'confirmed') return old;
    await write('production', wire, metadata);
    return head.production!;
  }
  async function readPending(lane: LoreJournalLane) {
    const current = await inspect(),
      unit = current[lane];
    if (!unit) return null;
    const decoded = lane === 'production' ? await read('production') : null;
    const raw = decoded ? decoded.value : metadataJournalWire(unit),
      parsed = journalWire(raw, head.identity);
    if (parsed.metadata.requestHash !== unit.requestHash || parsed.metadata.lane !== lane)
      journalFail();
    if (decoded) {
      await freshKey();
      const latest = await sealRecovered('production', decoded.blob);
      if (latest.production?.requestHash !== unit.requestHash) journalFail();
      return { unit: latest.production, wire: parsed.wire };
    }
    return { unit, wire: parsed.wire };
  }
  async function requestCancel() {
    check(true);
    return mutate((h) => ({ ...h, cancelRequested: true }));
  }
  async function confirmPending(lane: LoreJournalLane, requestHash: string) {
    check(true);
    return mutate((h) => {
      const unit = h[lane];
      if (!unit || unit.requestHash !== requestHash || unit.state === 'sealing') journalFail();
      return { ...h, [lane]: { ...unit, state: 'confirmed' } };
    });
  }
  async function send(port: BookLoreEditPort, value: LoreJournalWire) {
    const { wire, metadata } = journalWire(value, head.identity),
      pending = await stagePending(wire),
      current = await inspect();
    check(metadata.lane !== 'production');
    if (
      pending.state !== 'pending' ||
      current[metadata.lane]?.requestHash !== metadata.requestHash ||
      (metadata.lane === 'production' && current.cancelRequested)
    )
      journalFail();
    const response = await port.call(wire.method, wire.input);
    check(metadata.lane !== 'production');
    // The coordinator must parse/accept the response before confirmPending.
    return response;
  }
  const checkpoints = checkpointJournal({ options, inspect, mutate });
  async function restoreCheckpointOperation(
    port: BookLoreEditPort,
    writeOptions: BookLoreWriteOptions = {},
  ) {
    const input = await readDraft(),
      bundle = await checkpoints.readCheckpoint();
    if (!bundle) journalFail();
    const recoveryStamp = (await inspect()).stamp;
    const operation = await restoreBookLoreEditOperation(
      input,
      {
        checkpoint: bundle.checkpoint,
        controlsPage: (offset) => Promise.resolve(bundle.pages[offset / 50]),
      },
      port,
      {
        ...writeOptions,
        guard: () => {
          check(true);
          writeOptions.guard?.();
        },
      },
    );
    await freshKey();
    writeOptions.guard?.();
    const latest = await inspect();
    writeOptions.guard?.();
    if (latest.stamp !== recoveryStamp) journalFail();
    if (latest.cancelRequested) operation.requestCancel();
    else if (!bundle.checkpoint.cancelRequested) writeOptions.signal?.throwIfAborted();
    return operation;
  }
  return Object.freeze({
    ...checkpoints,
    restoreCheckpointOperation,
    inspect,
    writeDraft,
    readDraft,
    stagePending,
    readPending,
    requestCancel,
    confirmPending,
    send,
  });
}
