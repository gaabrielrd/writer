import { digest, inconsistent, restoreFail, sum } from './adventureRestoreContracts.mjs';
import { validAdventureTextState } from './adventureRestoreHistoryMeta.mjs';
import { reblockAdventureHistoryText } from './adventureRestoreHistoryText.mjs';
const privateAddress = (id) => ({ scope: 'job', path: ['preparedRoot', id] });
const native = (...path) => ({ scope: 'adventure', path });
const write = (address, value) => ({ address, value });
export const adventureHistoryTextAddress = privateAddress('text-state');
export const recoveredAdventureDraftVersionId = (loaded, resource) =>
  'restore-' +
  digest({
    domain: 'writer-adventure-restored-draft-version-v1',
    jobToken: loaded.view.jobToken,
    adventureId: loaded.job.adventureId,
    resource,
  });
export async function projectAdventureRestoreHistory({
  loaded,
  stage,
  unit,
  reader,
  mapper,
  previousState,
}) {
  const next = structuredClone(stage),
    mapped = await mapper.mapJSON(unit.record, unit.value),
    value = mapped.value,
    writes = [],
    proofs = [unit],
    checks = [],
    absent = [],
    uid = loaded.uid,
    adventureId = loaded.job.adventureId;
  function advance() {
    next.itemIndex++;
    next.historyUnits++;
  }
  function stateWrite(state) {
    if (!validAdventureTextState(state)) inconsistent();
    if (stage.textStateCreated)
      writes.push({
        address: adventureHistoryTextAddress,
        mode: 'update',
        update: (old) => {
          if (digest(old) !== digest(previousState)) inconsistent();
          return state;
        },
      });
    else writes.push(write(adventureHistoryTextAddress, state));
    next.textStateCreated = true;
  }
  function rootRevision() {
    writes.push({
      address: privateAddress('current'),
      mode: 'update',
      update: (old) => {
        if (
          old.ownerId !== uid ||
          old.value.id !== adventureId ||
          (old.value.historyRevision ?? 0) !== stage.historyVersions
        )
          inconsistent();
        return { ...old, value: { ...old.value, historyRevision: next.historyVersions } };
      },
    });
  }
  function fresh(kind, id, header, sourceHeaderHash, unitIndex) {
    if (stage.historyPending || (stage.textStateCreated && previousState?.done !== true))
      inconsistent();
    return {
      schemaVersion: 1,
      ownerId: uid,
      kind,
      unitIndex,
      versionId: id,
      header,
      sourceHeaderHash,
      rawCheckpoint: null,
      chunkCount: 0,
      writtenBytes: 0,
      tailBase64: '',
      done: false,
    };
  }
  if (stage.historySection === 'universe') {
    if (unit.record.kind !== 'adventure-universe') inconsistent();
    writes.push(
      write(privateAddress('universe-candidate'), {
        schemaVersion: 1,
        origin: value.origin,
        pendingAuthorization: true,
      }),
    );
    rootRevision();
    next.historySection = 'versions';
    advance();
  } else if (stage.historySection === 'versions' && unit.record.kind === 'adventure-version') {
    const d = value.data;
    if (d.label != null && d.label.length > 300)
      restoreFail('failed-precondition', 'native-compatibility');
    const header = {
      id: value.id,
      target: { kind: 'adventure', id: adventureId },
      ...d,
      label: d.label ?? null,
    };
    stateWrite(fresh('version', value.id, header, unit.contentHash, stage.itemIndex + 1));
    next.historyPending = true;
    advance();
  } else if (
    (stage.historySection === 'versions' && unit.record.kind === 'adventure-version-body') ||
    (stage.historySection === 'drafts' && unit.record.kind === 'adventure-draft')
  ) {
    const draft = unit.record.kind === 'adventure-draft';
    let state = previousState;
    if (draft && !stage.historyPending) {
      const versionId = recoveredAdventureDraftVersionId(loaded, value.resource),
        header = {
          resource: value.resource,
          createdAt: value.savedAt,
          baseRevision: value.baseRevision,
          byteLength: value.byteLength,
          contentHash: value.contentHash,
          chunkCount: value.chunkCount,
          current: unit.value.current,
        };
      state = fresh('draft', versionId, header, unit.contentHash, stage.itemIndex);
    }
    if (
      !validAdventureTextState(state) ||
      state.ownerId !== uid ||
      state.done ||
      state.unitIndex !== stage.itemIndex ||
      state.kind !== (draft ? 'draft' : 'version')
    )
      inconsistent();
    if (
      !draft &&
      (value.versionId !== state.versionId || unit.value.headerHash !== state.sourceHeaderHash)
    )
      inconsistent();
    if (draft) {
      absent.push(native('workVersions', state.versionId));
      const sourceHead = await reader.findResource(
          unit.value.resource.kind,
          unit.value.resource.id,
        ),
        sourceBody = await reader.findResource(
          unit.value.resource.kind + '-body',
          'current',
          unit.value.resource.id,
        );
      if (
        sourceHead.contentHash !== unit.value.current.headHash ||
        sourceBody.contentHash !== unit.value.current.bodyHash
      )
        inconsistent();
      proofs.push(sourceHead, sourceBody);
      const collection = value.resource.kind === 'scene' ? 'scenes' : 'sceneBlocks';
      checks.push({
        address: native(collection, value.resource.id, 'body', 'current'),
        verify: (body) => {
          if (
            body.content !== sourceBody.value.data.content ||
            body.hash !== digest(sourceBody.value.data.content)
          )
            inconsistent();
        },
      });
    }
    const raw = await reader.openMappedRaw(stage.itemIndex);
    if (
      raw.manifest.byteLength !== state.header.byteLength ||
      raw.manifest.contentHash !== state.header.contentHash
    )
      inconsistent();
    const part = await raw.readStep(state.rawCheckpoint);
    proofs.push(part);
    const assembled = reblockAdventureHistoryText(
        state.tailBase64,
        part.bytes,
        part.done,
        state.chunkCount,
      ),
      chunkCount = sum(state.chunkCount, assembled.chunks.length),
      writtenBytes = sum(
        state.writtenBytes,
        assembled.chunks.reduce((n, s) => n + Buffer.byteLength(s), 0),
      );
    for (let i = 0; i < assembled.chunks.length; i++) {
      const index = state.chunkCount + i;
      writes.push(
        write(native('workVersionBodies', digest({ versionId: state.versionId, index })), {
          versionId: state.versionId,
          index,
          content: assembled.chunks[i],
        }),
      );
    }
    const current = {
      ...state,
      rawCheckpoint: part.checkpoint,
      chunkCount,
      writtenBytes,
      tailBase64: assembled.tailBase64,
      done: part.done,
    };
    if (
      writtenBytes + Buffer.from(assembled.tailBase64, 'base64').length !==
      part.checkpoint.byteLength
    )
      inconsistent();
    stateWrite(current);
    next.historyPending = !part.done;
    next.textFrames = sum(next.textFrames, 1);
    if (draft) {
      next.draftBodies = sum(next.draftBodies, assembled.chunks.length);
      next.draftBytes = sum(next.draftBytes, part.bytes.length);
    } else {
      next.historyBodies = sum(next.historyBodies, assembled.chunks.length);
      next.historyBytes = sum(next.historyBytes, part.bytes.length);
    }
    if (part.done) {
      if (writtenBytes !== state.header.byteLength || assembled.tailBase64 !== '') inconsistent();
      if (draft) {
        next.drafts = sum(next.drafts, 1);
        writes.push(
          write(privateAddress('recovered-draft'), {
            schemaVersion: 1,
            state: 'pending-finalization',
            versionId: state.versionId,
            resource: value.resource,
            baseRevision: value.baseRevision,
            savedAt: value.savedAt,
            current: unit.value.current,
            byteLength: writtenBytes,
            contentHash: value.contentHash,
            chunkCount,
          }),
        );
      } else {
        const header = {
          ...state.header,
          schemaVersion: 1,
          resourceKey: digest(state.header.resource),
          chunkCount,
          deleting: false,
        };
        writes.push(write(native('workVersions', state.versionId), header));
        next.historyVersions = sum(next.historyVersions, 1);
        next.historySourceRecords = sum(next.historySourceRecords, 1 + state.header.chunkCount);
        rootRevision();
      }
      advance();
    }
  } else if (stage.historySection === 'versions' && unit.record.kind === 'adventure-history') {
    if (
      stage.historyPending ||
      value.versions !== stage.historyVersions ||
      value.nativeRecords !== stage.historySourceRecords ||
      value.textBytes !== stage.historyBytes
    )
      inconsistent();
    next.historySection = 'drafts';
    advance();
  } else if (stage.historySection === 'drafts' && unit.record.kind === 'adventure-drafts') {
    if (stage.historyPending || value.count !== stage.drafts || value.bytes !== stage.draftBytes)
      inconsistent();
    next.historySection = 'complete';
    next.phase = 'history-ready';
    advance();
  } else inconsistent();
  return {
    next,
    writes,
    proofs,
    checks,
    absent,
    sourceToken: digest(proofs.map((p) => p.sourceToken)),
  };
}
