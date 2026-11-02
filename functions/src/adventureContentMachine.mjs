import {
  contentInvalid as bad,
  contentClosed as closed,
  contentId as validId,
  contentCount as count,
  contentHash as validHash,
  ADVENTURE_CONTENT_LIMITS,
  advanceAdventureUtf8,
  createAdventureUtf8State,
} from './adventureContentPrimitives.mjs';
import {
  ADVENTURE_PACKAGE_SECTIONS as sections,
  adventurePackageSection,
  createAdventurePackageCounts,
} from './adventureBackupPackage.mjs';
import {
  adventureCoreCounts,
  adventureCoreManifest,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  adventureCoreRecordIdentity,
} from './adventureArchiveCore.mjs';
import { ADVENTURE_RESOURCE_DEFINITIONS as definitions } from './adventureBackupResourceDefinitions.mjs';
import {
  ADVENTURE_HISTORY_SEED,
  adventureHistoryBodyManifest,
  adventureHistoryDigestLine,
  adventureHistoryManifest,
} from './adventureArchiveHistory.mjs';
import { ADVENTURE_DRAFTS_SEED, adventureDraftsManifest } from './adventureArchiveDrafts.mjs';
import {
  ADVENTURE_IMAGES_SEED,
  adventureImagesManifest,
  adventureImageAddressLine,
} from './adventureArchiveImages.mjs';
import { validatePortableUniverseOrigin } from './portableUniverseOrigin.mjs';
import * as schema from './adventureContentSchema.mjs';
const encoder = new TextEncoder();
const seeds = (s) =>
  s === 'history'
    ? ADVENTURE_HISTORY_SEED
    : s === 'drafts'
      ? ADVENTURE_DRAFTS_SEED
      : s === 'images'
        ? ADVENTURE_IMAGES_SEED
        : adventureCoreDigestSeed(s);
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const nodeKey = (kind, id, parentId = null) => ['resource', kind, parentId ?? '', id];
export function createAdventureContentState(adventureId) {
  if (!validId(adventureId)) bad();
  return {
    schemaVersion: 1,
    adventureId,
    phase: 'records',
    section: null,
    ended: [],
    counts: createAdventurePackageCounts(),
    hashes: Object.fromEntries(sections.map((s) => [s, null])),
    digests: Object.fromEntries(sections.map((s) => [s, null])),
    units: Object.fromEntries(sections.map((s) => [s, 0])),
    totals: {
      parts: 0,
      resources: adventureCoreCounts('resources'),
      lore: adventureCoreCounts('lore'),
      personas: adventureCoreCounts('personas'),
      versions: 0,
      nativeHistoryRecords: 0,
      historyBytes: 0,
      drafts: 0,
      draftBytes: 0,
      imageBindings: 0,
      imageAssets: 0,
      imageBytes: 0,
    },
    warnings: {
      missingDates: 0,
      danglingLocalReferences: 0,
      externalReferences: 0,
      orphanGroups: 0,
      unknownOverrides: 0,
      historicalOnlyResources: 0,
    },
    pending: null,
    rows: 0,
    rowCursor: 0,
  };
}
function snapshot(value) {
  const data = structuredClone(value),
    bytes = encoder.encode(JSON.stringify(data));
  if (
    bytes.length > ADVENTURE_CONTENT_LIMITS.checkpointBytes ||
    !closed(data, [
      'schemaVersion',
      'adventureId',
      'phase',
      'section',
      'ended',
      'counts',
      'hashes',
      'digests',
      'units',
      'totals',
      'warnings',
      'pending',
      'rows',
      'rowCursor',
    ]) ||
    data.schemaVersion !== 1 ||
    !validId(data.adventureId) ||
    !['records', 'finish', 'done', 'failed'].includes(data.phase) ||
    (data.section !== null && !sections.includes(data.section)) ||
    !Array.isArray(data.ended) ||
    data.ended.some((s) => !sections.includes(s)) ||
    new Set(data.ended).size !== data.ended.length ||
    !count(data.rows) ||
    !count(data.rowCursor) ||
    data.rowCursor > data.rows
  )
    bad();
  if (data.phase !== 'failed') {
    if (!same(data.ended, sections.slice(0, data.ended.length))) bad();
    for (const section of sections) {
      if (
        data.ended.includes(section)
          ? !validHash(data.digests[section]) || data.hashes[section] !== null
          : data.digests[section] !== null
      )
        bad();
    }
    if (
      ['finish', 'done'].includes(data.phase) &&
      (data.section !== 'images' || data.ended.length !== sections.length || data.pending)
    )
      bad();
    if (data.phase === 'done' && data.rowCursor !== data.rows) bad();
  }
  for (const key of ['counts', 'hashes', 'digests', 'units'])
    if (!closed(data[key], [...sections])) bad();
  for (const s of sections) {
    if (
      !closed(data.counts[s], ['records', 'payloadBytes']) ||
      !Object.values(data.counts[s]).every(count) ||
      !count(data.units[s]) ||
      (data.digests[s] !== null && !validHash(data.digests[s]))
    )
      bad();
  }
  const base = createAdventureContentState(data.adventureId);
  if (
    !closed(data.totals, Object.keys(base.totals)) ||
    !closed(data.warnings, Object.keys(base.warnings))
  )
    bad();
  for (const key of ['resources', 'lore', 'personas'])
    if (
      !closed(data.totals[key], Object.keys(base.totals[key])) ||
      !Object.values(data.totals[key]).every(count)
    )
      bad();
  if (
    !Object.entries(data.totals)
      .filter(([k]) => !['resources', 'lore', 'personas'].includes(k))
      .every(([, v]) => count(v)) ||
    !Object.values(data.warnings).every(count)
  )
    bad();
  return data;
}
/** Pure semantic transition engine; index/hash/checkpoints are supplied by the trusted host, never by the file. */
export function createAdventureContentMachine(saved, { index, hash, signal }) {
  const state = snapshot(saved);
  if (
    typeof index?.get !== 'function' ||
    typeof index?.add !== 'function' ||
    typeof hash?.create !== 'function'
  )
    bad();
  for (const value of Object.values(state.hashes)) if (value !== null) hash.create(value).destroy();
  let busy = false;
  function check() {
    signal?.throwIfAborted();
    if (state.phase === 'failed') bad();
  }
  const operation =
    (fn) =>
    async (...args) => {
      check();
      if (busy) {
        state.phase = 'failed';
        bad();
      }
      busy = true;
      try {
        return await fn(...args);
      } catch (error) {
        state.phase = 'failed';
        throw error;
      } finally {
        busy = false;
      }
    };
  const get = async (key) => {
    check();
    const value = await index.get(key);
    check();
    return value;
  };
  const add = async (key, value) => {
    if ((await get(key)) !== undefined) bad();
    check();
    await index.add(key, value);
    check();
  };
  const bump = (object, key, by = 1) => {
    const next = object[key] + by;
    if (!count(next)) bad();
    object[key] = next;
  };
  const row = async (value) => {
    await add(['row', String(state.rows)], value);
    bump(state, 'rows');
  };
  function sha(bytes) {
    const h = hash.create();
    try {
      h.update(bytes);
      return h.digest();
    } finally {
      h.destroy();
    }
  }
  const jsonHash = (value) => sha(encoder.encode(JSON.stringify(value)));
  function fold(section, line) {
    const h = state.hashes[section] === null ? hash.create() : hash.create(state.hashes[section]);
    try {
      if (state.hashes[section] === null) h.update(encoder.encode(seeds(section)));
      h.update(encoder.encode(line));
      state.hashes[section] = h.save();
    } finally {
      h.destroy();
    }
  }
  function digest(section) {
    if (state.digests[section] !== null) bad();
    const h = state.hashes[section] === null ? hash.create() : hash.create(state.hashes[section]);
    try {
      if (state.hashes[section] === null) h.update(encoder.encode(seeds(section)));
      const result = h.digest();
      state.hashes[section] = null;
      state.digests[section] = result;
      return result;
    } finally {
      h.destroy();
    }
  }
  function enter(kind) {
    const section = adventurePackageSection(kind);
    if (!section || state.phase !== 'records' || state.ended.includes(section)) bad();
    if (section !== state.section) {
      const next = sections.indexOf(section),
        before = state.section === null ? -1 : sections.indexOf(state.section);
      if (next !== before + 1) bad();
      if (state.section !== null && !state.ended.includes(state.section)) {
        if (!['structure', 'universe'].includes(state.section)) bad();
        digest(state.section);
        state.ended.push(state.section);
      }
      state.section = section;
    }
    return section;
  }
  function account(section, byteLength, records = 1) {
    bump(state.counts[section], 'records', records);
    bump(state.counts[section], 'payloadBytes', byteLength);
  }
  function coreUnit(record, manifest) {
    fold(state.section, adventureCoreDigestLine(record, manifest));
    bump(state.units, state.section);
  }
  async function reference(ref) {
    if (ref.kind !== 'adventure' || ref.scopeId !== state.adventureId) {
      bump(state.warnings, 'externalReferences');
      return;
    }
    const head = await get(['lore', ref.entityId]);
    if (!head || head.deleted) bump(state.warnings, 'danglingLocalReferences');
  }
  async function required(key) {
    const value = await get(key);
    if (!value || value.present === false) bad();
    return value;
  }
  function rootId(record) {
    if (record.id !== state.adventureId) bad();
  }
  function raw(record, manifest, layout, after) {
    state.pending = {
      stage: 'raw',
      kind: record.kind,
      id: record.id,
      manifest: {
        byteLength: manifest.byteLength,
        chunkCount: manifest.chunkCount,
        contentHash: manifest.contentHash,
      },
      layout,
      after,
      part: 0,
      bytes: 0,
      hashState: null,
      utf8: createAdventureUtf8State(),
    };
    const h = hash.create();
    try {
      state.pending.hashState = h.save();
    } finally {
      h.destroy();
    }
  }
  async function identity(record, scope, id) {
    const expected = await adventureCoreRecordIdentity(scope, id);
    check();
    if (record.id !== expected.id || record.kind !== expected.kind) bad();
  }
  const acceptJSON = operation(async (record, value) => {
    if (!closed(record, ['kind', 'id', 'part']) || !validId(record.id) || record.part !== 0) bad();
    const section = enter(record.kind),
      bytes = encoder.encode(JSON.stringify(value));
    if (!bytes.length || bytes.length > ADVENTURE_CONTENT_LIMITS.itemBytes) bad();
    account(section, bytes.length, Math.ceil(bytes.length / 65536));
    const manifest = {
      byteLength: bytes.length,
      chunkCount: Math.ceil(bytes.length / 65536),
      contentHash: sha(bytes),
    };
    if (state.pending) {
      if (state.pending.stage === 'version-body' && record.kind === 'adventure-version-body') {
        const pending = state.pending,
          body = schema.validateAdventureVersionBody(value);
        const expected = adventureHistoryBodyManifest(
          pending.id,
          pending.header.contentHash,
          pending.native,
        );
        if (record.id !== pending.id || !same(body, expected)) bad();
        raw({ kind: 'adventure-version-text', id: pending.id }, body, 'fixed-text', {
          kind: 'history',
          id: pending.id,
          header: pending.header,
          body,
        });
        return;
      }
      if (state.pending.stage === 'image-asset' && record.kind === 'adventure-image') {
        const pending = state.pending,
          asset = schema.validateAdventureImageAsset(value);
        if (
          record.id !== pending.id ||
          asset.assetId !== pending.id ||
          asset.imageId !== pending.imageId
        )
          bad();
        raw({ kind: 'adventure-image-bytes', id: pending.id }, asset, 'png', {
          kind: 'image',
          binding: pending,
          metadataHash: manifest.contentHash,
        });
        return;
      }
      bad();
    }
    if (record.kind === 'adventure-metadata') {
      rootId(record);
      const data = schema.validateAdventureStructure(value, 'adventure');
      await add(['root'], {
        personaId: data.personaId ?? null,
        universeId: data.universeId ?? null,
      });
      if (data.createdAt === undefined || data.updatedAt === undefined)
        bump(state.warnings, 'missingDates');
      coreUnit(record, manifest);
      return;
    }
    if (!(await get(['root']))) bad();
    if (record.kind === 'adventure-part') {
      schema.validateAdventureStructure(value, 'part');
      await add(['part', record.id], { unitHash: manifest.contentHash });
      bump(state.totals, 'parts');
      coreUnit(record, manifest);
      return;
    }
    if (record.kind === 'adventure-resource') {
      await resource(record, value, manifest);
      coreUnit(record, manifest);
      return;
    }
    if (['adventure-lore', 'adventure-lore-body'].includes(record.kind)) {
      await lore(record, value, manifest);
      coreUnit(record, manifest);
      return;
    }
    if (record.kind === 'adventure-persona') {
      await persona(record, value, manifest);
      coreUnit(record, manifest);
      return;
    }
    if (record.kind === 'adventure-universe') {
      rootId(record);
      if (!closed(value, ['schemaVersion', 'origin']) || value.schemaVersion !== 1) bad();
      let origin;
      try {
        origin = validatePortableUniverseOrigin(value.origin);
      } catch {
        bad();
      }
      const root = await required(['root']);
      if (
        root.universeId === null
          ? origin.kind !== 'none'
          : origin.kind === 'none' || origin.id !== root.universeId
      )
        bad();
      await add(['universe'], { kind: origin.kind });
      coreUnit(record, manifest);
      return;
    }
    if (record.kind === 'adventure-version') {
      const data = schema.validateAdventureVersion(value);
      if (record.id !== value.id) bad();
      await add(['version', record.id], {});
      await row({ kind: 'history-owner', resource: data.resource });
      state.pending = {
        stage: 'version-body',
        id: record.id,
        header: manifest,
        native: {
          byteLength: data.byteLength,
          chunkCount: data.chunkCount,
          contentHash: data.contentHash,
        },
      };
      bump(state.totals, 'versions');
      bump(state.totals, 'nativeHistoryRecords', 1 + data.chunkCount);
      return;
    }
    if (record.kind === 'adventure-draft') {
      const data = schema.validateAdventureDraft(value);
      const expected = await adventureCoreRecordIdentity(
        { family: 'resources', kind: data.resource.kind, parentId: null },
        data.resource.id,
      );
      check();
      if (record.id !== expected.id || state.totals.drafts !== 0) bad();
      await row({ kind: 'draft', resource: data.resource, current: data.current });
      raw({ kind: 'adventure-draft-text', id: record.id }, data, 'utf8-parts', {
        kind: 'draft',
        id: record.id,
        headerHash: manifest.contentHash,
      });
      bump(state.totals, 'drafts');
      return;
    }
    if (record.kind === 'adventure-image-binding') {
      const data = schema.validateAdventureImageBinding(value),
        id = sha(encoder.encode(adventureImageAddressLine(data.resource.kind, data.resource.id)));
      if (record.id !== id || (data.image !== null && data.image.assetId !== id)) bad();
      const head = await required(nodeKey(data.resource.kind, data.resource.id));
      const ref =
        data.image === null
          ? null
          : { imageId: data.image.imageId, alt: data.image.alt, caption: data.image.caption };
      if (head.imageHash !== jsonHash(ref)) bad();
      await add(['image-binding', data.resource.kind, data.resource.id], {});
      bump(state.totals, 'imageBindings');
      if (data.image === null)
        fold(
          'images',
          JSON.stringify([
            'binding',
            data.resource.kind,
            data.resource.id,
            manifest.contentHash,
            null,
            null,
          ]) + '\n',
        );
      else
        state.pending = {
          stage: 'image-asset',
          id,
          imageId: data.image.imageId,
          resource: data.resource,
          bindingHash: manifest.contentHash,
        };
      return;
    }
    footer(record, value);
  });

  async function resource(record, input, manifest) {
    const value = schema.validateAdventureResource(input),
      { kind, id, parentId, present, data } = value,
      def = definitions[kind];
    await identity(record, { family: 'resources', kind, parentId }, id);
    let singleton = def.singleton;
    if (def.sequence)
      singleton = jsonHash(
        def.sequence === 'milestone'
          ? { arcId: parentId, kind: def.sequence }
          : { kind: def.sequence },
      );
    if (singleton && id !== singleton) bad();
    const entry = { present, unitHash: manifest.contentHash };
    if (def.parent)
      await row({
        kind: 'parent',
        ownerKind: def.parent === 'arcs' ? 'arc' : def.parent === 'scenes' ? 'scene' : 'block',
        ownerId: parentId,
      });
    if (kind === 'scene' || kind === 'block') {
      entry.bodyHash = data.bodyHash;
      if (!validHash(entry.bodyHash)) bad();
      entry.archived = data.archived ?? false;
      entry.imageHash = jsonHash((kind === 'scene' ? data.mainBlockImage : data.image) ?? null);
      entry.personaId = kind === 'scene' ? (data.personaComplement?.personaId ?? null) : null;
      if (kind === 'scene') {
        await row({ kind: 'body-required', ownerKind: 'scene', ownerId: id });
        await row({
          kind: 'persona-required',
          scope: 'scene',
          id,
          personaId: entry.personaId,
          traits: data.personaComplement?.overrides.map((t) => t.traitId) ?? [],
        });
        if (data.parentId != null) await row({ kind: 'group', id: data.parentId });
        if (!entry.archived) {
          await row({
            kind: 'rank',
            group: 'scene',
            parentId: data.parentId ?? null,
            rankA: data.rankA ?? null,
            rankB: data.rankB ?? null,
          });
          await row({ kind: 'block-order', sceneId: id, order: data.mainBlockOrder ?? 0 });
        }
      } else {
        entry.sceneId = data.sceneId;
        await row({ kind: 'parent', ownerKind: 'scene', ownerId: data.sceneId });
        await row({ kind: 'body-required', ownerKind: 'block', ownerId: id });
        if (!entry.archived)
          await row({ kind: 'block-order', sceneId: data.sceneId, order: data.order ?? 0 });
      }
    }
    if (def.body) {
      if (sha(encoder.encode(data.content)) !== data.hash) bad();
      entry.hash = data.hash;
      await row({
        kind: 'body',
        ownerKind: kind === 'scene-body' ? 'scene' : 'block',
        ownerId: parentId,
        hash: data.hash,
      });
    }
    if (def.nativeKind)
      await row({
        kind: 'rank',
        group: kind,
        parentId,
        rankA: data.rankA ?? null,
        rankB: data.rankB ?? null,
      });
    if (kind === 'part-control') await row({ kind: 'part-control', id });
    if (Object.hasOwn(data, 'rankSlot')) entry.rankSlot = data.rankSlot;
    if (kind === 'scene-reference') await row({ kind: 'reference', reference: data });
    if (kind === 'narrative-link') {
      await row({ kind: 'narrative-source', source: data.source });
      if (data.reference.kind === 'lore')
        await row({ kind: 'reference', reference: data.reference.reference });
      else await row({ kind: 'narrative-target', reference: data.reference });
      await add(
        ['edge', jsonHash(canonical({ source: data.source, reference: data.reference }))],
        {},
      );
    }
    if (
      ['checklist', 'arc', 'event', 'milestone', 'scene', 'block'].includes(kind) &&
      (data.createdAt === undefined || data.updatedAt === undefined)
    )
      bump(state.warnings, 'missingDates');
    await add(nodeKey(kind, id, parentId), entry);
    bump(state.totals.resources, kind);
  }
  async function lore(record, value, manifest) {
    const kind = record.kind === 'adventure-lore' ? 'lore' : 'lore-body',
      data = schema.validateAdventureLore(value, kind);
    if (value.id !== record.id) bad();
    if (kind === 'lore') {
      const info = { deleted: data.deleted, unitHash: manifest.contentHash };
      if (!data.deleted)
        info.entityBytes = encoder.encode(
          JSON.stringify({
            name: data.name,
            aliases: data.aliases,
            category: data.category,
            summary: data.summary,
            isPublic: false,
          }),
        ).length;
      await add(['lore', record.id], info);
      await row({ kind: 'lore-head', id: record.id, deleted: data.deleted });
    } else {
      await add(['lore-body', record.id], {
        entityBytes: encoder.encode(JSON.stringify(data)).length,
      });
      await row({ kind: 'lore-body', id: record.id });
      for (const relation of data.relations) {
        const [kind, scopeId, entityId] = relation.targetEntityId.split(':');
        await row({ kind: 'reference', reference: { kind, scopeId, entityId } });
      }
    }
    bump(state.totals.lore, kind);
  }
  async function persona(record, input) {
    const value = schema.validateAdventurePersona(input);
    await identity(record, { family: 'personas', scope: value.scope }, value.bindingId);
    if (value.scope === 'adventure' && value.bindingId !== state.adventureId) bad();
    if (value.profile !== null) {
      const key = ['profile', value.personaId],
        before = await get(key),
        profileHash = jsonHash(canonical(value.profile));
      if (before) {
        if (before.hash !== profileHash) bad();
      } else await add(key, { hash: profileHash, traits: value.profile.traits.map((t) => t.id) });
    }
    await add(['persona', value.scope, value.bindingId], { personaId: value.personaId });
    await row({
      kind: 'persona-binding',
      scope: value.scope,
      id: value.bindingId,
      personaId: value.personaId,
    });
    bump(state.totals.personas, value.scope);
  }
  function footer(record, value) {
    rootId(record);
    const s = state.section,
      checksum = digest(s);
    let expected;
    if (record.kind === 'adventure-resources')
      expected = adventureCoreManifest(s, state.units[s], checksum, state.totals.resources);
    else if (record.kind === 'adventure-lore-end')
      expected = adventureCoreManifest(s, state.units[s], checksum, state.totals.lore);
    else if (record.kind === 'adventure-personas')
      expected = adventureCoreManifest(s, state.units[s], checksum, state.totals.personas);
    else if (record.kind === 'adventure-history')
      expected = adventureHistoryManifest(
        state.totals.versions,
        state.totals.nativeHistoryRecords,
        state.totals.historyBytes,
        checksum,
      );
    else if (record.kind === 'adventure-drafts')
      expected = adventureDraftsManifest(state.totals.drafts, state.totals.draftBytes, checksum);
    else if (record.kind === 'adventure-images')
      expected = adventureImagesManifest(
        state.totals.imageBindings,
        state.totals.imageAssets,
        state.totals.imageBytes,
        checksum,
      );
    else bad();
    if (!same(value, expected)) bad();
    state.ended.push(s);
  }
  const acceptRaw = operation(async (record, payload) => {
    const p = state.pending;
    if (
      state.phase !== 'records' ||
      !p ||
      p.stage !== 'raw' ||
      !closed(record, ['kind', 'id', 'part']) ||
      record.kind !== p.kind ||
      record.id !== p.id ||
      record.part !== p.part ||
      !(payload instanceof Uint8Array) ||
      payload.length > 65536
    )
      bad();
    const final = p.part === p.manifest.chunkCount - 1,
      remaining = p.manifest.byteLength - p.bytes;
    if (
      (p.layout === 'utf8-parts'
        ? p.manifest.byteLength === 0
          ? p.manifest.chunkCount !== 1 || payload.length !== 0
          : !payload.length || (final ? payload.length !== remaining : payload.length < 65533)
        : payload.length !== Math.min(65536, remaining)) ||
      payload.length > remaining
    )
      bad();
    if (p.layout === 'png') {
      if (
        p.part === 0 &&
        Array.from(payload.subarray(0, 8), (v) => v.toString(16).padStart(2, '0')).join('') !==
          '89504e470d0a1a0a'
      )
        bad();
    } else
      p.utf8 = advanceAdventureUtf8(
        p.layout === 'utf8-parts' ? createAdventureUtf8State() : p.utf8,
        payload,
        p.layout === 'utf8-parts' || final,
      );
    const h = hash.create(p.hashState);
    try {
      h.update(payload);
      p.bytes += payload.length;
      p.part++;
      account(state.section, payload.length);
      if (final) {
        if (p.bytes !== p.manifest.byteLength || h.digest() !== p.manifest.contentHash) bad();
        const after = p.after;
        if (after.kind === 'history') {
          fold('history', adventureHistoryDigestLine(after.id, after.header, after.body));
          bump(state.totals, 'historyBytes', p.bytes);
        } else if (after.kind === 'draft') {
          fold(
            'drafts',
            JSON.stringify([
              'draft',
              after.id,
              after.headerHash,
              p.bytes,
              p.part,
              p.manifest.contentHash,
            ]) + '\n',
          );
          bump(state.totals, 'draftBytes', p.bytes);
        } else if (after.kind === 'image') {
          const b = after.binding;
          fold(
            'images',
            JSON.stringify([
              'binding',
              b.resource.kind,
              b.resource.id,
              b.bindingHash,
              after.metadataHash,
              p.manifest.contentHash,
            ]) + '\n',
          );
          bump(state.totals, 'imageAssets');
          bump(state.totals, 'imageBytes', p.bytes);
        } else bad();
        state.pending = null;
      } else p.hashState = h.save();
    } finally {
      h.destroy();
    }
  });
  const beginFinish = operation(async (envelope) => {
    if (
      state.phase !== 'records' ||
      state.pending ||
      state.section !== 'images' ||
      state.ended.length !== sections.length ||
      !same(envelope.sections, state.counts) ||
      envelope.manifest?.adventureId !== state.adventureId
    )
      bad();
    const t = state.totals,
      r = t.resources;
    if (
      r['scene-body'] !== r.scene ||
      r['block-body'] !== r.block ||
      r['scene-planning'] !== r.scene ||
      r['part-control'] !== t.parts ||
      r['milestone-order'] !== r.arc ||
      r.progress !== 1 ||
      r['arc-order'] !== 1 ||
      r['event-order'] !== 1 ||
      r['scene-control'] !== 1 ||
      t.personas.adventure !== 1 ||
      t.personas.scene !== r.scene ||
      t.imageBindings !== r.scene + r.block ||
      state.units.universe !== 1
    )
      bad();
    await required(['root']);
    await required(['universe']);
    state.phase = 'finish';
  });

  async function finishRow(value) {
    if (value.kind === 'parent') {
      await required(nodeKey(value.ownerKind, value.ownerId));
      return;
    }
    if (value.kind === 'part-control') {
      await required(['part', value.id]);
      return;
    }
    if (value.kind === 'body-required') {
      await required(nodeKey(value.ownerKind + '-body', 'current', value.ownerId));
      return;
    }
    if (value.kind === 'body') {
      const owner = await required(nodeKey(value.ownerKind, value.ownerId));
      if (owner.bodyHash !== value.hash) bad();
      return;
    }
    if (value.kind === 'group') {
      if (!(await get(['part', value.id]))) bump(state.warnings, 'orphanGroups');
      return;
    }
    if (value.kind === 'lore-head') {
      const body = await get(['lore-body', value.id]);
      if (value.deleted ? body !== undefined : body === undefined) bad();
      return;
    }
    if (value.kind === 'lore-body') {
      const head = await required(['lore', value.id]),
        body = await required(['lore-body', value.id]);
      if (head.deleted || head.entityBytes + body.entityBytes - 1 > 900000) bad();
      return;
    }
    if (value.kind === 'reference') {
      await reference(value.reference);
      return;
    }
    if (value.kind === 'narrative-source') {
      const source = value.source;
      await required(nodeKey(source.kind, source.id, source.arcId ?? null));
      return;
    }
    if (value.kind === 'narrative-target') {
      const ref = value.reference,
        kind = ref.kind === 'scene' ? 'scene' : 'event',
        id = ref.kind === 'scene' ? ref.sceneId : ref.eventId;
      if (!(await get(nodeKey(kind, id)))) bump(state.warnings, 'danglingLocalReferences');
      return;
    }
    if (value.kind === 'history-owner') {
      if (!(await get(nodeKey(value.resource.kind, value.resource.id))))
        bump(state.warnings, 'historicalOnlyResources');
      return;
    }
    if (value.kind === 'persona-required') {
      const binding = await required(['persona', value.scope, value.id]);
      if (binding.personaId !== value.personaId) bad();
      if (value.personaId !== null) {
        const profile = await required(['profile', value.personaId]);
        bump(
          state.warnings,
          'unknownOverrides',
          value.traits.filter((id) => !profile.traits.includes(id)).length,
        );
      }
      return;
    }
    if (value.kind === 'persona-binding') {
      const owner = await required(
        value.scope === 'adventure' ? ['root'] : nodeKey('scene', value.id),
      );
      if (owner.personaId !== value.personaId) bad();
      return;
    }
    if (value.kind === 'draft') {
      const head = await required(nodeKey(value.resource.kind, value.resource.id)),
        body = await required(nodeKey(value.resource.kind + '-body', 'current', value.resource.id));
      if (head.unitHash !== value.current.headHash || body.unitHash !== value.current.bodyHash)
        bad();
      return;
    }
    if (value.kind === 'block-order') {
      const scene = await required(nodeKey('scene', value.sceneId));
      if (!scene.archived) await add(['block-order', value.sceneId, String(value.order)], {});
      return;
    }
    if (value.kind === 'rank') {
      let control;
      if (value.group === 'scene') {
        if (value.parentId !== null && !(await get(['part', value.parentId]))) return;
        control = await get(
          value.parentId === null
            ? nodeKey('scene-control', 'unassigned')
            : nodeKey('part-control', value.parentId),
        );
      } else {
        const kind = value.group,
          sequence = jsonHash(kind === 'milestone' ? { arcId: value.parentId, kind } : { kind });
        control = await get(
          nodeKey(kind + '-order', sequence, kind === 'milestone' ? value.parentId : null),
        );
      }
      const rank = control?.rankSlot === 'B' ? value.rankB : value.rankA;
      if (rank !== null) await add(['rank', value.group, value.parentId ?? '', rank], {});
      return;
    }
    bad();
  }
  const advanceFinish = operation(async (limit = ADVENTURE_CONTENT_LIMITS.stepItems) => {
    if (
      state.phase !== 'finish' ||
      !count(limit) ||
      limit < 1 ||
      limit > ADVENTURE_CONTENT_LIMITS.stepItems
    )
      bad();
    let used = 0;
    while (state.rowCursor < state.rows && used < limit) {
      const value = await required(['row', String(state.rowCursor)]);
      await finishRow(value);
      bump(state, 'rowCursor');
      used++;
    }
    if (state.rowCursor === state.rows) state.phase = 'done';
  });
  return {
    acceptJSON,
    acceptRaw,
    beginFinish,
    advanceFinish,
    checkpoint: () => snapshot(state),
    result() {
      check();
      if (
        state.phase !== 'done' ||
        state.pending ||
        state.rowCursor !== state.rows ||
        state.ended.length !== sections.length
      )
        bad();
      return {
        validation: 'semantic-only',
        version: 1,
        adventureId: state.adventureId,
        totals: structuredClone(state.totals),
        warnings: structuredClone(state.warnings),
      };
    },
  };
}
