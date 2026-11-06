import {
  readLiteraryImpactSequenceCurrent,
  LITERARY_IMPACT_SEQUENCE_MEMBERSHIP_FIELDS,
} from './literaryImpactSequenceMembership.mjs';
import { digest, readWorkMetadata, workProject } from './workProgressContracts.mjs';
import {
  literaryImpactArtifactIdentity,
  literaryImpactPublicationBookToken,
} from './literaryImpactProcessInventory.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import {
  readLiteraryIntegrationUnitMetadata,
  readLiteraryIntegrationChapter,
} from './literaryIntegrationSources.mjs';
import { readLiteraryPublicationIntegration } from './literaryPublicationContracts.mjs';
const collections = Object.freeze({
  chapter: 'chapters',
  act: 'acts',
  workflow: 'literaryWorkflowJobs',
  sequence: 'literarySequenceJobs',
  inspection: 'literaryPassageInspections',
  draft: 'literaryDraftJobs',
  review: 'literaryReviewJobs',
  milestone: 'literaryMilestones',
  integration: 'literaryIntegrationJobs',
  publication: 'literaryPublications',
});
// These checks open metadata only. Matching a native origin is never a claim
// that the manuscript was read, remains approved, or can be published/executed.
export async function verifyLiteraryImpactProcessSource(tx, c, link) {
  const { from, capture } = link;
  if (!capture || from.scopeKind !== 'book' || from.scopeId !== c.target.id) return null;
  await workProject(tx, c);
  const book = await readWorkMetadata(tx, c.ref, []),
    bookBirth = literaryNativeBirth(book);
  if (capture.scheme === 'artifact-origin') {
    if (
      capture.originToken !== null ||
      capture.versionToken !== null ||
      capture.revision !== null ||
      !capture.identityToken
    )
      return null;
    if (from.kind !== 'book' && !Object.hasOwn(collections, from.kind)) return null;
    if (from.kind === 'book' && from.id !== c.target.id) return null;
    const row =
      from.kind === 'book'
        ? book
        : await readWorkMetadata(
            tx,
            c.db.doc(c.path + '/' + collections[from.kind] + '/' + from.id),
            ['deleting', 'actorId', 'ownerId', 'bookId', 'bookBirth', 'bookToken'],
          );
    if (!row.exists || row.data().deleting) return { sourceAvailable: false };
    const value = row.data();
    if (
      (value.actorId != null && value.actorId !== c.uid) ||
      (value.ownerId != null && value.ownerId !== c.uid) ||
      (value.bookId != null && value.bookId !== c.target.id) ||
      (value.bookBirth != null && digest(value.bookBirth) !== digest(bookBirth)) ||
      (from.kind === 'publication' &&
        value.bookToken !== literaryImpactPublicationBookToken(c, bookBirth))
    )
      return { sourceAvailable: false };
    return {
      sourceAvailable: true,
      identityMatches:
        capture.identityToken ===
        literaryImpactArtifactIdentity(c, bookBirth, from.kind, from.id, literaryNativeBirth(row)),
      versionMatches: null,
      identityEvidence: 'native-birth-only',
    };
  }
  if (capture.scheme === 'sequence-workflow') {
    if (
      from.kind !== 'workflow' ||
      link.record.collection !== 'literarySequenceJobs' ||
      !capture.identityToken ||
      !capture.originToken ||
      capture.versionToken !== null ||
      capture.revision !== null
    )
      return null;
    const parent = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literarySequenceJobs/' + link.record.id),
      LITERARY_IMPACT_SEQUENCE_MEMBERSHIP_FIELDS,
    );
    if (!parent.exists || parent.data().currentWorkflowId !== from.id)
      return { sourceAvailable: false };
    const membership = await readLiteraryImpactSequenceCurrent(tx, c, {
      id: parent.id,
      data: parent.data(),
      recordBirth: literaryNativeBirth(parent),
      bookBirth,
    });
    if (!membership) return { sourceAvailable: false };
    return {
      sourceAvailable: true,
      capturedGrantMatches: capture.originToken === membership.originToken,
      identityMatches:
        capture.identityToken ===
        literaryImpactArtifactIdentity(c, bookBirth, 'workflow', from.id, membership.birth),
      versionMatches: null,
      identityEvidence: 'native-registration-membership',
    };
  }
  if (capture.scheme === 'integration-unit') {
    if (
      !['chapter', 'scene'].includes(from.kind) ||
      link.record.collection !== 'literaryPublicationUnits' ||
      !capture.identityToken ||
      !capture.versionToken ||
      !capture.originToken ||
      capture.revision !== null
    )
      return null;
    const row = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryPublicationUnits/' + link.record.id),
      [
        'jobId',
        'identityToken',
        'unit.chapterId',
        'unit.resource',
        'unit.chapterToken',
        'unit.token',
      ],
    );
    const value = row.data(),
      unit = value?.unit;
    if (
      !unit ||
      unit.resource?.kind !== from.kind ||
      unit.resource.id !== from.id ||
      value.identityToken !== capture.identityToken ||
      unit.token !== capture.versionToken ||
      unit.chapterToken !== capture.originToken
    )
      return { sourceAvailable: false };
    const actual = await readLiteraryIntegrationUnitMetadata(tx, c, unit);
    return {
      sourceAvailable: true,
      identityMatches: capture.identityToken === actual.identityToken,
      versionMatches:
        capture.versionToken === actual.token && capture.originToken === actual.chapter.token,
      identityEvidence: 'native-integration-unit',
      sourceRepresentation: 'metadata-only',
    };
  }
  if (capture.scheme === 'integration-chapter') {
    if (
      from.kind !== 'chapter' ||
      capture.originToken !== null ||
      capture.revision !== null ||
      !capture.versionToken
    )
      return null;
    const actual = await readLiteraryIntegrationChapter(tx, c, from.id);
    return {
      sourceAvailable: true,
      identityMatches:
        capture.identityToken == null ? null : capture.identityToken === actual.identityToken,
      versionMatches: capture.versionToken === actual.token,
      identityEvidence: capture.identityToken == null ? null : 'native-integration-chapter',
    };
  }
  if (capture.scheme === 'publication-integration') {
    if (
      from.kind !== 'integration' ||
      capture.identityToken !== null ||
      capture.revision !== null ||
      !capture.versionToken
    )
      return null;
    const actual = await readLiteraryPublicationIntegration(tx, c, from.id);
    const sameBook = capture.originToken === literaryImpactPublicationBookToken(c, bookBirth);
    const sameVersion = capture.versionToken === actual.token;
    return {
      sourceAvailable: true,
      capturedGrantMatches: sameBook,
      identityMatches: sameBook && sameVersion ? true : null,
      versionMatches: sameVersion,
      identityEvidence: sameBook && sameVersion ? 'native-integration-snapshot' : null,
    };
  }
  return null;
}
