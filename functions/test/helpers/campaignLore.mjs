import { createCipheriv, randomBytes } from 'node:crypto';
import {
  baseSourceKey,
  baseTextFields,
  baseBodyKey,
  digest,
} from '../../src/campaignBaseContracts.mjs';
import { variantAAD } from '../../src/campaignVariantRecovery.mjs';
export const uid = 'owner',
  campaignId = 'campaign-lore-current-001',
  baseId = digest('base-lore-current-001'),
  adventureId = 'adventure-lore-current-001',
  universeId = 'world';
export const basePath = `users/${uid}/campaignBases/${baseId}`,
  campaignPath = 'campaigns/' + campaignId;
export const key = (id) => baseSourceKey({ kind: 'lore', id, scopeId: universeId });
export const op = (id) => 'campaign-lore-operation-' + id;
export const entity = (extra = {}) => ({
  name: 'Guardião da mesa',
  aliases: ['Vigia'],
  category: 'character',
  summary: 'Resumo da mesa',
  details: ' Texto próprio da variante\n🐉  ',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  ...extra,
});
export function seedLoreRecords() {
  const records = new Map([
    [
      campaignPath,
      {
        id: campaignId,
        ownerId: uid,
        schemaVersion: 1,
        revision: 1,
        title: 'Mesa',
        provenance: { kind: 'original', adventureId, baseId },
        activeBaseId: baseId,
        status: 'planning',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    [
      'adventures/' + adventureId,
      {
        id: adventureId,
        ownerId: uid,
        schemaVersion: 1,
        title: 'Origem atual',
        universeId,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    ['universes/' + universeId, { authorId: uid, loreVersion: 1, privacyVersion: 1 }],
    [
      basePath,
      {
        id: baseId,
        ownerId: uid,
        campaignId,
        adventureId,
        universeId,
        schemaVersion: 1,
        state: 'ready',
        capturedAt: 1,
      },
    ],
  ]);
  for (const id of ['a', 'b', 'c']) {
    const sourceKey = key(id),
      text = baseTextFields(sourceKey, {
        summary: 'Resumo congelado ' + id,
        details: 'Texto congelado ' + id,
      });
    records.set(basePath + '/items/' + sourceKey, {
      sourceKey,
      kind: 'lore',
      origin: { kind: 'lore', id, scopeId: universeId },
      title: 'Ficha congelada ' + id,
      parentKey: null,
      archived: false,
      orderKey: id,
      fields: text.fields,
      structured: { category: 'character', aliases: ['Alias ' + id], relations: [] },
    });
    for (const chunk of text.bodies)
      records.set(basePath + '/bodies/' + baseBodyKey(sourceKey, chunk.field, chunk.index), chunk);
    records.set(`universes/${universeId}/lore/${id}`, { name: 'Nome vivo não usar ' + id });
  }
  return records;
}
export function header(scope, name, revision = 0, sourceKey = key('a')) {
  return { ...scope, sourceKey, operationId: op(name), expectedRevision: revision };
}
export function seal(prepared, content, nonce = randomBytes(12), aad = variantAAD(prepared)) {
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(prepared.key, 'base64'), nonce);
  cipher.setAAD(aad);
  return {
    version: 1,
    algorithm: 'AES-GCM',
    nonce: nonce.toString('base64'),
    ciphertext: Buffer.concat([
      cipher.update(Buffer.from(typeof content === 'string' ? content : JSON.stringify(content))),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64'),
  };
}
