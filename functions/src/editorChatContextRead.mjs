// Server-only origin readers. Tokens below identify births, never document revisions.
import {
  editorChatFail,
  editorChatHash,
  editorChatProjectToken,
  editorChatResourceToken,
  editorChatContainerSceneToken,
  editorChatSourceId,
  editorChatText,
  normalizeEditorChatStamp,
  normalizeEditorChatDTO,
  normalizeEditorChatClosure,
  normalizeEditorChatPersonaId,
  normalizeEditorChatPersonaComplement,
  verifyEditorChatClosure,
  editorChatClosed,
  canonicalEditorChatJSON,
} from './editorChatContracts.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { readWorkMetadata, digest } from './workProgressContracts.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import { readBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { DEFAULT_PERSONAS, validatePersona, resolveWritingPersona } from './personaProfile.mjs';
import {
  metadataFields,
  storedMetadata,
  storedBody,
  adventureIdentityToken,
} from './adventureLoreContracts.mjs';
import { editorChatMatcherId } from './editorChatMatcher.mjs';

const fail = () => editorChatFail('inconsistent');
const rev = (v) => {
  if (!Number.isSafeInteger(v) || v < 0) fail();
  return v;
};
const pathFor = (target) => `${target.kind === 'book' ? 'books' : 'adventures'}/${target.id}`;
const safeText = (value, fallback = '') => {
  try {
    return editorChatText(value ?? fallback);
  } catch {
    fail();
  }
};
const excerpt = (value, limit) => {
  const cut = value.slice(0, limit);
  return cut.isWellFormed() ? cut : cut.slice(0, -1);
};
export const editorChatNativeStamp = (snapshot, field = 'createTime') => {
  try {
    return normalizeEditorChatStamp({
      seconds: snapshot[field]?.seconds,
      nanoseconds: snapshot[field]?.nanoseconds,
    });
  } catch {
    fail();
  }
};
export const editorChatScopeIdentity = (uid, scope, snapshot) =>
  editorChatHash({
    version: 1,
    kind: 'lore-scope',
    ownerId: uid,
    scope,
    createdAt: editorChatNativeStamp(snapshot),
  });
export const editorChatEntityIdentity = (reference, scopeToken, snapshot) =>
  editorChatHash({
    version: 1,
    kind: 'lore-entity',
    reference,
    scopeToken,
    createdAt: editorChatNativeStamp(snapshot),
  });
export const editorChatPersonaIdentity = (uid, personaId, snapshot) =>
  editorChatHash({
    version: 1,
    kind: 'persona',
    ownerId: uid,
    personaId,
    createdAt: editorChatNativeStamp(snapshot),
  });
export const editorChatBindingIdentity = (uid, target, scopeKind, scopeId, snapshot) =>
  editorChatHash({
    version: 1,
    kind: 'persona-binding-source',
    ownerId: uid,
    target,
    scopeKind,
    scopeId,
    createdAt: editorChatNativeStamp(snapshot),
  });
const projectFields = [
  'authorId',
  'ownerId',
  'schemaVersion',
  'deleting',
  'title',
  'universeId',
  'localLoreVersion',
  'loreVersion',
  'personaId',
  'personaRevision',
  'updatedAt',
];
const sceneFields = [
  'ownerId',
  'deleting',
  'parentId',
  'archived',
  'bodyHash',
  'revision',
  'title',
  'personaComplement',
  'personaRevision',
  'updatedAt',
  'bookId',
  'sceneId',
];
const parentFields = [
  'ownerId',
  'deleting',
  'contentMode',
  'personaComplement',
  'personaRevision',
  'updatedAt',
];

export async function readEditorChatProject(tx, db, uid, target) {
  const path = pathFor(target),
    snapshot = await readWorkMetadata(tx, db.doc(path), projectFields);
  const root = snapshot.data();
  if (!root || root[target.kind === 'book' ? 'authorId' : 'ownerId'] !== uid || root.deleting)
    editorChatFail('source-unavailable');
  if (target.kind === 'adventure' && root.schemaVersion !== 1) fail();
  const projectToken = await editorChatProjectToken({
    ownerId: uid,
    target,
    createdAt: editorChatNativeStamp(snapshot),
  });
  return { uid, target, path, snapshot, root, projectToken };
}
export async function readEditorChatScene(tx, db, project, sceneId) {
  const snapshot = await readWorkMetadata(
    tx,
    db.doc(`${project.path}/scenes/${editorChatSourceId(sceneId)}`),
    sceneFields,
  );
  const scene = snapshot.data();
  if (
    !scene ||
    scene.ownerId !== project.uid ||
    scene.deleting ||
    (scene.bookId && scene.bookId !== project.target.id)
  )
    editorChatFail('source-unavailable');
  let parent = null;
  if (scene.parentId !== null) {
    editorChatSourceId(scene.parentId);
    const kind = project.target.kind === 'book' ? 'chapter' : 'part';
    const parentSnapshot = await readWorkMetadata(
      tx,
      db.doc(`${project.path}/${kind === 'chapter' ? 'chapters' : 'parts'}/${scene.parentId}`),
      parentFields,
    );
    const record = parentSnapshot.data();
    if (
      !record ||
      (record.ownerId && record.ownerId !== project.uid) ||
      (record.deleting && !scene.archived) ||
      (kind === 'chapter' && record.contentMode !== 'scenes')
    )
      editorChatFail('source-unavailable');
    parent = {
      kind,
      id: scene.parentId,
      snapshot: parentSnapshot,
      record,
      token: await editorChatBindingIdentity(
        project.uid,
        project.target,
        kind,
        scene.parentId,
        parentSnapshot,
      ),
    };
  }
  return { snapshot, record: scene, parent };
}

export async function readEditorChatSource(tx, db, uid, scope, { withContent = false } = {}) {
  scope = { target: scope.target, resource: scope.resource };
  const project = await readEditorChatProject(tx, db, uid, scope.target);
  let sceneId = scope.resource.id,
    resourceSnapshot;
  if (scope.resource.kind === 'block') {
    resourceSnapshot = await readWorkMetadata(
      tx,
      db.doc(`${project.path}/sceneBlocks/${scope.resource.id}`),
      sceneFields,
    );
    const block = resourceSnapshot.data();
    if (!block || block.ownerId !== uid || block.deleting) editorChatFail('source-unavailable');
    sceneId = editorChatSourceId(block.sceneId);
  }
  const scene = await readEditorChatScene(tx, db, project, sceneId);
  resourceSnapshot ??= scene.snapshot;
  const record = resourceSnapshot.data();
  const bodySnapshot = await readWorkMetadata(
    tx,
    db.doc(`${resourceSnapshot.ref.path}/body/current`),
    ['hash'],
  );
  if (
    !bodySnapshot.exists ||
    !/^[a-f0-9]{64}$/.test(record.bodyHash) ||
    bodySnapshot.data()?.hash !== record.bodyHash
  )
    fail();
  const containerScene =
    scope.resource.kind === 'block'
      ? {
          id: sceneId,
          token: await editorChatContainerSceneToken({
            ownerId: uid,
            target: scope.target,
            projectToken: project.projectToken,
            sceneId,
            createdAt: editorChatNativeStamp(scene.snapshot),
          }),
        }
      : null;
  const resourceToken = await editorChatResourceToken({
    ...scope,
    ownerId: uid,
    projectToken: project.projectToken,
    createdAt: editorChatNativeStamp(resourceSnapshot),
    bodyCreatedAt: editorChatNativeStamp(bodySnapshot),
    containerScene,
  });
  const sourceToken = digest({
    version: 1,
    uid,
    target: scope.target,
    resource: scope.resource,
    metadata: editorChatNativeStamp(resourceSnapshot, 'updateTime'),
    contentHash: record.bodyHash,
    body: editorChatNativeStamp(bodySnapshot, 'updateTime'),
    revision: rev(record.revision),
  });
  if (withContent) {
    const saved = await readHistorySource(
      tx,
      db,
      { uid, target: scope.target, path: project.path, ref: db.doc(project.path) },
      scope.resource,
    );
    if (
      !saved ||
      saved.source.sourceToken !== sourceToken ||
      saved.source.contentHash !== record.bodyHash
    )
      fail();
  }
  const title = safeText(record.title),
    projectTitle = safeText(project.root.title);
  const source = normalizeEditorChatDTO('source', {
    ...scope,
    projectToken: project.projectToken,
    resourceToken,
    containerScene,
    parent: scene.parent
      ? { kind: scene.parent.kind, id: scene.parent.id, token: scene.parent.token }
      : null,
    sourceToken,
    revision: record.revision,
    bodyHash: record.bodyHash,
    title: excerpt(title, 300),
    projectTitle: excerpt(projectTitle, 300),
    titleTruncated: title.length > 300,
    projectTitleTruncated: projectTitle.length > 300,
  });
  return { ...project, scope, scene, resourceSnapshot, bodySnapshot, source };
}

export async function readEditorChatEnvironment(tx, db, source) {
  const { uid, target, root } = source;
  let localVersion;
  try {
    localVersion =
      target.kind === 'book' ? readBookLocalLoreVersion(root) : rev(root.loreVersion ?? 0);
  } catch {
    fail();
  }
  // L has no pre-clock local legacy. Preserve its nonempty/absent fail-closed gate.
  if (
    target.kind === 'adventure' &&
    root.loreVersion === undefined &&
    (await tx.get(db.collection(`${source.path}/lore`).orderBy('__name__').limit(1).select())).docs
      .length
  )
    fail();
  let world = null;
  if (root.universeId != null) {
    const id = editorChatSourceId(root.universeId);
    const snapshot = await readWorkMetadata(tx, db.doc(`universes/${id}`), [
      'authorId',
      'deleting',
      'loreVersion',
      'privacyVersion',
    ]);
    const value = snapshot.data();
    const available = !!value && value.authorId === uid && !value.deleting;
    world = {
      id,
      available,
      scopeToken: snapshot.exists
        ? await editorChatScopeIdentity(uid, { kind: 'universe', id }, snapshot)
        : null,
      loreVersion: available ? rev(value.loreVersion ?? 0) : null,
      privacyVersion: available ? rev(value.privacyVersion ?? 0) : null,
    };
  }
  const authorization = await readCampaignAuthorization(tx, db, uid);
  return {
    localVersion,
    world,
    authorization: authorization.record
      ? { token: authorization.record.token, epoch: authorization.epoch }
      : null,
  };
}

async function readProfile(tx, db, uid, id, full) {
  normalizeEditorChatPersonaId(id);
  const preset = DEFAULT_PERSONAS.find((v) => v.id === id);
  if (preset) {
    const profile = validatePersona(preset),
      identityToken = await editorChatHash(profile);
    return {
      metadata: { kind: 'preset', id, identityToken, revision: profile.revision },
      capturedStamp: null,
      profile: full ? profile : null,
      leaf: { kind: 'preset', presetId: id, definitionHash: identityToken },
    };
  }
  const ref = db.doc(`users/${uid}/aiPersonas/${id}`);
  const snapshot = await readWorkMetadata(tx, ref, ['id', 'schemaVersion', 'revision', 'archived']);
  const value = snapshot.data();
  if (!value || value.archived === true) editorChatFail('provenance-revoked');
  if (
    value.id !== id ||
    value.schemaVersion !== 1 ||
    value.archived !== false ||
    rev(value.revision) < 1
  )
    fail();
  const identityToken = await editorChatPersonaIdentity(uid, id, snapshot);
  let profile = null;
  if (full) {
    try {
      profile = validatePersona((await tx.get(ref)).data());
    } catch {
      fail();
    }
    if (profile.id !== id || profile.revision !== value.revision || profile.archived) fail();
  }
  return {
    metadata: { kind: 'custom', id, identityToken, revision: value.revision },
    capturedStamp: editorChatNativeStamp(snapshot, 'updateTime'),
    profile,
    leaf: { kind: 'persona', ownerId: uid, personaId: id, identityToken },
  };
}

export async function readEditorChatPersona(tx, db, source, { full = false } = {}) {
  const { uid, target, root, scene } = source;
  const baseId = root.personaId ?? null;
  const complementRecord = target.kind === 'book' ? scene?.parent?.record : scene?.record;
  let complement;
  try {
    complement =
      complementRecord?.personaComplement == null
        ? null
        : normalizeEditorChatPersonaComplement(complementRecord.personaComplement);
  } catch {
    fail();
  }
  const base = baseId === null ? null : await readProfile(tx, db, uid, baseId, full);
  const extra =
    complement === null ? null : await readProfile(tx, db, uid, complement.personaId, full);
  const bindings = [
    {
      scopeKind: target.kind,
      scopeId: target.id,
      snapshot: source.snapshot,
      record: root,
      value: baseId,
    },
  ];
  if (scene && (target.kind === 'adventure' || scene.parent))
    bindings.push({
      scopeKind: target.kind === 'adventure' ? 'scene' : 'chapter',
      scopeId: target.kind === 'adventure' ? scene.snapshot.id : scene.parent.id,
      snapshot: target.kind === 'adventure' ? scene.snapshot : scene.parent.snapshot,
      record: complementRecord,
      value: complement,
    });
  const leaves = [];
  const bindingProof = [];
  for (const b of bindings) {
    const identityToken = await editorChatBindingIdentity(
      uid,
      target,
      b.scopeKind,
      b.scopeId,
      b.snapshot,
    );
    leaves.push({
      kind: 'binding',
      target,
      scopeKind: b.scopeKind,
      scopeId: b.scopeId,
      identityToken,
    });
    bindingProof.push({
      scopeKind: b.scopeKind,
      scopeId: b.scopeId,
      identityToken,
      value: b.value,
      personaRevision: rev(b.record.personaRevision ?? 0),
    });
  }
  for (const p of [base, extra]) if (p) leaves.push(p.leaf);
  const proof = {
    bindings: bindingProof,
    profiles: [base, extra].map((p) =>
      p ? { ...p.metadata, capturedStamp: p.capturedStamp } : null,
    ),
  };
  const bindingHash = await editorChatHash(bindingProof),
    profileHash = await editorChatHash(proof.profiles);
  let instruction = null;
  if (full) {
    try {
      instruction = resolveWritingPersona(
        [base?.profile, extra?.profile].filter(Boolean),
        baseId,
        complement,
        target.kind,
      ).instruction;
    } catch {
      fail();
    }
  }
  return {
    proof,
    leaves,
    snapshot: full
      ? {
          bindingHash,
          profileHash,
          capturedAt: 0,
          base: base?.metadata ?? null,
          complement: extra?.metadata ?? null,
          instruction,
        }
      : null,
  };
}

const loreFields = ['name', 'aliases', 'category', 'summary', 'isPublic', 'deleting', 'deleted'];
export async function readEditorChatLorePage(tx, db, source, environment, phase, cursor) {
  const global = phase === 'global';
  if (global && !environment.world?.available) fail();
  const scope = {
    kind: global ? 'universe' : source.target.kind,
    id: global ? environment.world.id : source.target.id,
  };
  const path = global ? `universes/${scope.id}/lore` : `${source.path}/lore`;
  let query = db
    .collection(path)
    .orderBy('__name__')
    .limit(50)
    .select(...(scope.kind === 'adventure' ? metadataFields : loreFields));
  if (cursor !== null) query = query.startAfter(editorChatSourceId(cursor));
  const docs = (await tx.get(query)).docs;
  const entities = [];
  for (const snapshot of docs) {
    const reference = { kind: scope.kind, scopeId: scope.id, entityId: snapshot.id };
    let value = snapshot.data();
    if (scope.kind === 'adventure')
      value = storedMetadata(
        value,
        {
          uid: source.uid,
          adventureId: scope.id,
          adventureToken: adventureIdentityToken(source.uid, scope.id, source.snapshot),
          collectionRevision: environment.localVersion,
        },
        snapshot.id,
      );
    if (value.deleted || value.deleting) continue;
    entities.push(loreMetadata(value, reference));
  }
  return {
    entities,
    count: docs.length,
    cursor: docs.at(-1)?.id ?? cursor,
    complete: docs.length < 50,
  };
}
function loreMetadata(value, reference) {
  if (
    !value ||
    !['character', 'location', 'concept', 'other'].includes(value.category) ||
    !Array.isArray(value.aliases ?? []) ||
    (value.isPublic !== undefined && typeof value.isPublic !== 'boolean')
  )
    fail();
  const name = safeText(value.name),
    aliases = (value.aliases ?? []).map((v) => safeText(v)),
    summary = safeText(value.summary);
  if (!name.trim()) fail();
  return {
    id: editorChatMatcherId(reference),
    reference,
    name,
    aliases,
    category: value.category,
    summary,
    global: reference.kind === 'universe',
  };
}
export async function readEditorChatLore(tx, db, source, environment, reference) {
  const global = reference.kind === 'universe';
  if (
    global
      ? !environment.world?.available || environment.world.id !== reference.scopeId
      : reference.kind !== source.target.kind || reference.scopeId !== source.target.id
  )
    editorChatFail('provenance-revoked');
  const scope = { kind: reference.kind, id: reference.scopeId };
  const rootSnapshot = global
    ? await readWorkMetadata(tx, db.doc(`universes/${scope.id}`), ['authorId', 'deleting'])
    : source.snapshot;
  if (global && (rootSnapshot.data()?.authorId !== source.uid || rootSnapshot.data()?.deleting))
    editorChatFail('provenance-revoked');
  const path = global ? `universes/${scope.id}` : source.path;
  const snapshot = await readWorkMetadata(
    tx,
    db.doc(`${path}/lore/${reference.entityId}`),
    reference.kind === 'adventure' ? metadataFields : loreFields,
  );
  let record = snapshot.data();
  if (!record || record.deleted || record.deleting) editorChatFail('provenance-revoked');
  let c = null;
  if (reference.kind === 'adventure') {
    c = {
      uid: source.uid,
      adventureId: scope.id,
      adventureToken: adventureIdentityToken(source.uid, scope.id, source.snapshot),
      collectionRevision: environment.localVersion,
    };
    record = storedMetadata(record, c, reference.entityId);
  }
  const metadata = loreMetadata(record, reference),
    scopeToken = await editorChatScopeIdentity(source.uid, scope, rootSnapshot);
  const entityIdentityToken = await editorChatEntityIdentity(reference, scopeToken, snapshot);
  return {
    ref: db.doc(`${path}/lore/${reference.entityId}`),
    snapshot,
    record,
    metadata,
    c,
    leaf: { kind: 'lore', reference, scopeToken, entityIdentityToken },
  };
}
export async function readEditorChatLoreSnapshot(tx, db, source, environment, reference) {
  const found = await readEditorChatLore(tx, db, source, environment, reference);
  let body;
  if (reference.kind === 'adventure')
    body = storedBody(
      (await tx.get(db.doc(`${source.path}/loreBodies/${reference.entityId}`))).data(),
      found.c,
      found.record,
    );
  else body = (await tx.get(found.ref)).data();
  if (!body) fail();
  const details = safeText(body.details),
    m = found.metadata;
  const snapshot = {
    reference,
    identityToken: found.leaf.entityIdentityToken,
    capturedRevision: reference.kind === 'adventure' ? found.record.revision : null,
    capturedStamp: editorChatNativeStamp(found.snapshot, 'updateTime'),
    name: excerpt(m.name, 200),
    aliases: m.aliases.slice(0, 20).map((a) => excerpt(a, 200)),
    category: m.category,
    summary: excerpt(m.summary, 140),
    detailsExcerpt: excerpt(details, 2000),
    aliasesOmitted: Math.max(0, m.aliases.length - 20),
    detailsTruncated: details.length > 2000,
  };
  return { snapshot: normalizeEditorChatDTO('lore', snapshot), leaf: found.leaf };
}

export async function authorizeEditorChatManifest(tx, db, uid, scope, manifest, closureHash) {
  try {
    editorChatClosed(manifest, ['version', 'leaves']);
    if (manifest.version !== 1) fail();
  } catch {
    fail();
  }
  const closure = await verifyEditorChatClosure(
    { schemaVersion: 1, leaves: manifest.leaves, closureHash },
    { ownerId: uid, ...scope },
  );
  const source = await readEditorChatSource(tx, db, uid, scope),
    environment = await readEditorChatEnvironment(tx, db, source);
  for (const leaf of closure.leaves) {
    if (leaf.kind === 'target') {
      if (
        leaf.projectToken !== source.source.projectToken ||
        leaf.resourceToken !== source.source.resourceToken
      )
        editorChatFail('provenance-revoked');
    } else if (leaf.kind === 'lore') {
      const current = await readEditorChatLore(tx, db, source, environment, leaf.reference);
      if (canonicalEditorChatJSON(current.leaf) !== canonicalEditorChatJSON(leaf))
        editorChatFail('provenance-revoked');
    } else if (leaf.kind === 'persona' || leaf.kind === 'preset') {
      const current = await readProfile(
        tx,
        db,
        uid,
        leaf.kind === 'preset' ? leaf.presetId : leaf.personaId,
        false,
      );
      if (canonicalEditorChatJSON(current.leaf) !== canonicalEditorChatJSON(leaf))
        editorChatFail('provenance-revoked');
    } else {
      const path =
        leaf.scopeKind === scope.target.kind
          ? source.path
          : `${source.path}/${leaf.scopeKind === 'chapter' ? 'chapters' : 'scenes'}/${leaf.scopeId}`;
      const snapshot = await readWorkMetadata(tx, db.doc(path), ['ownerId', 'deleting']);
      if (
        !snapshot.exists ||
        snapshot.data().deleting ||
        (snapshot.data().ownerId && snapshot.data().ownerId !== uid) ||
        leaf.identityToken !==
          (await editorChatBindingIdentity(
            uid,
            scope.target,
            leaf.scopeKind,
            leaf.scopeId,
            snapshot,
          ))
      )
        editorChatFail('provenance-revoked');
    }
  }
  if (!closure.leaves.some((l) => l.kind === 'target')) fail();
  return { source, environment, closure };
}

export async function editorChatDirectClosure(source, persona, lore) {
  return normalizeEditorChatClosure([
    {
      kind: 'target',
      target: source.target,
      resource: source.scope.resource,
      projectToken: source.source.projectToken,
      resourceToken: source.source.resourceToken,
    },
    ...persona.leaves,
    ...lore.map((v) => v.leaf),
  ]);
}
