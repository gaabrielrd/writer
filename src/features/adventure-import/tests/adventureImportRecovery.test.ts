import { beforeEach, expect, it, vi } from 'vitest';
import * as r from '../services/adventureImportRecovery';
import { describeConfirmedReview } from '../services/adventureImportContracts';
import type { ImportRecoveryKey } from '../model/adventureImport';
import {
  installImportRecoveryHarness,
  review,
  uid,
  id,
  token,
  keyId,
  adventureId,
} from './importTestHelpers';
let harness: ReturnType<typeof installImportRecoveryHarness>;
beforeEach(() => {
  harness = installImportRecoveryHarness();
});
async function key(): Promise<ImportRecoveryKey> {
  return {
    schemaVersion: 1,
    ownerId: uid,
    importId: id,
    jobToken: token,
    adventureId,
    reviewHash: (await describeConfirmedReview(review, id)).start.reviewHash,
    keyId,
    algorithm: 'AES-GCM',
    keyBase64: btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i))),
  };
}
it('cifra sem persistir chave e recupera a revisão inteira sem File', async () => {
  const k = await key(),
    s = await r.sealAdventureImportReview(review, k);
  expect(s.nonce.byteLength).toBe(12);
  expect(s.ciphertext.byteLength).toBeGreaterThan(16);
  expect(JSON.stringify(s)).not.toContain(k.keyBase64);
  expect(new TextDecoder().decode(s.ciphertext)).not.toContain('Chegada');
  expect(await r.openAdventureImportReview(s, k)).toEqual(review);
  const second = await r.sealAdventureImportReview(review, k);
  expect([...second.nonce]).not.toEqual([...s.nonce]);
});
it.each(['ownerId', 'jobToken', 'keyId', 'reviewHash', 'sectionCount', 'nonce', 'ciphertext'])(
  'recusa envelope/tag alterado: %s',
  async (field) => {
    const k = await key(),
      s = await r.sealAdventureImportReview(review, k);
    if (field === 'nonce') s.nonce[0] = s.nonce[0]! ^ 1;
    else if (field === 'ciphertext')
      new Uint8Array(s.ciphertext)[0] = new Uint8Array(s.ciphertext)[0]! ^ 1;
    else if (field === 'sectionCount') s.sectionCount++;
    else Object.assign(s, { [field]: 'd'.repeat(64) });
    await expect(r.openAdventureImportReview(s, k)).rejects.toThrow();
  },
);
it('só confirma reserva quando a transação completa, recusando CAS antigo', async () => {
  const initial = r.newImportRecord(uid, id);
  harness.holdWrites();
  let done = false;
  const writing = r
    .compareLocalAdventureImport(uid, id, null, initial, () => {})
    .then(() => {
      done = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(done).toBe(false);
  harness.release();
  await writing;
  expect(await r.readLocalAdventureImport(uid, id)).toEqual(initial);
  const next = r.nextImportRecord(initial, { journal: null });
  await r.compareLocalAdventureImport(uid, id, initial, next, () => {});
  await expect(r.compareLocalAdventureImport(uid, id, initial, null, () => {})).rejects.toThrow();
  expect(await r.readLocalAdventureImport(uid, id)).toEqual(next);
});
it('aborto/quota de gravação não confirma a reserva nem permite substituição silenciosa', async () => {
  harness.abortWrite();
  await expect(
    r.compareLocalAdventureImport(uid, id, null, r.newImportRecord(uid, id), () => {}),
  ).rejects.toThrow();
  expect(await r.readLocalAdventureImport(uid, id)).toBeNull();
  const record = r.newImportRecord(uid, id);
  harness.rows.set(JSON.stringify([uid, id]), { ...record, schemaVersion: 2 });
  await expect(r.readLocalAdventureImport(uid, id)).rejects.toThrow();
  expect(harness.rows.size).toBe(1);
});
it('compara bytes reais mesmo quando stamp e metadata são iguais', async () => {
  const k = await key(),
    snapshot = await r.sealAdventureImportReview(review, k),
    record = { ...r.newImportRecord(uid, id), snapshot };
  await r.compareLocalAdventureImport(uid, id, null, record, () => {});
  const changed = structuredClone(record);
  new Uint8Array(changed.snapshot.ciphertext)[0] =
    new Uint8Array(changed.snapshot.ciphertext)[0]! ^ 1;
  harness.rows.set(JSON.stringify([uid, id]), changed);
  await expect(r.compareLocalAdventureImport(uid, id, record, null, () => {})).rejects.toThrow();
  expect(r.sameLocalAdventureImport(record, changed)).toBe(false);
});
it('lista somente a conta atual e notifica sem expor conteúdo', async () => {
  const listener = vi.fn(),
    stop = r.subscribeAdventureImportRecovery(uid, listener),
    record = r.newImportRecord(uid, id);
  await r.compareLocalAdventureImport(uid, id, null, record, () => {});
  harness.rows.set(JSON.stringify(['other', id]), r.newImportRecord('other', id));
  expect(await r.listLocalAdventureImports(uid)).toEqual([record]);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  await r.compareLocalAdventureImport(uid, id, record, null, () => {});
  expect(listener).toHaveBeenCalledOnce();
});
it('bloqueia mutação sem Web Locks e mantém consultas disponíveis', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  expect(r.adventureImportRecoveryAvailable()).toBe(false);
  await expect(
    r.compareLocalAdventureImport(uid, id, null, r.newImportRecord(uid, id), () => {}),
  ).rejects.toThrow(/reserva seguros/);
  expect(await r.readLocalAdventureImport(uid, id)).toBeNull();
});

it('reproduz o vetor AES-GCM independente publicado no contrato', async () => {
  const k = await key();
  k.jobToken = 'e568a4a32319f6f6ac380c6e7181b9dad716e16646ed41dfb49490982247a20c';
  k.keyId = '11'.repeat(32);
  const real = crypto.subtle;
  vi.stubGlobal('crypto', {
    subtle: real,
    getRandomValues: (v: Uint8Array) => {
      v.set(Array.from({ length: 12 }, (_, i) => i));
      return v;
    },
  });
  const sealed = await r.sealAdventureImportReview(review, k);
  expect(btoa(String.fromCharCode(...new Uint8Array(sealed.ciphertext)))).toBe(
    'PCCleK2Ar3rbJOX42IYWT7nnqxaACTAWXQSRpycSIsZoZMKZjfsw2QLBEZn99UkYLdhCoXil2rRQ51lwa8HPzKJZsBOgEoUOPDfFAInmfIVZ7qhMVE9xHZOU6KkKg9zEr9pjiNEtpGeyPk3dPQdCGphdGYmOoEHzLKsuvefEVCzPN3iym7+/PmTDZINOsi3wA8LBDxcg9Xq8Z40VzerZi6agpyXayK1KwwW/y+y0s4qura8R6ZIS2QO59vNGodTAK36/yjS8tKgGN+bSg3e4t9IcmRNfIpbTE+juog0t4Z03S/aV1xV+CXA03WvBeBM/27GDLuYS/cxjBwJRsb4B6XG2k/T8+GQcFLAcc9JDTijglva9vsTtbNAPnc6afYZkcT2CJpi44mywSFMuZvCC6bqHOi4otuM1+15zYvJTMcvzt0NatTxapMKQGnx/8zsD/mrspOhm7GQhwiQ6sZ44wXtSpKTMsDatYJMp585j4o51uZoA',
  );
  expect(await r.openAdventureImportReview(sealed, k)).toEqual(review);
});
