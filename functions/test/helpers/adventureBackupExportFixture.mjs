import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { editorChatFixture } from './editorChatFixture.mjs';
import { adventureImportDb } from './adventureImportDb.mjs';
import { createAdventureBackupService } from '../../src/adventureBackupService.mjs';
import { createAdventureBlocksService } from '../../src/adventureBlocks.mjs';
import { createAdventureLoreService } from '../../src/adventureLore.mjs';
import { adventureIdentityToken } from '../../src/adventureLoreContracts.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
import { libraryImage } from '../../src/imageLibrary.mjs';
import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
export async function adventureBackupExportFixture() {
  const f = await editorChatFixture('adventure', false, adventureImportDb({ nativeUpdates: true }));
  const uid = 'author',
    id = f.target.id,
    sceneId = f.resource.id,
    blockId = 'export-fixture-block-0001',
    imageId = 'export-fixture-image-0001';
  const text = '<p>' + 'Céu de inverno 🐉 memória '.repeat(5000) + '</p>';
  await f.scenes.createSceneGroup(uid, {
    target: f.target,
    operationId: 'export-fixture-part-0001',
    title: 'Parte privada',
  });
  await f.scenes.updateScene(uid, {
    target: f.target,
    sceneId,
    operationId: 'export-fixture-text-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + sceneId).revision,
    patch: { content: text },
  });
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 2100 });
  await blocks.createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'Bloco privado',
    content: '<p>Texto do bloco.</p>',
  });
  const lore = createAdventureLoreService({ db: f.db, now: () => 2200 });
  const adventureToken = await f.db.runTransaction(async (tx) =>
    adventureIdentityToken(uid, id, await tx.get(f.db.doc(f.path))),
  );
  await lore.saveAdventureLore(uid, {
    adventureId: id,
    adventureToken,
    entityId: 'export-fixture-lore-0001',
    operationId: 'export-fixture-lore-0001',
    expectedRevision: 0,
    expectedCollectionRevision: 0,
    entity: {
      name: 'Vigia da Torre',
      aliases: [],
      category: 'other',
      summary: 'Resumo particular',
      details: 'Detalhes particulares',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
      isPublic: false,
    },
  });
  const binding = await f.call({ action: 'getAdventurePersonaBinding', adventureId: id, sceneId });
  await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: id,
    sceneId,
    adventureToken: binding.adventureToken,
    expectedBindingToken: binding.bindingToken,
    value: { personaComplement: { personaId: DEFAULT_PERSONAS[0].id, overrides: [] } },
    operationId: 'export-fixture-persona-0001',
  });
  const png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#345678' } })
    .png()
    .toBuffer();
  const path = 'book-covers/' + uid + '/' + imageId + '.png';
  await f.db.runTransaction((tx) =>
    tx.create(
      f.db.doc('users/' + uid + '/imageLibrary/' + imageId),
      libraryImage(
        imageId,
        {
          title: 'Ilustração particular',
          coverUrl: 'DO_NOT_COPY_TOKEN_URL',
          path,
          acceptedAt: 2300,
        },
        2300,
      ),
    ),
  );
  for (const resource of [
    { kind: 'scene', id: sceneId },
    { kind: 'block', id: blockId },
  ]) {
    const key = f.path + (resource.kind === 'scene' ? '/scenes/' : '/sceneBlocks/') + resource.id;
    await blocks.setAdventureBlockImage(uid, {
      adventureId: id,
      resource,
      operationId: 'export-fixture-image-' + resource.kind,
      expectedRevision: f.records.get(key).revision,
      image: { imageId, alt: 'Imagem', caption: 'Legenda' },
    });
  }
  const history = createWorkHistoryService({ db: f.db, now: () => 2400 });
  for (const resource of [
    { kind: 'scene', id: sceneId },
    { kind: 'block', id: blockId },
  ]) {
    const source = await history.getWorkVersionSource(uid, { target: f.target, resource });
    await history.createWorkVersion(uid, {
      target: f.target,
      resource,
      operationId: 'export-fixture-version-' + resource.kind,
      expectedSourceToken: source.sourceToken,
      label: 'Versão manual',
    });
  }
  const io = [],
    hash = createHash('sha256').update(png).digest('hex');
  const assets = {
    async metadata(p) {
      io.push(['metadata', p]);
      return {
        generation: '12',
        metageneration: '3',
        size: png.length,
        contentType: 'image/png',
        accepted: true,
      };
    },
    async hashGeneration(p, g, max) {
      io.push(['hash', p, g]);
      if (png.length > max) throw Error('Bound exceeded');
      return {
        byteLength: png.length,
        contentHash: hash,
        signature: png.subarray(0, 8).toString('hex'),
      };
    },
    async readRange(p, g, start, end) {
      io.push(['range', p, g, start, end]);
      return Buffer.from(png.subarray(start, end + 1));
    },
  };
  return {
    ...f,
    uid,
    id,
    sceneId,
    blockId,
    imageId,
    text,
    png,
    io,
    assets,
    api: createAdventureBackupService({ db: f.db, assets }),
  };
}
