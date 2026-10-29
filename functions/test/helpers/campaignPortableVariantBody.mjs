import assert from 'node:assert/strict';
import { restoredBackupFixture, uid } from './campaignRestoredBackup.mjs';
import { entity, seal } from './campaignLore.mjs';
import { heroKey } from './campaignAdoption.mjs';
import { campaignBackupTestIndexes } from './campaignBackupTestIndexes.mjs';
import { createCampaignBackupReviewService } from '../../src/campaignBackupReview.mjs';
import { bodyRefs, variantChunkId } from '../../src/campaignLoreContracts.mjs';
import { bindingPath, normalizedBodyBinding } from '../../src/campaignLoreStorage.mjs';
import { splitHistoryContent } from '../../src/workHistoryContracts.mjs';
import { digest } from '../../src/workProgressContracts.mjs';
export const codec = 'portable-relations-v1';
export const unknown = digest('portable-variant-unknown');
export const other = digest('portable-variant-other');
export const known = (key, type = 'Conhece') => ({
  targetKey: key,
  relationType: type,
  description: 'Texto literal 🐉',
});
export const unresolved = (key = unknown) => ({ targetKey: key, available: false });
export const wire = (r) => ({ ...r, available: true });

export async function fixture(relations) {
  const f = await restoredBackupFixture({ local: true });
  f.target = f.items().find((r) => r.origin.kind === 'adventure-lore').sourceKey;
  await f.save('portable-variant-initial', 0, entity());
  const reads = [],
    transaction = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    transaction((tx) =>
      fn({
        ...tx,
        get: (ref) => {
          if (ref.path) reads.push({ path: ref.path });
          return tx.get(ref);
        },
        getAll: (ref, options) => {
          reads.push({ path: ref.path, fields: options.fieldMask });
          return tx.getAll(ref, options);
        },
      }),
    );
  f.reads = reads;
  f.context = () => {
    const root = f.records.get(f.path),
      generationId = root.activeLoreGenerationId ?? null;
    return {
      uid,
      campaignId: f.id,
      campaignToken: f.campaignToken,
      base: { id: root.activeBaseId },
      generationId,
      lorePath: generationId ? f.path + '/loreGenerations/' + generationId : f.path,
    };
  };
  f.overlay = () => f.records.get(f.overlayPath() + heroKey);
  f.body = () =>
    bodyRefs(f.db, f.context(), f.overlay())
      .map((r) => f.records.get(r.path).content)
      .join('');
  f.install = (raw) => {
    const record = f.overlay(),
      context = f.context(),
      binding = normalizedBodyBinding(context, record),
      parts = splitHistoryContent(raw);
    for (const ref of bodyRefs(f.db, context, record)) f.records.delete(ref.path);
    record.bodyCodec = codec;
    record.manifest = {
      bodyRevision: binding.bodyRevision,
      bytes: Buffer.byteLength(raw),
      chunkCount: parts.length,
      sha256: digest(raw),
    };
    parts.forEach((content, index) => {
      const path =
        bindingPath(context, binding) +
        '/loreVariantBodies/' +
        variantChunkId(
          { ...context, base: { id: binding.baseId } },
          heroKey,
          binding.bodyRevision,
          index,
        );
      f.records.set(path, {
        sourceKey: heroKey,
        baseId: binding.baseId,
        campaignToken: f.campaignToken,
        revision: binding.bodyRevision,
        index,
        content,
      });
    });
  };
  f.install(JSON.stringify(entity({ relations: relations ? relations(f) : [unresolved()] })));
  f.read = () => f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  let sequence = 0;
  f.action = async (action) => {
    const header = {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: f.overlay().revision,
      operationId: 'portable-variant-action-' + ++sequence,
    };
    const methods = {
      remove: 'removeCampaignLore',
      restore: 'restoreCampaignLore',
      discard: 'discardCampaignLoreVariant',
    };
    const r = await f.lore[methods[action]](uid, header);
    await f.recovery.resolveCampaignLoreOperation(uid, { ...header, action, intent: 'confirm' });
    return r;
  };
  f.prepare = async (name, value, keys) => {
    const header = {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: f.overlay().revision,
      operationId: name,
      relatedSourceKeys: keys ?? [...new Set(value.relations.map((r) => r.targetKey))].sort(),
    };
    const prepared = await f.recovery.prepareCampaignLoreVariant(uid, header);
    return { ...header, sealed: seal(prepared, value) };
  };
  f.review = async () => {
    const { bytes } = await f.write(),
      opened = [];
    const result = await createCampaignBackupReviewService({
      db: f.db,
      keys: f.keys,
      now: () => 6000,
      createIndex: campaignBackupTestIndexes(opened),
    }).reviewCampaignBackup(uid, {
      size: bytes.length,
      read: async (o, n) => bytes.subarray(o, o + n),
    });
    assert.ok(opened.every((i) => i.disposed === 1));
    assert.doesNotMatch(bytes.toString(), /bodyCodec|portable-relations-v1/);
    return result;
  };
  f.bodyReads = () =>
    reads.filter(
      (r) => r.path.includes('/loreVariantBodies/') && (!r.fields || r.fields.includes('content')),
    );
  await f.refresh();
  return f;
}
