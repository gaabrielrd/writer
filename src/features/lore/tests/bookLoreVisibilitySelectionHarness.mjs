import { vi } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreWriteRecoveryService } from '../../../../functions/src/bookLoreWriteRecovery.mjs';
import { createBookLoreEditOutcomeService } from '../../../../functions/src/bookLoreEditOutcome.mjs';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreEditOutcomeClient } from '../services/bookLoreEditOutcome.ts';
import { createBookLoreManualOperation } from '../services/bookLoreManualOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { readJournalPreparation } from '../services/bookLoreJournalDb.ts';
import {
  createVisibilitySelection,
  visibilityScope,
  visibilityEqual,
} from '../services/bookLoreVisibilitySelectionContracts.ts';
import {
  bookLoreVisibilitySelectionStore,
  VISIBILITY_SELECTION_DB,
} from '../services/bookLoreVisibilitySelectionDb.ts';
import { openBookLoreVisibilitySelection } from '../services/bookLoreVisibilitySelectionOperation.ts';
export async function visibilityFixture({
  count = 2,
  value = true,
  publics = [],
  omitPublic = [],
  modes = [],
  selectionId = 'selection-visibility',
} = {}) {
  const parent = installLoreJournalHarness(),
    parentIdb = globalThis.indexedDB,
    encrypted = installLoreJournalHarness(),
    encryptedIdb = globalThis.indexedDB;
  vi.stubGlobal('indexedDB', {
    open(name, version) {
      return (name === VISIBILITY_SELECTION_DB ? parentIdb : encryptedIdb).open(name, version);
    },
  });
  const f = adventureImportDb({ nativeUpdates: true }),
    uid = 'author',
    bookId = 'book',
    calls = [],
    keys = [];
  let current = true,
    keyAllowed = true,
    intercept = null;
  const guard = () => {
      if (!current) throw Error('actor changed');
    },
    read = createBookLoreReadService({ db: f.db }),
    reader = createBookLoreReadClient((method, input) => read[method](uid, input), guard, {
      tokenVersion: 2,
    }),
    edit = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    recovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => 8000 }),
    proof = createBookLoreEditOutcomeService({ db: f.db });
  const members = [],
    seeds = [];
  for (let n = 0; n < count; n++) {
    const data = {
      name: 'Literal 🌙 ' + n,
      category: 'other',
      details: 'NATIVE_PRIVATE_' + n,
      ...(omitPublic.includes(n) ? {} : { isPublic: publics[n] ?? false }),
      createdAt: 1000,
      updatedAt: 1000,
    };
    const seed =
      modes[n] === 'v2'
        ? await seedBookLoreGeneration(f.db, {
            uid,
            bookId,
            id: 'entity-' + n,
            baseData: data,
            fields: { isPublic: publics[n] ?? false },
          })
        : await seedBookLoreRead(f.db, {
            uid,
            bookId,
            id: 'entity-' + n,
            inline: modes[n] !== 'v1',
            data,
          });
    const h = await reader.metadata(bookId, seed.id);
    seeds.push(seed);
    members.push({ loreId: seed.id, sourceToken: h.readToken });
  }
  const input = { uid, bookId, selectionId, value, members },
    pack = createVisibilitySelection(input),
    store = bookLoreVisibilitySelectionStore(pack.root.manifest.identity, guard);
  async function invoke(kind, method, input, work) {
    guard();
    calls.push({ kind, method, input: structuredClone(input) });
    const result = intercept ? await intercept(kind, method, input, work) : await work();
    guard();
    return result;
  }
  const native = {
    call: (method, input) =>
      invoke('edit', method, input, () => edit.bookLoreEdit(uid, { method, input })),
    outcome: createBookLoreEditOutcomeClient(
      uid,
      (method, input) =>
        invoke('outcome', method, input, () => proof.bookLoreEditOutcome(uid, input)),
      guard,
    ),
  };
  const journalOptions = (identity) => ({
    guard,
    yieldControl: async () => {},
    async getKey() {
      guard();
      keys.push(identity.writeId);
      if (!keyAllowed) throw Error('key denied');
      const data = await recovery.getBookLoreEditRecoveryKey(uid, {
        writeId: identity.writeId,
        requestHash: identity.requestHash,
        jobToken: identity.jobToken,
      });
      const raw = Uint8Array.from(Buffer.from(data.keyBase64, 'base64')),
        key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
      raw.fill(0);
      guard();
      return { identity, key };
    },
  });
  const manualEnv = {
    uid,
    guard,
    edit: { call: native.call },
    recovery: {
      call: (method, input) =>
        invoke('recovery', method, input, () => recovery[method](uid, input)),
    },
    createJournal: (identity) => createBookLoreJournal(identity, journalOptions(identity)),
    openJournal: (identity) => openBookLoreJournal(identity, journalOptions(identity)),
  };
  const environment = {
    guard,
    native,
    reader,
    async openChild(entry, beforeUnit, source) {
      const scope = visibilityScope(entry.root, entry.member),
        ticket = await readJournalPreparation(uid, scope.writeId);
      if (
        ticket &&
        !visibilityEqual(ticket.intent, {
          writeId: scope.writeId,
          bookId,
          loreId: scope.loreId,
          sourceToken: scope.sourceToken,
          intentHash: entry.state.intentHash,
        })
      )
        throw Error('wrong protected scope');
      if (!ticket && !source) {
        const error = new Error('protected copy missing');
        error.code =
          entry.state.upload || entry.state.edit
            ? 'visibility-recovery-missing'
            : 'visibility-source-required';
        throw error;
      }
      return createBookLoreManualOperation(
        scope.writeId,
        manualEnv,
        ticket
          ? undefined
          : { uid, writeId: scope.writeId, source, changes: [{ field: 'isPublic', value }] },
        { beforeUnit, yieldControl: async () => {} },
      );
    },
  };
  return {
    ...f,
    parent,
    encrypted,
    uid,
    bookId,
    input,
    pack,
    store,
    environment,
    reader,
    native,
    calls,
    keys,
    seeds,
    async make() {
      await store.init(pack);
      return openBookLoreVisibilitySelection(pack.root.manifest.identity, store, environment);
    },
    resume: () => openBookLoreVisibilitySelection(pack.root.manifest.identity, store, environment),
    intercept: (fn) => {
      intercept = fn;
    },
    current: (v) => {
      current = v;
    },
    keyAllowed: (v) => {
      keyAllowed = v;
    },
    dropChild(writeId) {
      for (const rows of encrypted.stores.values())
        for (const [key, row] of rows)
          if (Array.isArray(row.k) && row.k[0] === uid && row.k[1] === writeId) rows.delete(key);
    },
  };
}
export async function visibilityReady(op) {
  for (let n = 0; n < 1000 && op.snapshot().phase !== 'ready'; n++) await op.advance();
  if (op.snapshot().phase !== 'ready')
    throw Error('visibility did not become ready: ' + JSON.stringify(op.snapshot()));
}
export async function finishVisibility(op) {
  for (
    let n = 0;
    n < 30000 && !['complete', 'partial', 'cancelled'].includes(op.snapshot().phase);
    n++
  )
    await op.apply();
  if (!['complete', 'partial', 'cancelled'].includes(op.snapshot().phase))
    throw Error('visibility did not finish');
}
