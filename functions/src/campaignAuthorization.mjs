import { randomBytes } from 'node:crypto';
import { workId, workFail, readWorkMetadata } from './workProgressContracts.mjs';

const fields = ['schemaVersion', 'ownerId', 'token', 'epoch'];
const inconsistent = () =>
  workFail('failed-precondition', 'O controle de autorização está inconsistente.');

// One persistent clock covers any number of universes retained by a campaign.
// Reading never creates/reset a clock; the start/write transaction initializes it.
export async function readCampaignAuthorization(tx, db, uid) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  const ref = db.doc(`users/${workId(uid)}/campaignAuthorization/current`);
  const record = (await readWorkMetadata(tx, ref, fields)).data() ?? null;
  if (
    record &&
    (record.schemaVersion !== 1 ||
      record.ownerId !== uid ||
      typeof record.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.token) ||
      !Number.isSafeInteger(record.epoch) ||
      record.epoch < 0)
  )
    inconsistent();
  return { ref, record, epoch: record?.epoch ?? null };
}

// Compose the write phase after all reads, just like universe/image-use plans.
export async function prepareCampaignAuthorization(tx, db, uid, { bump = false } = {}) {
  if (typeof bump !== 'boolean') inconsistent();
  const previous = await readCampaignAuthorization(tx, db, uid);
  const epoch = previous.record ? previous.epoch + Number(bump) : Number(bump);
  if (!Number.isSafeInteger(epoch)) inconsistent();
  const record = {
    schemaVersion: 1,
    ownerId: uid,
    token: previous.record?.token ?? randomBytes(32).toString('hex'),
    epoch,
  };
  return {
    ref: previous.ref,
    record,
    commit() {
      if (!previous.record || bump) tx.set(previous.ref, record);
    },
  };
}
