import {
  LITERARY_IMPACT_PROCESS_FIELDS,
  LITERARY_IMPACT_PROCESS_KINDS,
  literaryImpactProcessNodeId,
} from './literaryImpactProcessInventory.mjs';
import { workFail, workId, digest } from './workProgressContracts.mjs';
import { readLiteraryImpactBookInventoryPage } from './literaryImpactInventory.mjs';
import { createLiteraryImpactSourceVerifier } from './literaryImpactVerification.mjs';
import { literaryImpactLinkKey } from './literaryImpactProtocol.mjs';
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Ponteiro de dependência inválido.');
  return value;
};
// Reconstruct the link from the current native metadata. Neither a client nor a
// cached graph row may supply a replacement capture to authorize another origin.
export async function verifyLiteraryImpactInventoryLink(
  tx,
  c,
  { bookId, collection, recordId, recordToken, linkId },
) {
  workId(recordId);
  hash(recordToken);
  hash(linkId);
  const page = await readLiteraryImpactBookInventoryPage(tx, c, { bookId, collection, recordId });
  const item = page.items[0];
  const unavailable = (status) => ({
    recordCurrent: false,
    status,
    sourceIdentityVerified: false,
    linkId,
    manuscriptRead: false,
    wholeUnitRead: false,
  });
  if (!item) return unavailable('record-unavailable');
  if (item.recordToken !== recordToken) return unavailable('record-changed');
  const link = item.links.find((value) => digest(literaryImpactLinkKey(value)) === linkId);
  if (!link) return unavailable('link-changed');
  const recordKinds = {
    arcs: 'arc',
    timelineEvents: 'event',
    acts: 'act',
    chapters: 'chapter',
    scenes: 'scene',
    literaryPlans: 'plan',
    ...LITERARY_IMPACT_PROCESS_KINDS,
  };
  if (Object.hasOwn(LITERARY_IMPACT_PROCESS_FIELDS, collection) && !recordKinds[collection])
    recordKinds[collection] = 'publicationPart';
  const sourceRecordId = Object.hasOwn(LITERARY_IMPACT_PROCESS_FIELDS, collection)
    ? literaryImpactProcessNodeId(collection, recordId)
    : recordId;
  if (
    recordKinds[collection] === link.from.kind &&
    link.from.id === sourceRecordId &&
    link.from.scopeKind === 'book' &&
    link.from.scopeId === bookId
  ) {
    // The frozen recordToken contains this exact source's native birth/version.
    // This proves the source record, not the destination's past incarnation,
    // the integrity of manuscript bytes, or any editorial interpretation.
    return {
      recordCurrent: true,
      linkId,
      linkKey: literaryImpactLinkKey(link),
      issues: item.issues,
      sourceAvailable: true,
      identityMatches: true,
      versionMatches: true,
      capturedGrantMatches: null,
      sourceIdentityVerified: true,
      status: 'current',
      identityEvidence: 'native-record-snapshot',
      manuscriptRead: false,
      wholeUnitRead: false,
      editorialReview: false,
      byteIntegrityChecked: false,
    };
  }
  const verify = await createLiteraryImpactSourceVerifier(tx, c, { bookId });
  const result = await verify(link);
  return { ...result, linkId, recordCurrent: true, issues: item.issues };
}
