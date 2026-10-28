import { digest, inconsistent, sum, sha256 } from './adventureRestoreContracts.mjs';
import { validAdventureImageState } from './adventureRestoreImageMeta.mjs';
export const adventureImagePrivateAddress = (id) => ({ scope: 'job', path: ['preparedRoot', id] });
export const adventureImageStateAddress = adventureImagePrivateAddress('image-state');
export const adventureImageBindingAddress = (id) =>
  adventureImagePrivateAddress('image-binding-' + id);
export const adventureImageAssetAddress = (id) => adventureImagePrivateAddress('image-' + id);
export const adventureImageBytesAddress = (id, part) =>
  adventureImagePrivateAddress('image-bytes-' + id + '-' + String(part).padStart(6, '0'));
const same = (a, b) => {
  if (digest(a) !== digest(b)) inconsistent();
};
const reference = (binding) =>
  binding.image === null
    ? null
    : {
        imageId: binding.image.imageId,
        alt: binding.image.alt,
        caption: binding.image.caption,
      };
export async function projectAdventureRestoreImages({
  loaded,
  stage,
  unit,
  reader,
  mapper,
  previousState,
}) {
  const mapped = await mapper.mapJSON(unit.record, unit.value),
    value = mapped.value,
    next = structuredClone(stage),
    writes = [],
    proofs = [unit],
    checks = [];
  function advance() {
    next.imageIndex++;
    next.imageUnits++;
  }
  function check(address, verify) {
    checks.push({ address, verify });
  }
  async function bindingHead(sourceBinding, binding) {
    const original = sourceBinding.resource,
      source = await reader.findResource(original.kind, original.id);
    proofs.push(source);
    const sourceImage =
      original.kind === 'scene' ? source.value.data.mainBlockImage : source.value.data.image;
    same(sourceImage ?? null, reference(sourceBinding));
    const resource = binding.resource,
      field = resource.kind === 'scene' ? 'mainBlockImage' : 'image';
    check(
      {
        scope: 'adventure',
        path: [resource.kind === 'scene' ? 'scenes' : 'sceneBlocks', resource.id],
      },
      (head) => {
        if (head.ownerId !== loaded.uid || head.id !== resource.id || head.deleting === true)
          inconsistent();
        same(head[field] ?? null, reference(binding));
      },
    );
  }
  if (unit.record.kind === 'adventure-image-binding') {
    if (stage.imagePending) inconsistent();
    await bindingHead(unit.value, value);
    writes.push({ address: adventureImageBindingAddress(mapped.record.id), value });
    next.imageBindings = sum(next.imageBindings, 1);
    advance();
  } else if (unit.record.kind === 'adventure-image') {
    const bindingUnit = await reader.readItem(stage.imageIndex - 1);
    if (bindingUnit.record.kind !== 'adventure-image-binding') inconsistent();
    proofs.push(bindingUnit);
    const mappedBinding = await mapper.mapJSON(bindingUnit.record, bindingUnit.value),
      binding = mappedBinding.value,
      first = !stage.imagePending;
    if (
      !binding.image ||
      binding.image.assetId !== value.assetId ||
      binding.image.imageId !== value.imageId
    )
      inconsistent();
    await bindingHead(bindingUnit.value, binding);
    check(adventureImageBindingAddress(value.assetId), (old) => same(old, binding));
    if (first) {
      if (previousState && !previousState.done) inconsistent();
      writes.push({ address: adventureImageAssetAddress(value.assetId), value });
    } else {
      if (
        !validAdventureImageState(previousState) ||
        previousState.ownerId !== loaded.uid ||
        previousState.unitIndex !== stage.imageIndex ||
        previousState.done
      )
        inconsistent();
      same(previousState.asset, value);
      same(previousState.binding, binding);
      check(adventureImageAssetAddress(value.assetId), (old) => same(old, value));
    }
    const raw = await reader.openMappedRaw(stage.imageIndex);
    same(raw.manifest, {
      byteLength: value.byteLength,
      chunkCount: value.chunkCount,
      contentHash: value.contentHash,
    });
    const part = await raw.readStep(first ? null : previousState.rawCheckpoint);
    proofs.push(part);
    const state = {
      schemaVersion: 1,
      ownerId: loaded.uid,
      unitIndex: stage.imageIndex,
      asset: value,
      binding,
      rawCheckpoint: part.checkpoint,
      done: part.done,
    };
    if (!validAdventureImageState(state)) inconsistent();
    const stateWrite = stage.imageStateCreated
      ? {
          address: adventureImageStateAddress,
          mode: 'update',
          update: (old) => {
            same(old, previousState);
            return state;
          },
        }
      : { address: adventureImageStateAddress, value: state };
    writes.push(stateWrite, {
      address: adventureImageBytesAddress(value.assetId, part.record.part),
      value: {
        schemaVersion: 1,
        ownerId: loaded.uid,
        assetId: value.assetId,
        index: part.record.part,
        contentHash: sha256(part.bytes),
        bytes: Array.from(part.bytes),
      },
    });
    next.imageStateCreated = true;
    next.imageFrames = sum(next.imageFrames, 1);
    next.imageBytes = sum(next.imageBytes, part.bytes.length);
    next.imagePending = !part.done;
    if (part.done) {
      next.imageAssets = sum(next.imageAssets, 1);
      advance();
    }
  } else if (unit.record.kind === 'adventure-images') {
    if (
      stage.imagePending ||
      value.bindings !== stage.imageBindings ||
      value.assets !== stage.imageAssets ||
      value.bytes !== stage.imageBytes ||
      stage.imageIndex + 1 !== reader.itemCount
    )
      inconsistent();
    next.phase = 'image-bytes-ready';
    advance();
  } else inconsistent();
  return {
    next,
    writes,
    proofs,
    checks,
    sourceToken: digest(proofs.map((p) => p.sourceToken)),
  };
}
