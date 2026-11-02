import { createAdventureImportService } from '../../src/adventureImport.mjs';
import {
  adventureImportSeed,
  adventureImportSection,
  adventureImportChain,
  adventureImportReviewHash,
  adventureImportIds,
} from '../../src/adventureImportContracts.mjs';

export async function activateBackupImportedAdventure(
  db,
  {
    uid = 'author',
    importId = 'backup-import-source-0001',
    sections = [{ title: 'PRIVATE_IMPORTED_PART', content: '<p>PRIVATE_IMPORTED_TEXT 🌙</p>' }],
  } = {},
) {
  const api = createAdventureImportService({ db, now: () => 1000 }),
    project = {
      title: 'PRIVATE_IMPORTED_ADVENTURE',
      synopsis: 'PRIVATE_SYNOPSIS',
      universeId: null,
    },
    source = { mediaType: 'application/pdf', sha256: 'a'.repeat(64), byteLength: 100 };
  let chain = adventureImportSeed,
    totalBodyBytes = 0;
  for (let index = 0; index < sections.length; index++) {
    const section = adventureImportSection(sections[index]);
    chain = adventureImportChain(chain, index, section);
    totalBodyBytes += section.bodyBytes;
  }
  const start = {
    operationId: importId,
    project,
    source,
    sectionCount: sections.length,
    totalBodyBytes,
  };
  let progress = (
    await api.startAdventureImport(uid, {
      ...start,
      reviewHash: adventureImportReviewHash(start, chain),
    })
  ).progress;
  await api.getAdventureImportRecoveryKey(uid, {
    importId,
    jobToken: progress.jobToken,
    reviewHash: progress.reviewHash,
  });
  progress = await api.getAdventureImport(uid, { importId });
  const mutation = (operationId) => ({
    importId,
    jobToken: progress.jobToken,
    operationId,
    expectedCheckpoint: progress.checkpoint,
  });
  for (let index = 0; index < sections.length; index++)
    progress = (
      await api.appendAdventureImportSection(uid, {
        ...mutation('backup-import-append-' + String(index).padStart(4, '0')),
        index,
        section: sections[index],
      })
    ).progress;
  for (let index = 0; index < sections.length; index++)
    progress = (
      await api.advanceAdventureImport(
        uid,
        mutation('backup-import-materialize-' + String(index).padStart(4, '0')),
      )
    ).progress;
  progress = (await api.activateAdventureImport(uid, mutation('backup-import-activate-0001')))
    .progress;
  if (progress.state !== 'activated') throw Error('Import fixture did not activate');
  return { api, progress, sections, ...adventureImportIds(uid, importId, 0) };
}
