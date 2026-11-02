import { createCampaignBackupOwnSemanticsService } from './campaignBackupOwnSemantics.mjs';
import { createCampaignBackupDerivedSemanticsService } from './campaignBackupDerivedSemantics.mjs';
import { createCampaignBackupOriginReviewService } from './campaignBackupOriginReview.mjs';
import { campaignManifestId } from './portableCampaignManifest.mjs';
import { workFail } from './workProgressContracts.mjs';
/** Server-injected temporary index factory only; no production adapter or activation grant. */
export function createCampaignBackupReviewService({ db, keys, now = Date.now, createIndex }) {
  if (typeof createIndex !== 'function') throw new TypeError('Fábrica temporária inválida.');
  const factory = createIndex,
    own = createCampaignBackupOwnSemanticsService({ keys, now }),
    derived = createCampaignBackupDerivedSemanticsService({ keys, now }),
    origins = createCampaignBackupOriginReviewService({ db, keys, now });
  return {
    async reviewCampaignBackup(uid, source, { signal, onProgress } = {}) {
      if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
      campaignManifestId(uid);
      if (
        !source ||
        typeof source.read !== 'function' ||
        !Number.isSafeInteger(source.size) ||
        source.size < 16 ||
        (onProgress !== undefined && typeof onProgress !== 'function')
      )
        throw new TypeError('Revisão de campanha inválida.');
      const size = source.size,
        read = source.read.bind(source),
        input = {
          get size() {
            if (source.size !== size) throw new TypeError('Arquivo alterado.');
            return size;
          },
          read,
        },
        check = () => signal?.throwIfAborted(),
        progress = (stage) =>
          onProgress
            ? async (p) => {
                await onProgress(Object.freeze({ ...p, stage }));
                check();
              }
            : undefined;
      async function step(stage, run) {
        check();
        const index = await factory(stage);
        const required = [
          'write',
          'seal',
          'read',
          'dispose',
          ...(stage === 'origins' ? [] : ['lookup']),
          ...(stage === 'derived' ? ['reverse'] : []),
        ];
        if (!index || required.some((k) => typeof index[k] !== 'function')) {
          if (typeof index?.dispose === 'function') await index.dispose();
          throw new TypeError('Índice temporário inválido.');
        }
        // Enter even after cancellation: the stage owns disposal inside its guarded scope.
        return run(index, progress(stage));
      }
      const a = await step('own', (index, onProgress) =>
          own.reviewCampaignBackupOwnContent(uid, input, { index, signal, onProgress }),
        ),
        b = await step('derived', (index, onProgress) =>
          derived.reviewCampaignBackupDerivedContent(uid, input, { index, signal, onProgress }),
        );
      const match = (r) => {
        if (
          r.archive.chainHash !== a.archive.chainHash ||
          r.archive.size !== a.archive.size ||
          JSON.stringify(r.manifest) !== JSON.stringify(a.manifest)
        )
          workFail(
            'failed-precondition',
            'O arquivo mudou entre as etapas.',
            'campaign-backup-review-file-changed',
          );
      };
      match(b);
      const c = await step('origins', (index, onProgress) =>
        origins.reviewCampaignBackupOrigins(uid, input, { index, signal, onProgress }),
      );
      match(c);
      check();
      return Object.freeze({
        validation: 'campaign-backup-review-only',
        manifest: a.manifest,
        archive: a.archive,
        own: a.own,
        derived: b.derived,
        origins: c.origins,
      });
    },
  };
}
