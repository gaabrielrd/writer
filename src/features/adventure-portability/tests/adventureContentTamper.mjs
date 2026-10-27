import { createHash } from 'node:crypto';
import { encodeAdventureBackup } from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  adventurePackageSection,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageEnd,
} from '../../../../functions/src/adventureBackupPackage.mjs';
import {
  adventureCoreCounts,
  adventureCoreManifest,
  adventureCoreDigestSeed,
} from '../../../../functions/src/adventureArchiveCore.mjs';
const rawKinds = ['adventure-version-text', 'adventure-draft-text', 'adventure-image-bytes'];
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (unit) => JSON.parse(unit.bytes);
export function setJSON(unit, value) {
  unit.bytes = Buffer.from(JSON.stringify(value));
}
export function archiveUnits(records) {
  const all = [];
  for (const record of records) {
    const old = all.at(-1);
    if (old && old.kind === record.kind && old.id === record.id) old.parts.push(record.payload);
    else all.push({ kind: record.kind, id: record.id, parts: [record.payload] });
  }
  return all.map((u) => ({
    kind: u.kind,
    id: u.id,
    bytes: Buffer.concat(u.parts),
    rawParts: rawKinds.includes(u.kind) ? u.parts.map((p) => Buffer.from(p)) : null,
  }));
}
function fixed(bytes) {
  const parts = [];
  for (let at = 0; at < bytes.length; at += 65536) parts.push(bytes.subarray(at, at + 65536));
  return parts.length ? parts : [Buffer.alloc(0)];
}
const manifest = (u) => ({
  byteLength: u.bytes.length,
  chunkCount: Math.ceil(u.bytes.length / 65536),
  contentHash: hash(u.bytes),
});
function repairCore(units, section, kinds, endKind) {
  const counts = adventureCoreCounts(section),
    digest = createHash('sha256').update(adventureCoreDigestSeed(section));
  let total = 0;
  for (const u of units.filter((u) => kinds.includes(u.kind))) {
    const value = json(u),
      m = manifest(u),
      key = section === 'personas' ? value.scope : value.kind;
    counts[key]++;
    total++;
    digest.update(
      JSON.stringify(['unit', u.kind, u.id, m.byteLength, m.chunkCount, m.contentHash]) + '\n',
    );
  }
  setJSON(
    units.find((u) => u.kind === endKind),
    adventureCoreManifest(section, total, digest.digest('hex'), counts),
  );
}
function repairHistory(units) {
  const digest = createHash('sha256').update('writer-adventure-history-v1\n');
  let versions = 0,
    nativeRecords = 0,
    textBytes = 0;
  for (const header of units.filter((u) => u.kind === 'adventure-version')) {
    const body = units.find((u) => u.kind === 'adventure-version-body' && u.id === header.id),
      raw = units.find((u) => u.kind === 'adventure-version-text' && u.id === header.id);
    const head = json(header);
    head.data.byteLength = raw.bytes.length;
    head.data.contentHash = hash(raw.bytes);
    setJSON(header, head);
    const meta = json(body);
    meta.headerHash = hash(header.bytes);
    meta.byteLength = raw.bytes.length;
    meta.contentHash = hash(raw.bytes);
    meta.chunkCount = Math.max(1, Math.ceil(raw.bytes.length / 65536));
    setJSON(body, meta);
    const h = manifest(header);
    digest.update(
      JSON.stringify([
        'version',
        header.id,
        h.byteLength,
        h.chunkCount,
        h.contentHash,
        raw.bytes.length,
        meta.chunkCount,
        meta.contentHash,
      ]) + '\n',
    );
    versions++;
    nativeRecords += 1 + head.data.chunkCount;
    textBytes += raw.bytes.length;
  }
  setJSON(
    units.find((u) => u.kind === 'adventure-history'),
    { schemaVersion: 1, versions, nativeRecords, textBytes, digest: digest.digest('hex') },
  );
}
function repairDraft(units) {
  const digest = createHash('sha256').update('writer-adventure-drafts-v1\n');
  let count = 0,
    bytes = 0;
  for (const header of units.filter((u) => u.kind === 'adventure-draft')) {
    const raw = units.find((u) => u.kind === 'adventure-draft-text' && u.id === header.id),
      meta = json(header);
    meta.byteLength = raw.bytes.length;
    meta.contentHash = hash(raw.bytes);
    meta.chunkCount = raw.rawParts.length;
    setJSON(header, meta);
    digest.update(
      JSON.stringify([
        'draft',
        header.id,
        hash(header.bytes),
        raw.bytes.length,
        meta.chunkCount,
        meta.contentHash,
      ]) + '\n',
    );
    count++;
    bytes += raw.bytes.length;
  }
  setJSON(
    units.find((u) => u.kind === 'adventure-drafts'),
    { schemaVersion: 1, count, bytes, digest: digest.digest('hex') },
  );
}
function repairImages(units) {
  const digest = createHash('sha256').update('writer-adventure-images-v1\n');
  let bindings = 0,
    assets = 0,
    bytes = 0;
  for (const binding of units.filter((u) => u.kind === 'adventure-image-binding')) {
    const value = json(binding);
    let assetHash = null,
      contentHash = null;
    if (value.image !== null) {
      const asset = units.find((u) => u.kind === 'adventure-image' && u.id === value.image.assetId),
        raw = units.find((u) => u.kind === 'adventure-image-bytes' && u.id === value.image.assetId);
      const metadata = json(asset);
      metadata.byteLength = raw.bytes.length;
      metadata.chunkCount = Math.ceil(raw.bytes.length / 65536);
      metadata.contentHash = hash(raw.bytes);
      setJSON(asset, metadata);
      assetHash = hash(asset.bytes);
      contentHash = metadata.contentHash;
      assets++;
      bytes += raw.bytes.length;
    }
    digest.update(
      JSON.stringify([
        'binding',
        value.resource.kind,
        value.resource.id,
        hash(binding.bytes),
        assetHash,
        contentHash,
      ]) + '\n',
    );
    bindings++;
  }
  setJSON(
    units.find((u) => u.kind === 'adventure-images'),
    { schemaVersion: 1, bindings, assets, bytes, digest: digest.digest('hex') },
  );
}
/** Test-only resealing uses Node crypto independently; malformed domain data still has valid framing and corrected section digests. */
export async function reseal(units, { repair = true } = {}) {
  if (repair) {
    repairCore(units, 'resources', ['adventure-resource'], 'adventure-resources');
    repairCore(units, 'lore', ['adventure-lore', 'adventure-lore-body'], 'adventure-lore-end');
    repairCore(units, 'personas', ['adventure-persona'], 'adventure-personas');
    repairHistory(units);
    repairDraft(units);
    repairImages(units);
  }
  const records = [],
    counts = createAdventurePackageCounts();
  for (const u of units.filter((u) => u.kind !== 'adventure-package-end')) {
    let offset = 0;
    const parts = u.rawParts
      ? u.rawParts.map((part) => {
          const bytes = u.bytes.subarray(offset, offset + part.length);
          offset += part.length;
          return bytes;
        })
      : fixed(u.bytes);
    if (u.rawParts && offset !== u.bytes.length)
      throw Error('A alteração do teste mudou o tamanho das partes raw.');
    for (let part = 0; part < parts.length; part++) {
      const record = { kind: u.kind, id: u.id, part, payload: parts[part] },
        section = adventurePackageSection(u.kind);
      if (section) countAdventurePackageRecord(counts, section, record);
      records.push(record);
    }
  }
  records.push(adventurePackageEnd(units[0].id, counts));
  const bytes = [];
  for await (const part of encodeAdventureBackup(records)) bytes.push(part);
  return Buffer.concat(bytes);
}
