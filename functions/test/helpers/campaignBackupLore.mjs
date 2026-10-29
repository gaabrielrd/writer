import { studioDb } from './studioDb.mjs';
import { adoptionFixture, uid, op, heroKey, entity } from './campaignAdoption.mjs';
import { createCampaignBackupSourceService } from '../../src/campaignBackupSource.mjs';
import { createCampaignBackupDerivedSourceService } from '../../src/campaignBackupDerivedSource.mjs';
import { createCampaignBackupLoreService } from '../../src/campaignBackupLore.mjs';
export { uid, op, heroKey, entity };
export async function backupLoreFixture(beforeCapture, data = studioDb()) {
  const domain = await adoptionFixture(data.db, beforeCapture),
    f = { ...data, ...domain };
  f.id = f.campaign.id;
  f.path = 'campaigns/' + f.id;
  f.own = createCampaignBackupSourceService({ db: f.db });
  f.derived = createCampaignBackupDerivedSourceService({ db: f.db });
  f.backup = createCampaignBackupLoreService({ db: f.db });
  f.refresh = async () => {
    const own = await f.own.getCampaignBackupSource(uid, { campaignId: f.id }),
      d = await f.derived.getCampaignBackupDerivedSource(uid, {
        campaignId: f.id,
        sourceToken: own.sourceToken,
      });
    f.anchor = { campaignId: f.id, sourceToken: own.sourceToken, derivedToken: d.derivedToken };
  };
  f.list = (extra = {}) => f.backup.listCampaignBackupLoreVariants(uid, { ...f.anchor, ...extra });
  f.read = (ref, extra = {}) =>
    f.backup.readCampaignBackupLoreVariant(uid, {
      ...f.anchor,
      id: ref.id,
      variantToken: ref.variantToken,
      ...extra,
    });
  f.readAnchor = (ref) =>
    f.backup.readCampaignBackupLoreAnchor(uid, {
      ...f.anchor,
      id: ref.id,
      variantToken: ref.variantToken,
    });
  f.text = (ref, field, extra = {}) =>
    f.backup.readCampaignBackupLoreAnchorText(uid, {
      ...f.anchor,
      id: ref.id,
      variantToken: ref.variantToken,
      field,
      index: 0,
      ...extra,
    });
  f.overlayPath = () => {
    const root = f.records.get(f.path);
    return (
      f.path +
      (root.activeLoreGenerationId ? '/loreGenerations/' + root.activeLoreGenerationId : '') +
      '/loreVariants/'
    );
  };
  let sequence = 0;
  f.adopt = async (choice = 'keep-local') => {
    const name = 'backup-adoption-' + ++sequence,
      candidate = await f.candidate(name),
      start = await f.start(candidate, name);
    let p = start.result.progress;
    const page = await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId });
    for (const r of page.items) {
      const stored = f.records.get(f.overlayPath() + r.sourceKey);
      p = (
        await f.step('decideCampaignAdoption', p, {
          sourceKey: r.sourceKey,
          expectedRevision: stored.revision,
          choice,
        })
      ).progress;
    }
    p = await f.finish(p);
    await f.step('activateCampaignAdoption', p);
    f.campaign = f.acceptCampaign(f.records.get(f.path));
    await f.refresh();
    return p;
  };
  await f.refresh();
  return f;
}
export async function savedLoreFixture(value = entity(), beforeCapture) {
  const f = await backupLoreFixture(beforeCapture);
  await f.save('backup-initial', 0, value);
  await f.refresh();
  return f;
}
export async function patch(f, path, value) {
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc(path), value));
}
export async function remove(f, path) {
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
}
