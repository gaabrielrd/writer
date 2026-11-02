import { createHash, sign } from 'node:crypto';
import { encodeCampaignBackup, decodeCampaignBackup } from '../../src/campaignBackupContainer.mjs';
import { CAMPAIGN_ATTESTATION_DOMAIN } from '../../src/portableCampaignManifest.mjs';
const json = (r) => JSON.parse(Buffer.from(r.payload).toString()),
  bytes = (v) => Buffer.from(JSON.stringify(v));
export async function rewriteCampaignBackupTestFile(f, mutate) {
  const all = [];
  for await (const r of decodeCampaignBackup(f.source()))
    all.push({ ...r, payload: Buffer.from(r.payload) });
  const groups = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.kind === 'unit') {
      const chunks = [];
      while (all[i + 1]?.kind === 'data') chunks.push(all[++i].payload);
      groups.push({ kind: 'unit', unit: json(r), chunks });
    } else groups.push({ kind: r.kind, value: json(r) });
  }
  mutate(groups);
  const header = groups[0].value,
    packet = groups.at(-1).value,
    out = [],
    content = createHash('sha256'),
    provenance = createHash('sha256'),
    fold = (h, v) => h.update(JSON.stringify(v) + '\n');
  fold(content, [
    'writer-campaign-logical-units-v' + header.contentVersion,
    header.originCampaignId,
    header.availability,
  ]);
  fold(provenance, [
    'writer-campaign-witnesses-v' + header.provenanceVersion,
    header.originCampaignId,
  ]);
  const totals = { units: 0, bytes: 0, chunks: 0, omitted: 0, unavailable: 0 };
  let witnesses = 0,
    witnessBytes = 0;
  for (const g of groups.slice(0, -1)) {
    if (g.kind === 'campaign')
      out.push({ kind: g.kind, id: 'header', part: 0, payload: bytes(header) });
    else if (g.kind === 'witness') {
      fold(provenance, g.value);
      witnessBytes += g.value[3] === null ? 0 : bytes(g.value[3]).length;
      out.push({ kind: g.kind, id: String(witnesses++), part: 0, payload: bytes(g.value) });
    } else {
      const u = g.unit,
        id = String(totals.units++);
      if (u.outcome === 'available') {
        const data = Buffer.concat(g.chunks);
        Object.assign(u, {
          byteLength: data.length,
          chunkCount: g.chunks.length,
          contentHash: createHash('sha256').update(data).digest('hex'),
        });
      }
      fold(content, u);
      totals.bytes += u.byteLength ?? 0;
      totals.chunks += u.chunkCount ?? 0;
      if (u.outcome === 'omitted') totals.omitted++;
      if (u.outcome === 'unavailable') totals.unavailable++;
      out.push({ kind: 'unit', id, part: 0, payload: bytes(u) });
      for (let i = 0; i < g.chunks.length; i++)
        out.push({ kind: 'data', id, part: i, payload: g.chunks[i] });
    }
  }
  Object.assign(packet.manifest, {
    contentVersion: header.contentVersion,
    provenanceVersion: header.provenanceVersion,
    content: { ...totals, digest: content.digest('hex') },
    provenance: { units: witnesses, bytes: witnessBytes, digest: provenance.digest('hex') },
  });
  packet.attestation.signature = sign(
    null,
    Buffer.from(
      CAMPAIGN_ATTESTATION_DOMAIN +
        '\0' +
        JSON.stringify({
          schemaVersion: 1,
          algorithm: 'Ed25519',
          keyId: packet.attestation.keyId,
          manifest: packet.manifest,
        }),
    ),
    f.pair.privateKey,
  ).toString('base64url');
  out.push({ kind: 'attestation', id: 'manifest', part: 0, payload: bytes(packet) });
  const frames = [];
  for await (const r of encodeCampaignBackup(out)) frames.push(Buffer.from(r));
  f.file = Buffer.concat(frames);
}
