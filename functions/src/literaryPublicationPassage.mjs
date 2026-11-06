import { digest, workFail, workId } from './workProgressContracts.mjs';
import {
  readLiteraryPublicationBook,
  literaryPublicationRef,
  literaryPublicationEntry,
  literaryPublicRevision,
} from './literaryPublicationContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { readLiteraryIntegrationChapter } from './literaryIntegrationSources.mjs';
import { readBookPublicationSource } from './bookLorePublication.mjs';
import { literaryPublicationEditionHash } from './literaryPublicationConfirmation.mjs';

const fail = () =>
  workFail(
    'failed-precondition',
    'Confira a edição confirmada da versão atual do capítulo anterior antes de avançar.',
    'workflow-publication',
  );

/** Internal entry certificate, never a client assertion or permission to publish.
 * The workflow caller rechecks its own stored certificate after entry. Only the
 * current-pointer requirement is latched: native origins and chapter still match.
 */
export async function captureLiteraryPublicationPassage(
  tx,
  c,
  publicationId,
  chapterId,
  { entered = false } = {},
) {
  const id = workId(publicationId),
    { root, bookToken } = await readLiteraryPublicationBook(tx, c),
    jobRow = await tx.get(literaryPublicationRef(c, 'literaryPublications', id)),
    job = jobRow.data();
  if (
    !job ||
    job.jobId !== id ||
    job.bookToken !== bookToken ||
    job.state !== 'published' ||
    !job.confirmationId ||
    !job.editionHash ||
    !job.publicationSourceToken
  )
    fail();
  const confirmationRow = await tx.get(
      literaryPublicationRef(c, 'literaryPublicationConfirmations', workId(job.confirmationId)),
    ),
    confirmation = confirmationRow.data(),
    headerRow = await tx.get(literaryPublicRevision(c, id)),
    header = headerRow.data(),
    chapter = await readLiteraryIntegrationChapter(tx, c, workId(chapterId)),
    includedRow = await tx.get(literaryPublicationEntry(c, 'Chapters', id, chapter.id)),
    included = includedRow.data();
  if (
    !confirmation ||
    confirmation.jobId !== id ||
    confirmation.bookToken !== bookToken ||
    confirmation.result?.publicationConfirmed !== true ||
    confirmation.result.bookId !== c.target.id ||
    confirmation.result.revisionId !== id ||
    confirmation.result.editionHash !== job.editionHash ||
    confirmation.result.publishedAt !== job.publishedAt ||
    confirmation.result.chapterCount !== job.chapterCount ||
    confirmation.result.manifestHash !== job.manifestHash ||
    confirmation.result.guideHash !== job.guideHash ||
    confirmation.result.removalHash !== job.removalHash ||
    job.editionHash !== literaryPublicationEditionHash(job) ||
    !header ||
    header.chapterCount !== job.chapterCount ||
    header.createdAt !== job.publishedAt ||
    header.sourcePublicationToken !== job.publicationSourceToken ||
    !included ||
    included.chapterId !== chapter.id ||
    included.compiled !== true ||
    included.identityToken !== chapter.identityToken ||
    included.token !== chapter.token ||
    !Number.isSafeInteger(included.index) ||
    included.index < 0 ||
    included.index >= job.chapterCount ||
    !included.projectionHash ||
    !included.unitHash
  )
    fail();
  // Check the actual staged projection as well as the manifest, with one bounded
  // chapter read. A prepared job, old receipt or published root alone proves none of this.
  const publicChapterRow = await tx.get(
      c.db.doc(literaryPublicRevision(c, id).path + '/chapters/' + chapter.id),
    ),
    publicChapter = publicChapterRow.data();
  if (!publicChapter || digest(publicChapter) !== included.projectionHash) fail();
  if (!entered) {
    const pointer = (await tx.get(c.db.doc('publicBooks/' + c.target.id))).data();
    const { source } = await readBookPublicationSource(tx, c.db, c.uid, c.target.id);
    if (
      header.sourceLoreToken !== source.listToken ||
      header.privacyVersion !== source.privacyVersion ||
      (header.universeId ?? null) !== source.universeId ||
      (header.universePrivacyVersion ?? null) !== source.universePrivacyVersion
    )
      fail();
    if (
      root.status !== 'published' ||
      !pointer ||
      pointer.revisionId !== id ||
      pointer.literaryPublicationId !== id ||
      pointer.literaryManifestHash !== job.editionHash ||
      pointer.sourcePublicationToken !== job.publicationSourceToken ||
      header.privacyVersion !== (root.publicationPrivacyVersion ?? 0) ||
      (header.sourceSceneRevision !== undefined &&
        header.sourceSceneRevision !== (root.sceneRevision ?? 0))
    )
      fail();
  }
  return {
    version: 1,
    publicationId: id,
    bookToken,
    publicationBirth: literaryNativeBirth(jobRow),
    confirmationId: job.confirmationId,
    confirmationBirth: literaryNativeBirth(confirmationRow),
    editionBirth: literaryNativeBirth(headerRow),
    editionHash: job.editionHash,
    integration: job.integration,
    chapterId: chapter.id,
    chapterIndex: included.index,
    manifestChapterBirth: literaryNativeBirth(includedRow),
    publicChapterBirth: literaryNativeBirth(publicChapterRow),
    chapterIdentityToken: chapter.identityToken,
    chapterToken: chapter.token,
    projectionHash: included.projectionHash,
    unitHash: included.unitHash,
  };
}
