import { digest, sha256 } from './adventureRestoreContracts.mjs';
import {
  contentClosed as closed,
  contentHash as hash,
  contentId as id,
  contentInvalid as bad,
} from './adventureContentPrimitives.mjs';
import * as schema from './adventureContentSchema.mjs';
import { adventureCoreRecordIdentity, adventureCoreManifest } from './adventureArchiveCore.mjs';
import { adventureHistoryManifest } from './adventureArchiveHistory.mjs';
import { adventureDraftsManifest } from './adventureArchiveDrafts.mjs';
import { adventureImagesManifest, adventureImageAddressLine } from './adventureArchiveImages.mjs';
import { validatePortableUniverseOrigin } from './portableUniverseOrigin.mjs';
import { sequenceKey } from './narrativeContracts.mjs';
const kinds = [
  'part',
  'scene',
  'block',
  'arc',
  'milestone',
  'event',
  'lore',
  'version',
  'persona',
  'image',
  'asset',
  'checklist',
];
const bodyParents = {
  'scene-body': 'scene',
  'scene-planning': 'scene',
  'scene-reference': 'scene',
  'block-body': 'block',
  'milestone-order': 'arc',
  milestone: 'arc',
};
/** Pure projection of authenticated input. Output hashes remain source bindings, not a new backup proof. */
export function createAdventureRestoreRemapper(input) {
  if (
    !closed(input, ['schemaVersion', 'jobToken', 'sourceAdventureId', 'adventureId']) ||
    input.schemaVersion !== 1 ||
    !hash(input.jobToken) ||
    !id(input.sourceAdventureId) ||
    !id(input.adventureId) ||
    !/^[a-zA-Z0-9-]{16,80}$/.test(input.adventureId) ||
    input.adventureId === input.sourceAdventureId
  )
    bad();
  const context = structuredClone(input);
  function identity(kind, original, parent = null) {
    if (
      !kinds.includes(kind) ||
      !id(original) ||
      (kind === 'milestone' ? !id(parent) : parent !== null)
    )
      bad();
    const value = digest({
      domain: 'writer-adventure-restore-identity-v1',
      ...context,
      kind,
      original,
      parent,
    });
    return kind === 'asset' ? value : (kind === 'persona' ? 'custom-' : 'restore-') + value;
  }
  const assetAddress = (resource) => {
    if (
      !closed(resource, ['kind', 'id']) ||
      !['scene', 'block'].includes(resource.kind) ||
      !id(resource.id)
    )
      bad();
    return sha256(Buffer.from(adventureImageAddressLine(resource.kind, resource.id)));
  };
  const imageForResource = (kind, original) =>
    identity('image', assetAddress({ kind, id: original }));
  const maybe = (kind, value) => (value === null ? null : identity(kind, value));
  function complement(value) {
    if (value !== null && value !== undefined)
      value.personaId = identity('persona', value.personaId);
  }
  function loreReference(v) {
    if (v.kind === 'adventure' && v.scopeId === context.sourceAdventureId) {
      v.scopeId = context.adventureId;
      v.entityId = identity('lore', v.entityId);
    }
  }
  function loreRelation(v) {
    const parts = v.targetEntityId.split(':');
    if (parts[0] === 'adventure' && parts[1] === context.sourceAdventureId)
      v.targetEntityId = 'adventure:' + context.adventureId + ':' + identity('lore', parts[2]);
  }
  function narrativeSource(v) {
    const parent = v.kind === 'milestone' ? v.arcId : null;
    v.id = identity(v.kind, v.id, parent);
    if (parent !== null) v.arcId = identity('arc', parent);
  }
  function reference(v) {
    if (v.kind === 'lore') loreReference(v.reference);
    else v[v.kind + 'Id'] = identity(v.kind, v[v.kind + 'Id']);
  }
  function image(v, kind, original) {
    if (v !== null && v !== undefined) v.imageId = imageForResource(kind, original);
  }
  async function sameRecord(record, scope, original) {
    const expected = await adventureCoreRecordIdentity(scope, original);
    if (record.kind !== expected.kind || record.id !== expected.id) bad();
  }
  function same(value, expected) {
    if (digest(value) !== digest(expected)) bad();
  }
  async function mapJSON(suppliedRecord, suppliedValue) {
    const record = structuredClone(suppliedRecord),
      value = structuredClone(suppliedValue);
    if (!closed(record, ['kind', 'id', 'part']) || !id(record.id) || record.part !== 0) bad();
    let newId,
      rawRecord = null,
      sourceOnly = false,
      sourceBindings = null;
    const kind = record.kind;
    if (kind === 'adventure-metadata' || kind === 'adventure-part') {
      const type = kind === 'adventure-metadata' ? 'adventure' : 'part';
      schema.validateAdventureStructure(value, type);
      await sameRecord(record, { family: 'structure', kind: type }, record.id);
      if (type === 'adventure') {
        if (record.id !== context.sourceAdventureId) bad();
        newId = context.adventureId;
        if (value.data.personaId != null)
          value.data.personaId = identity('persona', value.data.personaId);
      } else newId = identity('part', record.id);
    } else if (kind === 'adventure-resource') {
      schema.validateAdventureResource(value);
      const type = value.kind,
        oldId = value.id,
        oldParent = value.parentId,
        d = value.data;
      await sameRecord(record, { family: 'resources', kind: type, parentId: oldParent }, oldId);
      if (Object.hasOwn(bodyParents, type)) value.parentId = identity(bodyParents[type], oldParent);
      if (
        type === 'progress' ||
        type === 'scene-control' ||
        type.endsWith('-body') ||
        type === 'scene-planning'
      ) {
        if (type === 'progress' || type.endsWith('-body') || type === 'scene-planning') {
          if (oldId !== 'current') bad();
        } else if (oldId !== 'unassigned') bad();
      } else if (['arc-order', 'event-order', 'milestone-order'].includes(type)) {
        const sequence = type.slice(0, -6);
        if (
          oldId !==
          sequenceKey({ kind: sequence, ...(sequence === 'milestone' ? { arcId: oldParent } : {}) })
        )
          bad();
        value.id = sequenceKey({
          kind: sequence,
          ...(sequence === 'milestone' ? { arcId: value.parentId } : {}),
        });
      } else if (type === 'scene-reference') {
        loreReference(d);
        value.id = digest(d);
      } else if (type === 'narrative-link') {
        narrativeSource(d.source);
        reference(d.reference);
        value.id = digest({ source: d.source, reference: d.reference });
      } else {
        value.id = identity(
          type === 'part-control' ? 'part' : type,
          oldId,
          type === 'milestone' ? oldParent : null,
        );
        if (type === 'scene') {
          if (Object.hasOwn(d, 'parentId')) d.parentId = maybe('part', d.parentId);
          if (Object.hasOwn(d, 'formerParentId'))
            d.formerParentId = maybe('part', d.formerParentId);
          complement(d.personaComplement);
          image(d.mainBlockImage, 'scene', oldId);
        } else if (type === 'block') {
          d.sceneId = identity('scene', d.sceneId);
          image(d.image, 'block', oldId);
        } else if (type === 'milestone') d.arcId = value.parentId;
      }
      newId = (
        await adventureCoreRecordIdentity(
          { family: 'resources', kind: type, parentId: value.parentId },
          value.id,
        )
      ).id;
    } else if (kind === 'adventure-lore' || kind === 'adventure-lore-body') {
      const type = kind === 'adventure-lore' ? 'lore' : 'lore-body';
      schema.validateAdventureLore(value, type);
      await sameRecord(record, { family: 'lore', kind: type }, value.id);
      newId = value.id = identity('lore', value.id);
      if (type === 'lore-body') value.data.relations.forEach(loreRelation);
    } else if (kind === 'adventure-persona') {
      schema.validateAdventurePersona(value);
      await sameRecord(record, { family: 'personas', scope: value.scope }, value.bindingId);
      if (value.scope === 'adventure') {
        if (value.bindingId !== context.sourceAdventureId) bad();
        value.bindingId = context.adventureId;
      } else value.bindingId = identity('scene', value.bindingId);
      if (value.personaId !== null) {
        value.personaId = identity('persona', value.personaId);
        value.profile.id = value.personaId;
      }
      newId = (
        await adventureCoreRecordIdentity(
          { family: 'personas', scope: value.scope },
          value.bindingId,
        )
      ).id;
    } else if (kind === 'adventure-version') {
      schema.validateAdventureVersion(value);
      if (record.id !== value.id) bad();
      value.id = newId = identity('version', value.id);
      value.data.resource.id = identity(value.data.resource.kind, value.data.resource.id);
    } else if (kind === 'adventure-version-body') {
      schema.validateAdventureVersionBody(value);
      if (record.id !== value.versionId) bad();
      sourceBindings = { headerHash: value.headerHash };
      value.versionId = newId = identity('version', value.versionId);
      rawRecord = { kind: 'adventure-version-text', id: newId, part: 0 };
    } else if (kind === 'adventure-draft') {
      schema.validateAdventureDraft(value);
      const sourceAddress = await adventureCoreRecordIdentity(
        { family: 'resources', kind: value.resource.kind, parentId: null },
        value.resource.id,
      );
      if (record.id !== sourceAddress.id) bad();
      sourceBindings = { current: structuredClone(value.current) };
      value.resource.id = identity(value.resource.kind, value.resource.id);
      newId = (
        await adventureCoreRecordIdentity(
          { family: 'resources', kind: value.resource.kind, parentId: null },
          value.resource.id,
        )
      ).id;
      rawRecord = { kind: 'adventure-draft-text', id: newId, part: 0 };
    } else if (kind === 'adventure-image-binding') {
      schema.validateAdventureImageBinding(value);
      const address = assetAddress(value.resource);
      if (record.id !== address || (value.image !== null && value.image.assetId !== address)) bad();
      const resource = structuredClone(value.resource);
      value.resource.id = identity(resource.kind, resource.id);
      newId = identity('asset', address);
      if (value.image !== null) {
        value.image.assetId = newId;
        value.image.imageId = imageForResource(resource.kind, resource.id);
      }
    } else if (kind === 'adventure-image') {
      schema.validateAdventureImageAsset(value);
      if (record.id !== value.assetId) bad();
      value.imageId = identity('image', value.assetId);
      newId = value.assetId = identity('asset', value.assetId);
      rawRecord = { kind: 'adventure-image-bytes', id: newId, part: 0 };
    } else {
      if (record.id !== context.sourceAdventureId) bad();
      if (kind === 'adventure-universe') {
        if (!closed(value, ['schemaVersion', 'origin']) || value.schemaVersion !== 1) bad();
        try {
          same(value.origin, validatePortableUniverseOrigin(value.origin));
        } catch {
          bad();
        }
      } else if (
        ['adventure-resources', 'adventure-lore-end', 'adventure-personas'].includes(kind)
      ) {
        const section = {
          'adventure-resources': 'resources',
          'adventure-lore-end': 'lore',
          'adventure-personas': 'personas',
        }[kind];
        try {
          same(value, adventureCoreManifest(section, value.units, value.digest, value.counts));
        } catch {
          bad();
        }
      } else if (kind === 'adventure-history') {
        try {
          same(
            value,
            adventureHistoryManifest(
              value.versions,
              value.nativeRecords,
              value.textBytes,
              value.digest,
            ),
          );
        } catch {
          bad();
        }
      } else if (kind === 'adventure-drafts') {
        try {
          same(value, adventureDraftsManifest(value.count, value.bytes, value.digest));
        } catch {
          bad();
        }
      } else if (kind === 'adventure-images') {
        try {
          same(
            value,
            adventureImagesManifest(value.bindings, value.assets, value.bytes, value.digest),
          );
        } catch {
          bad();
        }
      } else bad();
      sourceOnly = true;
      newId = record.id;
    }
    return {
      validation: 'identity-projection-only',
      record: { kind, id: newId, part: 0 },
      value,
      rawRecord,
      sourceOnly,
      sourceBindings,
    };
  }
  return Object.freeze({ identity, imageForResource, mapJSON });
}
