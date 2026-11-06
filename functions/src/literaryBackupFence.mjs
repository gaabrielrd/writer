import {
  BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION,
  BOOK_EDITORIAL_CAPTURE_FAMILIES,
  BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
} from './bookEditorialCaptureCatalog.mjs';
import { randomUUID } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { workProject, workFail, digest } from './workProgressContracts.mjs';

export const LITERARY_BACKUP_CONTROL = 'literaryBackupControls';
/** Explicit writer port. Call only after authorization/native reads, in the same
 * transaction as the source mutation. No adapter, interception or root mutation.
 * Saved capture families use either the root native revision or this marker.
 * Deployment must drain prior writers before enabling the new archive producer.
 */
export function touchLiteraryBackupWrite(tx, c) {
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  tx.set(c.db.doc(c.path + '/' + LITERARY_BACKUP_CONTROL + '/current'), {
    schemaVersion: 1,
    writeId: randomUUID(),
  });
}
const processCollections = Object.freeze({
  workflow: 'literaryWorkflowJobs',
  sequence: 'literarySequenceJobs',
  draft: 'literaryDraftJobs',
  review: 'literaryReviewJobs',
  milestone: 'literaryMilestones',
  integration: 'literaryIntegrationJobs',
  publication: 'literaryPublications',
  prose: 'literaryProseRequests',
  impact: 'literaryImpactJobs',
  impactControl: 'literaryImpactControls',
  generation: 'literaryGenerations',
});
export const LITERARY_BACKUP_PROCESS_FAMILIES = Object.freeze(Object.keys(processCollections));
/** Explicit native write at selected call sites; never decorates a transaction or DB.
 * Existing caller authorization/reads remain mandatory. Validate the exact parent
 * before forwarding all native arguments (including preconditions) unchanged.
 */
export function writeLiteraryBackupProcess(tx, c, family, method, reference, ...args) {
  const collection = Object.hasOwn(processCollections, family) ? processCollections[family] : null;
  if (
    c.target.kind !== 'book' ||
    !collection ||
    !['create', 'set', 'update'].includes(method) ||
    typeof reference?.path !== 'string' ||
    reference.path.split('/').length !== 4 ||
    !reference.path.split('/')[3] ||
    !reference.path.startsWith(c.path + '/' + collection + '/')
  )
    workFail('failed-precondition', 'Escritor do processo editorial inválido.');
  const result = tx[method](reference, ...args);
  touchLiteraryBackupWrite(tx, c);
  return result;
}
/** Native root/marker observation for the compiled saved-record writer contract; never an authorization. */
export async function readLiteraryBackupFence(tx, c, expected) {
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  await workProject(tx, c);
  const root = await tx.get(c.ref),
    clock = await tx.get(c.db.doc(c.path + '/' + LITERARY_BACKUP_CONTROL + '/current'));
  if (clock.exists) {
    const value = clock.data();
    if (
      !value ||
      Object.keys(value).length !== 2 ||
      value.schemaVersion !== 1 ||
      typeof value.writeId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.writeId)
    )
      workFail('failed-precondition', 'Marcador editorial indisponível.');
  }
  const token = digest({
    version: 3,
    captureCatalog: {
      version: BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION,
      families: BOOK_EDITORIAL_CAPTURE_FAMILIES,
    },
    families: LITERARY_BACKUP_PROCESS_FAMILIES,
    actorId: c.uid,
    bookId: c.target.id,
    root: bookBackupIdentity(root),
    clock: bookBackupIdentity(clock),
  });
  if (expected !== undefined && token !== expected) bookBackupChanged();
  return {
    schemaVersion: 1,
    bookId: c.target.id,
    token,
    clock: clock.exists ? 'recorded' : 'absent',
    coverage: BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE,
    families: [...LITERARY_BACKUP_PROCESS_FAMILIES],
  };
}
