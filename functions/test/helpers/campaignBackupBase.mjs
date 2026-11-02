import { studioDb } from './studioDb.mjs';
import { comparisonFixture, uid } from './campaignComparison.mjs';
import { createCampaignBackupSourceService } from '../../src/campaignBackupSource.mjs';
import { createCampaignBackupDerivedSourceService } from '../../src/campaignBackupDerivedSource.mjs';
import { createCampaignBackupBaseReadService } from '../../src/campaignBackupBaseRead.mjs';
export { uid };
export async function baseFixture(beforeCapture, assets) {
  const data = studioDb(),
    domain = await comparisonFixture(data.db, assets, beforeCapture),
    f = { ...data, ...domain };
  f.id = f.campaign.id;
  f.path = 'users/' + uid + '/campaignBases/' + f.campaign.activeBaseId;
  f.own = createCampaignBackupSourceService({ db: f.db });
  f.derived = createCampaignBackupDerivedSourceService({ db: f.db });
  f.backup = createCampaignBackupBaseReadService({ db: f.db });
  await refreshBase(f);
  f.list = (extra = {}) => f.backup.listCampaignBackupBaseItems(uid, { ...f.anchor, ...extra });
  f.item = (ref, extra = {}) =>
    f.backup.readCampaignBackupBaseItem(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
      index: 0,
      ...extra,
    });
  f.text = (ref, field, extra = {}) =>
    f.backup.readCampaignBackupBaseText(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
      field,
      index: 0,
      ...extra,
    });
  f.stored = (kind, predicate = () => true) =>
    [...f.records].find(
      ([p, v]) => p.startsWith(f.path + '/items/') && v.kind === kind && predicate(v),
    )?.[1];
  return f;
}
export async function refreshBase(f) {
  const own = await f.own.getCampaignBackupSource(uid, { campaignId: f.id }),
    source = await f.derived.getCampaignBackupDerivedSource(uid, {
      campaignId: f.id,
      sourceToken: own.sourceToken,
    });
  f.anchor = {
    campaignId: f.id,
    sourceToken: source.sourceToken,
    derivedToken: source.derivedToken,
  };
  f.baseId = source.base?.id;
}
export async function logical(f, ref) {
  const chunks = [];
  let response;
  for (let index = 0; !response || index < response.chunkCount; index++) {
    response = await f.item(ref, { index });
    if (response.outcome === 'unavailable') return null;
    chunks.push(Buffer.from(response.chunkBase64, 'base64'));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const row = async (f, item) => (await f.list()).items.find((r) => r.id === item.sourceKey);
