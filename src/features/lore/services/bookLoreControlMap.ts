import { readObject, readCount, readHash } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import {
  journalFail,
  journalWire,
  type LoreJournalIdentity,
  type LoreJournalHead,
} from './bookLoreJournalContracts';
import {
  emptyLoreControlWorker,
  loreControlJobId,
  loreInspectionControl,
  readLoreControlRecord,
  type LoreControlPage,
  type LoreControlRef,
} from './bookLoreControlContracts';
import {
  readJournalControlRecord,
  type JournalControlKey,
  type commitJournalHead,
} from './bookLoreJournalDb';
import type { BookLoreEditCheckpoint } from './bookLoreEditCheckpoint';
import type {
  BookLoreEditOperationSnapshot,
  BookLoreEditControlPage,
} from './bookLoreEditOperation';
export interface LoreControlContext {
  inspect(this: void): Promise<LoreJournalHead>;
  mutate(
    this: void,
    update: (h: LoreJournalHead) => LoreJournalHead,
    adds?: Parameters<typeof commitJournalHead>[3],
    removes?: Parameters<typeof commitJournalHead>[4],
  ): Promise<LoreJournalHead>;
}
export interface BookLoreControlMap {
  schemaVersion: 1;
  uid: string;
  writeId: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  intentHash: string;
  count: number;
  mapHash: string;
  edit: LoreControlRef | null;
  pages: LoreControlPage[];
}
export function captureBookLoreControlMap(operation: {
  snapshot(): BookLoreEditOperationSnapshot;
  checkpoint(): BookLoreEditCheckpoint;
  controlsPage(offset: number, limit: number): BookLoreEditControlPage;
}): BookLoreControlMap {
  const s = operation.snapshot(),
    pages: LoreControlPage[] = [];
  let digest = hash({
    domain: 'writer-lore-cleanup-controls',
    intentHash: s.intentHash,
    count: s.uploads.count,
  });
  for (let offset = 0; offset < s.uploads.count; offset += 50) {
    const page = operation.controlsPage(offset, Math.min(50, s.uploads.count - offset));
    if (page.intentHash !== s.intentHash) journalFail();
    const items = page.items.map(({ id, startHash }) => ({ id, startHash }));
    for (const item of items) digest = hash({ previous: digest, ...item });
    pages.push({ kind: 'page', offset, items });
  }
  let edit: LoreControlRef | null = s.edit ? { id: s.edit.id, startHash: s.edit.startHash } : null;
  if (!edit && s.pending.production?.method === 'startBookLoreEditReservation') {
    const pending = operation.checkpoint().pending.production;
    const parsed = journalWire(pending, {
      bookId: s.bookId,
      loreId: s.loreId,
      sourceToken: s.sourceToken,
    });
    edit = { id: parsed.metadata.id, startHash: parsed.metadata.startHash };
  }
  return freezeLoreEditValue({
    schemaVersion: 1,
    uid: s.uid,
    writeId: s.writeId,
    bookId: s.bookId,
    loreId: s.loreId,
    sourceToken: s.sourceToken,
    intentHash: s.intentHash,
    count: s.uploads.count,
    mapHash: digest,
    edit,
    pages,
  }) as BookLoreControlMap;
}
function readMap(value: unknown, i: LoreJournalIdentity): BookLoreControlMap {
  const v = readObject(freezeLoreEditValue(value), [
      'schemaVersion',
      'uid',
      'writeId',
      'bookId',
      'loreId',
      'sourceToken',
      'intentHash',
      'count',
      'mapHash',
      'edit',
      'pages',
    ]),
    count = readCount(v.count);
  if (
    v.schemaVersion !== 1 ||
    ['uid', 'writeId', 'bookId', 'loreId', 'sourceToken', 'intentHash'].some(
      (k) => v[k] !== i[k as keyof LoreJournalIdentity],
    ) ||
    !Array.isArray(v.pages) ||
    v.pages.length !== Math.ceil(count / 50)
  )
    journalFail();
  let digest = hash({ domain: 'writer-lore-cleanup-controls', intentHash: i.intentHash, count });
  for (const [index, raw] of v.pages.entries()) {
    const p = readLoreControlRecord(raw),
      offset = index * 50,
      end = Math.min(offset + 50, count);
    if (p.kind !== 'page' || p.offset !== offset || p.items.length !== end - offset) journalFail();
    for (const [n, item] of p.items.entries()) {
      if (item.id !== loreControlJobId(i, 'lore-field', offset + n)) journalFail();
      digest = hash({ previous: digest, ...item });
    }
  }
  if (readHash(v.mapHash) !== digest) journalFail();
  if (v.edit !== null) {
    const e = readObject(v.edit, ['id', 'startHash']);
    if (e.id !== loreControlJobId(i, 'lore-edit')) journalFail();
    readHash(e.startHash);
  }
  return v as unknown as BookLoreControlMap;
}
export function journalControlMap({ inspect, mutate }: LoreControlContext) {
  let writing = false;
  const key = (
    i: LoreJournalIdentity,
    generation: string,
    index: number | string,
  ): JournalControlKey => [i.uid, i.writeId, 'controls', generation, index];
  async function writeControlMap(value: unknown) {
    if (writing) throw Error('O mapa de controles já está em gravação.');
    writing = true;
    try {
      const frozen = freezeLoreEditValue(value);
      let head = await inspect();
      const map = readMap(frozen, head.identity);
      if (!head.controls) {
        head = await mutate((h) => {
          if (h.controls) journalFail();
          return {
            ...h,
            controls: {
              generation: crypto.randomUUID(),
              count: map.count,
              pages: map.pages.length,
              written: 0,
              ready: map.pages.length === 0,
              mapHash: map.mapHash,
              inspection: loreInspectionControl(h.identity),
              edit: map.edit,
              worker: emptyLoreControlWorker(),
            },
          };
        });
      }
      if (head.controls!.mapHash !== map.mapHash || head.controls!.count !== map.count)
        journalFail();
      if (map.edit) {
        if (head.controls!.edit && head.controls!.edit.startHash !== map.edit.startHash)
          journalFail();
        if (!head.controls!.edit)
          head = await mutate((h) => {
            if (!h.controls || h.controls.worker.phase !== 'idle' || h.controls.edit) journalFail();
            return { ...h, controls: { ...h.controls, edit: map.edit } };
          });
      }
      const generation = head.controls!.generation;
      for (const [index, page] of map.pages.entries()) {
        head = await inspect();
        const c = head.controls!;
        if (c.generation !== generation || c.mapHash !== map.mapHash) journalFail();
        if (index < c.written) continue;
        const adds: NonNullable<Parameters<typeof commitJournalHead>[3]> = [
          { key: key(head.identity, generation, index), value: page },
          ...page.items.map((item, n) => ({
            key: key(head.identity, generation, item.id),
            value: { kind: 'upload' as const, index: page.offset + n, ...item },
          })),
        ];
        await mutate((h) => {
          const c = h.controls;
          if (!c || c.generation !== generation || c.written !== index || c.worker.phase !== 'idle')
            journalFail();
          return { ...h, controls: { ...c, written: index + 1, ready: index + 1 === c.pages } };
        }, adds);
      }
      return await inspect();
    } finally {
      writing = false;
    }
  }
  async function readControlMapPage(offset: number): Promise<BookLoreEditControlPage> {
    const h = await inspect(),
      c = h.controls;
    if (!c?.ready || readCount(offset) % 50 !== 0 || offset >= c.count) journalFail();
    const p = await readJournalControlRecord(key(h.identity, c.generation, offset / 50));
    await inspect();
    const end = Math.min(offset + 50, c.count);
    if (p.kind !== 'page' || p.offset !== offset || p.items.length !== end - offset) journalFail();
    for (const [n, item] of p.items.entries())
      if (item.id !== loreControlJobId(h.identity, 'lore-field', offset + n)) journalFail();
    return freezeLoreEditValue({
      intentHash: h.identity.intentHash,
      items: p.items.map((item) => ({ ...item, progress: null })),
      nextOffset: end < c.count ? end : null,
    }) as BookLoreEditControlPage;
  }
  async function uploadAt(index: number): Promise<LoreControlRef> {
    const head = await inspect(),
      c = head.controls;
    if (!c?.ready || readCount(index) >= c.count) journalFail();
    const p = await readJournalControlRecord(
      key(head.identity, c.generation, Math.floor(index / 50)),
    );
    await inspect();
    if (p.kind !== 'page' || p.offset !== Math.floor(index / 50) * 50) journalFail();
    const item = p.items[index % 50];
    if (!item || item.id !== loreControlJobId(head.identity, 'lore-field', index)) journalFail();
    return item;
  }
  async function controlById(
    id: string,
  ): Promise<{ kind: 'inspection' | 'upload' | 'edit'; ref: LoreControlRef }> {
    const h = await inspect(),
      c = h.controls;
    if (!c?.ready) journalFail();
    if (id === c.inspection.id) return { kind: 'inspection', ref: c.inspection };
    if (c.edit?.id === id) return { kind: 'edit', ref: c.edit };
    const record = await readJournalControlRecord(key(h.identity, c.generation, id));
    await inspect();
    if (record.kind !== 'upload' || record.id !== id || record.index >= c.count) journalFail();
    const item = await uploadAt(record.index);
    if (item.id !== record.id || item.startHash !== record.startHash) journalFail();
    return { kind: 'upload', ref: item };
  }
  async function verifyUploadRef(value: unknown) {
    const ref = readObject(value, ['uploadId', 'startHash', 'jobToken']);
    const known = await controlById(String(ref.uploadId));
    if (known.kind !== 'upload' || known.ref.startHash !== ref.startHash) journalFail();
  }
  async function registerControlEdit(value: unknown) {
    const frozen = freezeLoreEditValue(value);
    const h = await inspect(),
      c = h.controls,
      parsed = journalWire(frozen, h.identity);
    if (
      !c?.ready ||
      parsed.wire.method !== 'startBookLoreEditReservation' ||
      parsed.metadata.id !== loreControlJobId(h.identity, 'lore-edit')
    )
      journalFail();
    const inspection = readObject(parsed.wire.input.inspection, [
      'inspectionId',
      'startHash',
      'jobToken',
    ]);
    if (
      inspection.inspectionId !== c.inspection.id ||
      inspection.startHash !== c.inspection.startHash
    )
      journalFail();
    const fields = readObject(
      parsed.wire.input.fields,
      [],
      ['name', 'category', 'summary', 'details', 'aliases', 'structuredDetails', 'isPublic'],
    );
    for (const ref of Object.values(fields)) if (ref !== null) await verifyUploadRef(ref);
    const ref = { id: parsed.metadata.id, startHash: parsed.metadata.startHash };
    if (c.edit) {
      if (c.edit.id !== ref.id || c.edit.startHash !== ref.startHash) journalFail();
      return h;
    }
    return mutate((h) => {
      if (!h.controls?.ready || h.controls.worker.phase !== 'idle' || h.controls.edit)
        journalFail();
      return { ...h, controls: { ...h.controls, edit: ref } };
    });
  }
  async function verifyControlProduction(value: unknown) {
    const h = await inspect();
    if (!h.controls) return;
    if (!h.controls.ready || h.cancelRequested || h.controls.worker.phase !== 'idle') journalFail();
    const parsed = journalWire(value, h.identity);
    if (parsed.metadata.lane !== 'production') journalFail();
    const known = await controlById(parsed.metadata.id);
    if (known.ref.startHash !== parsed.metadata.startHash) journalFail();
    if (parsed.wire.method === 'reserveBookLoreEditUpload')
      await verifyUploadRef(parsed.wire.input.upload);
  }
  return {
    writeControlMap,
    readControlMapPage,
    registerControlEdit,
    uploadAt,
    controlById,
    verifyControlProduction,
  };
}
