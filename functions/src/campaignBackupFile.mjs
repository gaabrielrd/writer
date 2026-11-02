import { createCampaignBackupEncoder } from './campaignBackupContainer.mjs';
import { createCampaignBackupAttestationService } from './campaignBackupAttestation.mjs';
import { campaignBackupScope } from './campaignBackupSource.mjs';
/** The host supplies a temporary sink; no persistence is created by this service. */
export function createCampaignBackupFileService(config) {
  const issuer = createCampaignBackupAttestationService(config),
    db = config.db;
  return {
    async writeCampaignBackupFile(uid, data, { sink, signal, onProgress } = {}) {
      const intent = campaignBackupScope(db, uid, data),
        request = {
          campaignId: intent.campaignId,
          ...(intent.expected === undefined ? {} : { expectedSourceToken: intent.expected }),
        };
      if (
        !sink ||
        ['write', 'commit', 'abort'].some((k) => typeof sink[k] !== 'function') ||
        (onProgress !== undefined && typeof onProgress !== 'function')
      )
        throw new TypeError('Destino temporário inválido.');
      const write = sink.write.bind(sink),
        commit = sink.commit.bind(sink),
        abort = sink.abort.bind(sink),
        encoder = createCampaignBackupEncoder({ signal });
      let committed = false;
      try {
        signal?.throwIfAborted();
        await write(await encoder.start());
        signal?.throwIfAborted();
        const packet = await issuer.issueCampaignBackupAttestation(uid, request, {
          signal,
          onProgress,
          onRecord: async (record) => {
            signal?.throwIfAborted();
            await write(await encoder.write(record));
            signal?.throwIfAborted();
          },
        });
        await write(
          await encoder.write({
            kind: 'attestation',
            id: 'manifest',
            part: 0,
            payload: Buffer.from(JSON.stringify(packet)),
          }),
        );
        signal?.throwIfAborted();
        await write(await encoder.finish());
        signal?.throwIfAborted();
        await commit();
        committed = true;
        return Object.freeze({ validation: 'campaign-file-written', manifest: packet.manifest });
      } finally {
        encoder.abort();
        if (!committed) await abort();
      }
    },
  };
}
