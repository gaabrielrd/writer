import { verifyLiteraryImpactGuideDependency } from './literaryImpactGuideDependencies.mjs';
import { verifyLiteraryImpactProcessSource } from './literaryImpactProcessVerification.mjs';
import { literaryVolumeUnitId } from './literaryVolumeProtocol.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { normalizeLiteraryImpactLink, literaryImpactLinkKey } from './literaryImpactProtocol.mjs';
import { verifyLiteraryImpactTextSource } from './literaryImpactTextVerification.mjs';
import { verifyLiteraryImpactFindingSource } from './literaryImpactFindingVerification.mjs';
import { verifyLiteraryImpactPersonaSource } from './literaryImpactPersonaVerification.mjs';
import { verifyLiteraryImpactNativeChatSource } from './literaryImpactNativeChatVerification.mjs';
import { verifyLiteraryImpactApplicationSource } from './literaryImpactApplication.mjs';
import { verifyLiteraryImpactNativeChatApplicationSource } from './literaryImpactNativeChatApplication.mjs';
import { verifyLiteraryImpactLegacyChatApplicationSource } from './literaryImpactLegacyChatApplication.mjs';
const kinds = ['act', 'chapter', 'scene', 'arc', 'event', 'localLore', 'globalLore'];
function birth(row) {
  const value = row.createTime;
  if (
    !row.exists ||
    !Number.isSafeInteger(value?.seconds) ||
    !Number.isSafeInteger(value?.nanoseconds)
  )
    workFail('failed-precondition', 'Identidade nativa da fonte indisponível.');
  return [value.seconds, value.nanoseconds];
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'Revisão da fonte inválida.');
  return value;
}
function result(link, values = {}) {
  const value = {
    linkKey: literaryImpactLinkKey(link),
    sourceAvailable: null,
    identityMatches: null,
    capturedGrantMatches: null,
    versionMatches: null,
    sourceIdentityVerified: false,
    status: 'unverified',
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
    ...values,
  };
  value.sourceIdentityVerified = value.sourceAvailable === true && value.identityMatches === true;
  if (value.sourceAvailable === false) value.status = 'unavailable';
  else if (value.identityMatches === false) value.status = 'recreated';
  else if (value.capturedGrantMatches === false && value.identityMatches !== true)
    value.status = 'origin-mismatch';
  else if (value.versionMatches === false || value.capturedGrantMatches === false)
    value.status = 'changed';
  else if (value.sourceIdentityVerified && value.versionMatches === true) value.status = 'current';
  if (value.status === 'current' && value.sourceRepresentation === 'preserved-metadata')
    value.status = 'preserved';
  return value;
}
// Only the inventory producer may call this with links obtained from an owned,
// native record in the same transaction. This is NOT a callable or an
// authorization mechanism for arbitrary client-supplied links or derived bodies.
// One edge per bounded verification step; no manuscript/labels/notes are returned.
// Native local-lore C1 may inspect a bounded legacy inline record, but never
// payload chunks. Nonlocal references use explicit metadata field masks.
export async function createLiteraryImpactSourceVerifier(tx, c, { bookId }) {
  await workProject(tx, c);
  const source = workScope(c.db, c.uid, { target: { kind: 'book', id: workId(bookId) } }, []);
  const root = await workProject(tx, source),
    book = await readWorkMetadata(tx, source.ref, []);
  const bookToken = digest({
    domain: 'literary-writing-book-v1',
    uid: c.uid,
    target: source.target,
    birth: birth(book),
  });
  let referenceReader;
  return async (raw) => {
    const link = normalizeLiteraryImpactLink(raw),
      from = link.from,
      capture = link.capture;
    const foreignVolume =
      from.scopeKind === 'book' &&
      from.scopeId !== bookId &&
      ['act', 'chapter', 'scene', 'arc', 'event'].includes(from.kind) &&
      capture?.scheme === 'reference';
    if (from.scopeKind === 'book' && from.scopeId !== bookId && !foreignVolume)
      workFail('permission-denied', 'A origem pertence a outro livro.');
    if (!capture || capture.scheme === 'unknown') return result(link);
    try {
      if (capture.scheme === 'guide-dependency')
        return result(link, (await verifyLiteraryImpactGuideDependency(tx, source, link)) ?? {});
      if (
        [
          'artifact-origin',
          'integration-chapter',
          'publication-integration',
          'integration-unit',
          'sequence-workflow',
        ].includes(capture.scheme)
      )
        return result(link, (await verifyLiteraryImpactProcessSource(tx, source, link)) ?? {});
      if (capture.scheme === 'legacy-chat-application-source')
        return result(
          link,
          (await verifyLiteraryImpactLegacyChatApplicationSource(tx, source, link)) ?? {},
        );
      if (capture.scheme === 'native-chat-application-source')
        return result(
          link,
          (await verifyLiteraryImpactNativeChatApplicationSource(tx, source, link)) ?? {},
        );
      if (capture.scheme === 'application-source')
        return result(link, (await verifyLiteraryImpactApplicationSource(tx, source, link)) ?? {});
      if (capture.scheme === 'reference') {
        if (!kinds.includes(from.kind)) return result(link);
        referenceReader ??= await createLiteraryReferenceReader(tx, source, root);
        const subject = link.relation === 'subject';
        const actual = await referenceReader(
          {
            kind: foreignVolume ? 'volumeUnit' : from.kind,
            id: foreignVolume
              ? literaryVolumeUnitId({ bookId: from.scopeId, kind: from.kind, id: from.id })
              : from.id,
            scopeId: from.scopeId,
            purpose: subject ? 'subject' : 'source',
          },
          false,
        );
        if (!actual) return result(link, { sourceAvailable: false });
        const grant =
          capture.originToken === null
            ? null
            : capture.originToken === actual.reference.sourceToken;
        const identity =
          capture.identityToken === null
            ? grant === true
              ? true
              : null
            : capture.identityToken === actual.identityToken;
        const token =
          subject && ['act', 'chapter', 'scene'].includes(from.kind)
            ? actual.identityToken
            : actual.versionToken;
        const matches =
          capture.versionToken !== null
            ? capture.versionToken === token &&
              (subject ||
                capture.revision === null ||
                capture.revision === actual.reference.revision)
            : subject && identity === true
              ? true
              : capture.revision === null
                ? null
                : capture.revision === actual.reference.revision;
        return result(link, {
          sourceAvailable: true,
          identityMatches: identity,
          capturedGrantMatches: grant,
          versionMatches: matches,
        });
      }
      if (capture.scheme === 'writing-plan') {
        if (from.kind !== 'plan' || capture.originToken !== null || capture.versionToken !== null)
          return result(link);
        const row = await readWorkMetadata(
          tx,
          c.db.doc(source.path + '/literaryPlans/' + from.id),
          ['revision'],
        );
        if (!row.exists) return result(link, { sourceAvailable: false });
        const identityToken = digest({
          domain: 'literary-plan-identity-v1',
          uid: c.uid,
          bookToken,
          id: from.id,
          birth: birth(row),
        });
        return result(link, {
          sourceAvailable: true,
          identityMatches:
            capture.identityToken === null ? null : capture.identityToken === identityToken,
          versionMatches:
            capture.revision === null ? null : capture.revision === revision(row.data().revision),
        });
      }
      if (capture.scheme === 'editorial-revision') {
        if (
          !['contract', 'plan'].includes(from.kind) ||
          (from.kind === 'contract' && from.id !== 'current') ||
          capture.identityToken !== null ||
          capture.versionToken !== null
        )
          return result(link);
        const path =
          from.kind === 'contract'
            ? source.path + '/literaryProduction/current'
            : source.path + '/literaryPlans/' + from.id;
        const row = await readWorkMetadata(tx, c.db.doc(path), ['revision']);
        if (!row.exists) return result(link, { sourceAvailable: false });
        const grant = capture.originToken === null ? null : capture.originToken === bookToken;
        // The logical current contract belongs to the frozen book incarnation.
        // A plan without its native identity stays unverified, even at revision 1.
        return result(link, {
          sourceAvailable: true,
          capturedGrantMatches: grant,
          identityMatches: from.kind === 'contract' && grant === true ? true : null,
          versionMatches:
            capture.revision === null ? null : capture.revision === revision(row.data().revision),
        });
      }
      if (['native-chat-target', 'native-chat-lore', 'native-chat-turn'].includes(capture.scheme)) {
        const facts = await verifyLiteraryImpactNativeChatSource(tx, source, link);
        return result(link, facts ?? {});
      }
      if (['history-source', 'content-hash', 'prose-assembly'].includes(capture.scheme)) {
        const facts = await verifyLiteraryImpactTextSource(tx, source, link);
        return result(link, facts ?? {});
      }
      if (['finding-target', 'architecture-source'].includes(capture.scheme)) {
        const facts = await verifyLiteraryImpactFindingSource(tx, source, link);
        return result(link, facts ?? {});
      }
      if (['persona-profile', 'persona-binding'].includes(capture.scheme)) {
        const facts = await verifyLiteraryImpactPersonaSource(tx, source, link);
        return result(link, facts ?? {});
      }
      return result(link);
    } catch (cause) {
      if (
        !['permission-denied', 'not-found', 'failed-precondition', 'resource-exhausted'].includes(
          cause.code,
        )
      )
        throw cause;
      // An unavailable historical origin does not revoke access to the author's
      // own dependency record; it also does not grant access to an old response.
      return result(link, { sourceAvailable: false, reason: cause.code });
    }
  };
}
