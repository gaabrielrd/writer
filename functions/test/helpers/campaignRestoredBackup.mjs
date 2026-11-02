import { generateKeyPairSync } from 'node:crypto';
import { heroKey } from './campaignAdoption.mjs';
import { seal } from './campaignLore.mjs';
import { startComparison, finishComparison } from './campaignComparison.mjs';
import { backupLoreFixture } from './campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './campaignBackupLoreDb.mjs';
import { imageStorageFixture } from './campaignBackupImage.mjs';
import { uid, adventureId, op, target } from './campaignComparison.mjs';
import { createAdventureLoreService } from '../../src/adventureLore.mjs';
import { createCampaignBackupWitnessService } from '../../src/campaignBackupWitness.mjs';
import { createCampaignBackupBaseReadService } from '../../src/campaignBackupBaseRead.mjs';
import { createCampaignBackupFileService } from '../../src/campaignBackupFile.mjs';
import { baseImageUseKey, digest } from '../../src/campaignBaseContracts.mjs';

export { uid, adventureId };
export const localId = op('restored-backup-local');
export async function restoredBackupFixture({ local = false, long = false } = {}) {
  const media = await imageStorageFixture(),
    data = campaignBackupLoreDb();
  const f = await backupLoreFixture(
    async (x) => {
      if (long) {
        const scene = await x.scenes.getScene(uid, { target, sceneId: x.scene.id });
        await x.scenes.updateScene(uid, {
          target,
          sceneId: scene.id,
          operationId: op('restored-backup-long'),
          expectedRevision: scene.revision,
          patch: { content: '\ufeff  ' + '🐉á'.repeat(15000) + '\n  ' },
        });
      }
      if (local) {
        const lore = createAdventureLoreService({ db: x.db }),
          scope = await lore.listAdventureLore(uid, { adventureId, scope: 'adventure' });
        await lore.saveAdventureLore(uid, {
          adventureId,
          adventureToken: scope.adventureToken,
          entityId: localId,
          operationId: localId,
          expectedRevision: 0,
          expectedCollectionRevision: 0,
          entity: {
            name: 'Guia local',
            aliases: [],
            category: 'character',
            summary: 'Resumo',
            details: 'Texto local 🐉',
            structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
            relations: [],
            isPublic: false,
          },
        });
        const scene = await x.scenes.getScene(uid, { target, sceneId: x.scene.id });
        await x.scenes.setSceneReference(uid, {
          target,
          sceneId: scene.id,
          operationId: op('restored-backup-local-ref'),
          expectedRevision: scene.revision,
          reference: { kind: 'adventure', scopeId: adventureId, entityId: localId },
        });
      }
    },
    data,
    media.storage,
  );
  Object.assign(f, media);
  const oldCampaignId = f.id,
    oldBaseId = f.campaign.activeBaseId,
    oldBasePath = 'users/' + uid + '/campaignBases/' + oldBaseId;
  const witness = createCampaignBackupWitnessService({ db: f.db });
  const oldSource = structuredClone(
    (await witness.getCampaignBackupBaseWitness(uid, f.anchor)).content,
  );
  const baseReader = createCampaignBackupBaseReadService({ db: f.db }),
    proofs = new Map();
  let cursor = null;
  do {
    const page = await baseReader.listCampaignBackupBaseItems(uid, {
      ...f.anchor,
      ...(cursor ? { cursor } : {}),
    });
    for (const row of page.items)
      proofs.set(
        row.id,
        structuredClone(
          (
            await witness.getCampaignBackupItemWitness(uid, {
              ...f.anchor,
              id: row.id,
              itemToken: row.itemToken,
            })
          ).content,
        ),
      );
    cursor = page.nextCursor;
  } while (cursor);
  const id = 'restored-backup-campaign-001',
    baseId = digest('restored-backup-private-base'),
    archiveHash = digest('previous-authenticated-file');
  await f.studio.createCampaign(uid, {
    operationId: id,
    title: 'Cópia',
    description: 'Mesa própria',
    universeId: 'world',
  });
  f.id = id;
  f.path = 'campaigns/' + id;
  f.records.set(f.path, {
    ...f.records.get(f.path),
    activeBaseId: baseId,
    provenance: { kind: 'original', adventureId, baseId },
  });
  const basePath = 'users/' + uid + '/campaignBases/' + baseId;
  for (const [path, value] of [...f.records]) {
    if (path !== oldBasePath && !path.startsWith(oldBasePath + '/')) continue;
    const copy = structuredClone(value);
    if (path === oldBasePath)
      Object.assign(copy, {
        id: baseId,
        campaignId: id,
        sourceMode: 'restored',
        sourceEvidence: { schemaVersion: 1, archiveHash, source: structuredClone(oldSource) },
      });
    else if (path.startsWith(oldBasePath + '/items/'))
      copy.sourceEvidence = { schemaVersion: 1, archiveHash, source: proofs.get(copy.sourceKey) };
    else if (path.startsWith(oldBasePath + '/images/')) {
      const oldKey = copy.useKey;
      copy.useKey = baseImageUseKey(baseId, copy.imageId);
      const library = 'users/' + uid + '/imageLibrary/' + copy.imageId;
      f.records.delete(library + '/uses/' + oldKey);
      f.records.set(library + '/uses/' + copy.useKey, {
        kind: 'campaign-base',
        campaignId: id,
        baseId,
      });
    }
    f.records.set(basePath + path.slice(oldBasePath.length), copy);
    f.records.delete(path);
  }
  f.records.delete('campaigns/' + oldCampaignId);
  f.metadata.set(basePath, { createdAt: 50, updatedAt: 60 });
  f.campaign = structuredClone(f.records.get(f.path));
  f.campaignToken = (await f.lore.listCampaignLore(uid, { campaignId: id, baseId })).campaignToken;
  // The original fixture's domain helpers close over its original campaign.
  // Retarget via the public services so the new copy uses its own native token.
  f.scope = () => ({
    campaignId: f.id,
    campaignToken: f.campaignToken,
    baseId: f.campaign.activeBaseId,
  });
  f.save = async (name, revision = 0, value, key = heroKey) => {
    const header = {
      ...f.scope(),
      sourceKey: key,
      expectedRevision: revision,
      operationId: op(name),
      relatedSourceKeys: [...new Set(value.relations.map((r) => r.targetKey))].sort(),
    };
    const prepared = await f.recovery.prepareCampaignLoreVariant(uid, header);
    const input = { ...header, sealed: seal(prepared, value) };
    const result = await f.lore.saveCampaignLoreVariant(uid, input);
    await f.recovery.resolveCampaignLoreOperation(uid, {
      ...header,
      action: 'save',
      intent: 'confirm',
    });
    return { input, result, prepared, header };
  };
  f.candidate = async (name) => finishComparison(f, (await startComparison(f, name)).result);
  f.start = async (candidate, name) => {
    const page = await f.lore.listCampaignLore(uid, f.scope());
    const input = {
      operationId: op(name),
      campaignId: f.id,
      campaignToken: f.campaignToken,
      comparisonId: candidate.comparisonId,
      currentBaseId: f.campaign.activeBaseId,
      candidateBaseId: candidate.candidateBaseId,
      expectedCollectionRevision: page.collectionRevision,
    };
    return { input, result: await f.adoptions.startCampaignAdoption(uid, input) };
  };
  f.step = (method, p, extra = {}) =>
    f.adoptions[method](uid, {
      adoptionId: p.adoptionId,
      operationId: digest({ method, id: p.adoptionId, checkpoint: p.checkpoint, ...extra }),
      expectedCheckpoint: p.checkpoint,
      ...extra,
    });
  f.finish = async (p) => {
    p = (await f.step('prepareCampaignAdoption', p)).progress;
    for (let n = 0; n < 300 && p.state === 'preparing'; n++)
      p = (await f.step('advanceCampaignAdoption', p)).progress;
    if (p.state !== 'ready') throw new Error('Adoção não pronta: ' + JSON.stringify(p));
    return p;
  };
  await f.refresh();
  const keysPair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'restored-test-key', state: 'active', publicKey: keysPair.publicKey }];
  f.writer = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: keysPair.privateKey,
    now: () => 5000,
  });
  f.basePath = basePath;
  f.oldBasePath = oldBasePath;
  f.oldSource = oldSource;
  f.baseId = baseId;
  f.witness = witness;
  f.baseReader = baseReader;
  f.items = () =>
    [...f.records].filter(([p]) => p.startsWith(basePath + '/items/')).map(([, v]) => v);
  f.listBase = (extra) => baseReader.listCampaignBackupBaseItems(uid, { ...f.anchor, ...extra });
  f.witnessItem = async (key) => {
    let cursor = null;
    do {
      const page = await f.listBase(cursor ? { cursor } : {});
      const row = page.items.find((r) => r.id === key);
      if (row)
        return witness.getCampaignBackupItemWitness(uid, {
          ...f.anchor,
          id: key,
          itemToken: row.itemToken,
        });
      cursor = page.nextCursor;
    } while (cursor);
    throw new Error('Item ausente');
  };
  f.write = async (hook) => {
    const frames = [],
      result = { commits: 0, aborts: 0 };
    const proof = await f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        sink: {
          write: async (b) => {
            frames.push(Buffer.from(b));
            await hook?.(result, frames.length);
          },
          commit: async () => {
            result.commits++;
          },
          abort: async () => {
            result.aborts++;
            frames.length = 0;
          },
        },
      },
    );
    return { ...result, proof, bytes: Buffer.concat(frames) };
  };
  return f;
}
export function recreate(f, path) {
  f.metadata.set(path, { createdAt: 11, updatedAt: 30 });
}
