import { createBookBackupReadService } from '../../src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../src/bookBackupResourceRead.mjs';
import { createBookBackupPersonaService } from '../../src/bookBackupPersonaRead.mjs';
import { createBookBackupUniverseService } from '../../src/bookBackupUniverseRead.mjs';
import { createBookBackupDraftService } from '../../src/bookBackupDraftRead.mjs';
import { createBookBackupCoverService } from '../../src/bookBackupCoverRead.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
export function bookArchiveReadApi(db) {
  return {
    ...createBookBackupReadService({ db }),
    ...createBookBackupResourceService({ db }),
    ...createBookBackupPersonaService({ db }),
    ...createBookBackupUniverseService({ db }),
    ...createBookBackupDraftService({ db }),
    ...createBookBackupCoverService({ db, assets: {} }),
    ...createWorkHistoryService({ db }),
  };
}
/** Test composition only: real source/list proofs for a deliberately empty history. */
export function bookArchiveCapturePorts(call, lore) {
  const getSource = (input) => call('getBookBackupSource', input);
  return {
    history: {
      async *stream(target) {
        const source = await call('getWorkHistoryBackupSource', { target }),
          page = await call('listWorkVersions', {
            target,
            cursor: null,
            limit: 50,
            expectedHistoryToken: source.sourceToken,
          });
        if (page.items.length || page.nextCursor !== null)
          throw Error('Empty-history fixture required');
        yield* [];
        return { schemaVersion: 1, target, source, versions: 0, byteLength: 0, chunkCount: 0 };
      },
      async verify(proof) {
        const current = await call('getWorkHistoryBackupSource', { target: proof.target });
        if (JSON.stringify(current) !== JSON.stringify(proof.source))
          throw Error('History changed');
      },
    },
    apis: {
      lore,
      structure: {
        getSource,
        list: (input) => call('listBookBackupStructure', input),
        read: (input) => call('readBookBackupStructure', input),
      },
      resources: {
        getSource,
        list: (input) => call('listBookBackupResources', input),
        read: (input) => call('readBookBackupResource', input),
      },
      personas: {
        getSource,
        list: (input) => call('listBookBackupPersonaBindings', input),
        read: (input) => call('readBookBackupPersona', input),
      },
      universe: { getSource, read: (input) => call('getBookBackupUniverse', input) },
      draft: { getSource, persona: (input) => call('getBookBackupDraftPersona', input) },
      cover: {
        getSource,
        cover: (input) => call('getBookBackupCover', input),
        read: (input) => call('readBookBackupCoverChunk', input),
        verify: (input) => call('verifyBookBackupCover', input),
      },
    },
  };
}
