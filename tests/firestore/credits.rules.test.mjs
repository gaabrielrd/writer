import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  deleteField,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

let environment;
const owner = 'credit-author';
const base = {
  uid: owner,
  email: 'author@example.test',
  displayName: 'Author',
  photoUrl: null,
  credits: 100,
  tier: 'free',
  createdAt: 1,
  updatedAt: 1,
};
const reference = () => doc(environment.authenticatedContext(owner).firestore(), 'users', owner);
const seed = async (extra = {}, trustedEntitlement = false) =>
  environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', owner), { ...base, ...extra });
    if (trustedEntitlement) {
      await setDoc(doc(context.firestore(), 'creditEntitlements', owner), {
        tier: 'premium',
        active: true,
      });
    }
  });
const renew = (credits) => ({
  credits,
  creditsRenewedAt: serverTimestamp(),
  updatedAt: Date.now(),
});

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address)
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is required; never run rules tests against production.',
    );
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-credits-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => {
  await environment?.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
});

describe('server-authorized credit policy', { concurrency: false }, () => {
  it('creates the owner free profile with exactly 100 and permits own profile edits', async () => {
    await assertSucceeds(setDoc(reference(), base));
    await assertSucceeds(
      updateDoc(reference(), {
        displayName: 'New name',
        photoUrl: 'https://example.test/photo.png',
        updatedAt: 2,
      }),
    );
    assert.equal((await getDoc(reference())).data().credits, 100);
  });
  it('rejects free initial minting, premium self-entitlement and arbitrary fields', async () => {
    for (const extra of [
      { credits: 101 },
      { credits: 0 },
      { tier: 'premium' },
      { credits: -1 },
      { credits: 0.5 },
      { creditsRenewedAt: serverTimestamp() },
      { role: 'admin' },
      { uid: 'someone-else' },
    ]) {
      await assertFails(setDoc(reference(), { ...base, ...extra }));
    }
  });
  it('rejects cross-account and anonymous reads and writes', async () => {
    await seed();
    for (const context of [
      environment.unauthenticatedContext(),
      environment.authenticatedContext('attacker'),
    ]) {
      const target = doc(context.firestore(), 'users', owner);
      await assertFails(getDoc(target));
      await assertFails(updateDoc(target, { credits: 99 }));
    }
  });
  it('only permits single nonnegative debits, not balance replacement or deleting a profile to remint', async () => {
    await seed({ credits: 2 });
    await assertSucceeds(updateDoc(reference(), { credits: 1, updatedAt: Date.now() }));
    await assertSucceeds(updateDoc(reference(), { credits: 0, updatedAt: Date.now() }));
    for (const credits of [-1, 0.5, 1, 100, 2000])
      await assertFails(updateDoc(reference(), { credits }));
    await assertFails(deleteDoc(reference()));
    await assertFails(setDoc(reference(), base));
  });
  it('rejects changing ownership, tier, creation time or removing protected fields', async () => {
    await seed();
    for (const patch of [
      { tier: 'premium' },
      { uid: 'attacker' },
      { createdAt: 0 },
      { tier: deleteField() },
      { credits: deleteField() },
      { creditsRenewedAt: Timestamp.fromMillis(0) },
    ]) {
      await assertFails(updateDoc(reference(), patch));
    }
  });
  it('does not allow a free user to claim monthly premium credits', async () => {
    await seed();
    await assertFails(updateDoc(reference(), renew(2100)));
    await assertFails(updateDoc(reference(), { ...renew(2100), tier: 'premium' }));
  });
  it('never trusts a legacy self-writable premium tier without an active admin entitlement', async () => {
    await seed({ tier: 'premium' });
    await assertFails(updateDoc(reference(), renew(2100)));
    for (const entitlement of [
      { tier: 'premium', active: false },
      { tier: 'free', active: true },
    ]) {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'creditEntitlements', owner), entitlement);
      });
      await assertFails(updateDoc(reference(), renew(2100)));
    }
    assert.equal((await getDoc(reference())).data().credits, 100);
  });
  it('allows the owner to read reviewed entitlements but forbids all client creation, updates and deletion', async () => {
    await seed({ tier: 'premium' }, true);
    const target = doc(
      environment.authenticatedContext(owner).firestore(),
      'creditEntitlements',
      owner,
    );
    await assertSucceeds(getDoc(target));
    await assertFails(setDoc(target, { tier: 'premium', active: true }));
    await assertFails(updateDoc(target, { active: true }));
    await assertFails(deleteDoc(target));
    await assertFails(
      setDoc(
        doc(
          environment.authenticatedContext('new-user').firestore(),
          'creditEntitlements',
          'new-user',
        ),
        { tier: 'premium', active: true },
      ),
    );
    await assertFails(
      getDoc(
        doc(environment.authenticatedContext('attacker').firestore(), 'creditEntitlements', owner),
      ),
    );
    await assertFails(
      getDoc(doc(environment.unauthenticatedContext().firestore(), 'creditEntitlements', owner)),
    );
  });
  it('grants an admin-managed premium profile exactly +2000 once and preserves existing balance', async () => {
    await seed({ tier: 'premium', credits: 17 }, true);
    await assertSucceeds(updateDoc(reference(), renew(2017)));
    let data = (await getDoc(reference())).data();
    assert.equal(data.credits, 2017);
    assert.ok(data.creditsRenewedAt instanceof Timestamp);
    await assertFails(updateDoc(reference(), renew(4017)));
    await assertSucceeds(updateDoc(reference(), { credits: 2016, updatedAt: Date.now() }));
    await assertFails(updateDoc(reference(), renew(4016)));
    data = (await getDoc(reference())).data();
    assert.equal(data.credits, 2016);
  });
  it('validates the server month, amount and timestamp rather than trusting the browser clock', async () => {
    const now = new Date();
    const earlier = Timestamp.fromDate(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    );
    await seed({ tier: 'premium', credits: 20, creditsRenewedAt: earlier }, true);
    await assertFails(updateDoc(reference(), renew(2000)));
    await assertFails(updateDoc(reference(), renew(2021)));
    await assertFails(
      updateDoc(reference(), { credits: 2020, creditsRenewedAt: earlier, updatedAt: Date.now() }),
    );
    await assertFails(
      updateDoc(reference(), {
        ...renew(2020),
        creditsRenewedAt: Timestamp.fromMillis(Date.now() + 31_536_000_000),
      }),
    );
    await assertSucceeds(updateDoc(reference(), renew(2020)));
  });
  it('rejects rewriting or deleting a renewal timestamp, including bundled profile edits', async () => {
    await seed({ tier: 'premium', creditsRenewedAt: Timestamp.now() }, true);
    for (const patch of [
      { creditsRenewedAt: deleteField() },
      { creditsRenewedAt: Timestamp.fromMillis(0) },
      { ...renew(2100), displayName: 'Changed' },
    ]) {
      await assertFails(updateDoc(reference(), patch));
    }
  });
  it('serializes concurrent monthly renewals so the losing transaction cannot mint another grant', async () => {
    await seed({ tier: 'premium', credits: 7 }, true);
    const firestore = environment.authenticatedContext(owner).firestore();
    const target = doc(firestore, 'users', owner);
    const grant = () =>
      runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(target);
        const data = snapshot.data();
        if (data.creditsRenewedAt) return;
        transaction.update(target, renew(data.credits + 2000));
      });
    const grants = await Promise.allSettled([grant(), grant()]);
    assert.ok(grants.some((entry) => entry.status === 'fulfilled'));
    for (const entry of grants) {
      if (entry.status === 'rejected') assert.equal(entry.reason.code, 'permission-denied');
    }
    assert.equal((await getDoc(target)).data().credits, 2007);
  });
  it('serializes concurrent accepted debits and refuses spending below zero', async () => {
    await seed({ credits: 1 });
    const firestore = environment.authenticatedContext(owner).firestore();
    const target = doc(firestore, 'users', owner);
    const debit = () =>
      runTransaction(firestore, async (transaction) => {
        const data = (await transaction.get(target)).data();
        transaction.update(target, { credits: data.credits - 1, updatedAt: Date.now() });
      });
    const result = await Promise.allSettled([debit(), debit()]);
    assert.equal(result.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal((await getDoc(target)).data().credits, 0);
  });
});
