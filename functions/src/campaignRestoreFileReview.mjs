import { createCampaignBackupFileScanner } from './campaignBackupFileScanner.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  authorize,
  closed,
  id,
  hash,
  mutation,
  integer,
  fingerprint,
  bad,
  fail,
  digest,
} from './campaignRestoreContracts.mjs';

const MAX_STATE_BYTES = 65536;
const aad = (l, checkpoint) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'file-review', checkpoint];
const projection = (state) => ({
  schemaVersion: 1,
  status: state.seal ? 'verified' : 'running',
  checkpoint: 0, // filled only at the atomic commit
  records: state.cursor.records,
  offset: state.cursor.offset,
  units: state.units,
  witnesses: state.witnesses,
});
/** Internal integrity checkpoint; semantic review/current authority and activation are separate. */
export function createCampaignRestoreFileReview({ store, openSource, keys }) {
  const { db } = store;
  async function scanner(l, key, source) {
    let checkpoint = null;
    if (l.job.fileReview) {
      try {
        checkpoint = JSON.parse(
          open(
            key.bytes,
            l.job.fileReview.payload,
            aad(l, l.job.fileReview.checkpoint),
            MAX_STATE_BYTES,
          ).toString('utf8'),
        );
      } catch {
        bad();
      }
    }
    try {
      const scan = await createCampaignBackupFileScanner(l.uid, source, {
        keys,
        now: store.now,
        resumable: true,
        checkpoint,
      });
      if (checkpoint) {
        const expected = projection(scan.snapshot());
        expected.checkpoint = l.job.fileReview.checkpoint;
        const metadata = Object.fromEntries(
          Object.entries(l.job.fileReview).filter(([k]) => k !== 'payload'),
        );
        if (digest(expected) !== digest(metadata)) {
          scan.dispose();
          bad();
        }
      }
      return scan;
    } catch {
      bad();
    }
  }
  return {
    async advanceCampaignRestoreFileReview(uid, input) {
      authorize(uid);
      const request = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('review-file', request);
      const seed = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await store.operation(tx, l, request.operationId, fp);
        if (op) return { replay: store.confirm(l, op) };
        if (request.expectedCheckpoint !== l.job.checkpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        if (l.job.state !== 'bytes-verified' || l.job.fileReview?.status === 'verified')
          fail('failed-precondition', 'state-conflict');
        return { l, key: await store.key(tx, l, true) };
      });
      if (seed.replay) return seed.replay;
      let scan;
      try {
        const source = await openSource(uid, {
          restoreId: request.restoreId,
          jobToken: request.jobToken,
        });
        scan = await scanner(seed.l, seed.key, source);
        for (let n = 0; n < request.limit; n++) {
          if ((await scan.next()).done) break;
        }
        const state = scan.snapshot(),
          bytes = Buffer.from(JSON.stringify(state));
        if (bytes.length > MAX_STATE_BYTES) bad();
        const next = {
          ...projection(state),
          checkpoint: request.expectedCheckpoint + 1,
          payload: seal(seed.key.bytes, bytes, aad(seed.l, request.expectedCheckpoint + 1)),
        };
        // Recheck the live job and CAS after all archive reads. A cancellation or a
        // competing writer cannot publish its late computation into this incarnation.
        const prior = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, request.restoreId, request.jobToken),
            op = await store.operation(tx, l, request.operationId, fp);
          if (op) return store.confirm(l, op);
          if (l.job.checkpoint !== request.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (digest(l.job) !== digest(seed.l.job)) bad();
          store.commit(
            tx,
            l,
            request,
            'review-file',
            fp,
            { fileReview: next },
            { records: next.records, complete: next.status === 'verified' },
          );
          return null;
        });
        return prior ?? store.after(uid, request.restoreId, request.operationId, fp);
      } finally {
        scan?.dispose();
        seed.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreFileIntegrity(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const rid = id(input.restoreId),
        token = hash(input.jobToken),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, rid, token);
          if (l.job.state !== 'bytes-verified' || l.job.fileReview?.status !== 'verified')
            fail('failed-precondition', 'file-review-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      let scan;
      try {
        const source = await openSource(uid, { restoreId: rid, jobToken: token });
        scan = await scanner(seed.l, seed.key, source);
        const result = await scan.result(); // Reverify the current issuance keyring.
        await db.runTransaction(async (tx) => {
          const live = await store.load(tx, uid, rid, token);
          if (digest(live.job) !== digest(seed.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
        });
        return result;
      } finally {
        scan?.dispose();
        seed.key.bytes.fill(0);
      }
    },
  };
}
