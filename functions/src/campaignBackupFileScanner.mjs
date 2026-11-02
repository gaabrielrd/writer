import { createHash } from 'node:crypto';
import { createSHA256 } from 'hash-wasm';
export const CAMPAIGN_FILE_CHECKPOINT_CODEC = 'sha256/hash-wasm@4.12.0';
import { campaignTextUnit, campaignFieldChunk } from './campaignBackupTextChunks.mjs';
import { CAMPAIGN_OWN_JSON_BYTES } from './campaignBackupOwnDefinitions.mjs';
import { workId, workFail } from './workProgressContracts.mjs';
import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import {
  closedCampaignRecord,
  validatePortableCampaignManifest,
  validateCampaignAttestation,
} from './portableCampaignManifest.mjs';
import {
  campaignFileBad as bad,
  campaignFileJson,
  campaignFileHeader,
  campaignFileUnit,
  campaignFileWitness,
} from './campaignBackupFileRecords.mjs';
const add = (v, n = 1) => {
  const r = v + n;
  if (!Number.isSafeInteger(r) || r < 0) bad();
  return r;
};
/** One shared grammar. Checkpoints are server-trusted state, never client input or a grant. */
export async function createCampaignBackupFileScanner(
  uid,
  source,
  {
    keys,
    now = Date.now,
    signal,
    onProgress,
    onWitness,
    onOwnUnit,
    onDerivedUnit,
    resumable = false,
    checkpoint = null,
  } = {},
) {
  if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  if (
    (onProgress !== undefined && typeof onProgress !== 'function') ||
    (onWitness !== undefined && typeof onWitness !== 'function') ||
    (onOwnUnit !== undefined && typeof onOwnUnit !== 'function') ||
    (onDerivedUnit !== undefined && typeof onDerivedUnit !== 'function')
  )
    throw new TypeError('Progresso de validação inválido.');
  if (
    !source ||
    typeof source.read !== 'function' ||
    !Number.isSafeInteger(source.size) ||
    source.size < 16
  )
    bad();
  if (
    typeof resumable !== 'boolean' ||
    (checkpoint !== null && !resumable) ||
    (resumable && [onProgress, onWitness, onOwnUnit, onDerivedUnit].some((v) => v !== undefined))
  )
    throw new TypeError('Checkpoint exige revisão sem callbacks.');
  async function hasher() {
    if (!resumable) return createHash('sha256');
    const h = await createSHA256();
    h.init();
    return h;
  }
  async function hex(h) {
    if (!resumable) return h.copy().digest('hex');
    const copy = await hasher();
    copy.load(h.save());
    return copy.digest('hex');
  }
  const size = source.size,
    read = source.read.bind(source),
    input = {
      get size() {
        if (source.size !== size) bad();
        return size;
      },
      read,
    },
    verifier = createCampaignBackupAttestationVerifier({ keys, now }),
    content = await hasher(),
    provenance = await hasher(),
    fold = (hash, v) => hash.update(JSON.stringify(v) + '\n');
  let cursor = null,
    header = null,
    packet = null,
    active = null,
    units = 0,
    bytes = 0,
    chunks = 0,
    omitted = 0,
    unavailable = 0,
    witnesses = 0,
    witnessBytes = 0,
    sawProject = false,
    seal = null,
    busy = false,
    disposed = false,
    failed = false;

  const stateKeys = [
    'schemaVersion',
    'codec',
    'uid',
    'size',
    'cursor',
    'header',
    'packet',
    'active',
    'units',
    'bytes',
    'chunks',
    'omitted',
    'unavailable',
    'witnesses',
    'witnessBytes',
    'sawProject',
    'contentHashState',
    'provenanceHashState',
    'seal',
  ];
  const number = (n) => {
    if (!Number.isSafeInteger(n) || n < 0) bad();
    return n;
  };
  const hashState = (value) => {
    if (typeof value !== 'string' || value.length > 5464) bad();
    const b = Buffer.from(value, 'base64');
    if (b.toString('base64') !== value || !b.length || b.length > 4096) bad();
    return b;
  };
  function packetValue(p) {
    if (!closedCampaignRecord(p, ['manifest', 'attestation'])) bad();
    return {
      manifest: validatePortableCampaignManifest(p.manifest),
      attestation: validateCampaignAttestation(p.attestation),
    };
  }
  if (checkpoint !== null) {
    try {
      const c = structuredClone(checkpoint);
      if (
        !closedCampaignRecord(c, stateKeys) ||
        c.schemaVersion !== 1 ||
        c.codec !== CAMPAIGN_FILE_CHECKPOINT_CODEC ||
        c.uid !== uid ||
        c.size !== size ||
        typeof c.sawProject !== 'boolean' ||
        !c.cursor
      )
        bad();
      for (const k of [
        'units',
        'bytes',
        'chunks',
        'omitted',
        'unavailable',
        'witnesses',
        'witnessBytes',
      ])
        number(c[k]);
      const cur = c.cursor;
      if (
        !closedCampaignRecord(cur, [
          'schemaVersion',
          'size',
          'offset',
          'records',
          'payloadBytes',
          'previous',
          'done',
        ]) ||
        cur.schemaVersion !== 1 ||
        cur.size !== size ||
        number(cur.offset) < 16 ||
        cur.offset > size ||
        number(cur.records) > 0xffffffff ||
        number(cur.payloadBytes) > size ||
        !/^[a-f0-9]{64}$/.test(cur.previous) ||
        typeof cur.done !== 'boolean' ||
        cur.done !== Boolean(c.seal) ||
        c.units > cur.records ||
        c.witnesses > cur.records ||
        c.omitted + c.unavailable > c.units
      )
        bad();
      header = campaignFileHeader(c.header);
      packet = c.packet === null ? null : packetValue(c.packet);
      cursor = cur;
      units = c.units;
      bytes = c.bytes;
      chunks = c.chunks;
      omitted = c.omitted;
      unavailable = c.unavailable;
      witnesses = c.witnesses;
      witnessBytes = c.witnessBytes;
      sawProject = c.sawProject;
      seal = c.seal;
      if (
        seal &&
        (!closedCampaignRecord(seal, ['records', 'payloadBytes', 'archiveBytes', 'chainHash']) ||
          seal.records !== cur.records ||
          seal.payloadBytes !== cur.payloadBytes ||
          seal.archiveBytes !== size ||
          seal.chainHash !== cur.previous ||
          cur.offset !== size ||
          !packet ||
          c.active)
      )
        bad();
      content.load(hashState(c.contentHashState));
      provenance.load(hashState(c.provenanceHashState));
      if (c.active !== null) {
        const a = c.active;
        if (
          !closedCampaignRecord(a, [
            'id',
            'unit',
            'index',
            'bytes',
            'previousLength',
            'hashState',
          ]) ||
          packet ||
          a.id !== String(units - 1)
        )
          bad();
        const unit = campaignFileUnit(a.unit, header.contentVersion);
        if (
          unit.outcome !== 'available' ||
          number(a.index) >= unit.chunkCount ||
          number(a.bytes) > unit.byteLength ||
          (a.index === 0
            ? a.bytes !== 0 || a.previousLength !== null
            : number(a.previousLength) > 65536 || a.bytes < a.previousLength)
        )
          bad();
        const h = await hasher();
        h.load(hashState(a.hashState));
        active = {
          id: a.id,
          unit,
          index: a.index,
          bytes: a.bytes,
          ...(a.previousLength === null ? {} : { previousLength: a.previousLength }),
          hash: h,
          own: false,
          derived: false,
        };
      }
    } catch {
      bad();
    }
  }
  async function result() {
    if (!seal || active || !packet || !header || (header.provenanceVersion === 2 && !sawProject))
      bad();
    const verified = verifier.verifyCampaignBackupAttestation(uid, packet),
      m = verified.manifest,
      actual = { units, bytes, chunks, omitted, unavailable, digest: await hex(content) },
      origins = { units: witnesses, bytes: witnessBytes, digest: await hex(provenance) };
    if (
      m.contentVersion !== header.contentVersion ||
      m.provenanceVersion !== header.provenanceVersion ||
      m.originCampaignId !== header.originCampaignId ||
      m.availability !== header.availability ||
      JSON.stringify(m.content) !== JSON.stringify(actual) ||
      JSON.stringify(m.provenance) !== JSON.stringify(origins)
    )
      bad();
    signal?.throwIfAborted();
    return Object.freeze({
      validation: 'campaign-file-integrity-only',
      manifest: m,
      attestation: packet.attestation,
      seal: Object.freeze({ ...seal }),
    });
  }
  return Object.freeze({
    async next() {
      if (busy || disposed || failed) throw new TypeError('Leitor indisponível.');
      busy = true;
      try {
        if (seal) return { done: true, result: await result() };
        signal?.throwIfAborted();
        const step = await readCampaignBackupFrame(input, cursor, { signal });
        signal?.throwIfAborted();
        cursor = step.cursor;
        if (step.seal) {
          if (!packet || active || (header.provenanceVersion === 2 && !sawProject)) bad();
          seal = step.seal;
          return { done: true, result: await result() };
        }
        const r = step.record;
        if (packet) bad();
        if (!header) {
          if (r.kind !== 'campaign' || r.id !== 'header' || r.part !== 0) bad();
          header = campaignFileJson(r.payload, campaignFileHeader);
          fold(content, [
            'writer-campaign-logical-units-v' + header.contentVersion,
            header.originCampaignId,
            header.availability,
          ]);
          fold(provenance, [
            'writer-campaign-witnesses-v' + header.provenanceVersion,
            header.originCampaignId,
          ]);
        } else if (active) {
          if (
            r.kind !== 'data' ||
            r.id !== active.id ||
            r.part !== active.index ||
            (header.contentVersion >= 2 && campaignTextUnit(active.unit.section)
              ? !campaignFieldChunk(
                  r.payload,
                  active.index,
                  active.unit.chunkCount,
                  active.unit.byteLength,
                  active.previousLength,
                )
              : r.payload.length !== Math.min(65536, active.unit.byteLength - active.bytes))
          )
            bad();
          if (
            active.unit.section === 'image' &&
            r.part === 0 &&
            Buffer.from(r.payload.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a'
          )
            bad();
          if (active.utf8) {
            try {
              active.utf8.decode(r.payload, { stream: true });
            } catch {
              bad();
            }
          }
          if (active.parts) active.parts.push(Buffer.from(r.payload));
          active.hash.update(r.payload);
          active.bytes = add(active.bytes, r.payload.length);
          if (active.bytes > active.unit.byteLength) bad();
          active.previousLength = r.payload.length;
          active.index++;
          if (active.index === active.unit.chunkCount) {
            const digest = active.hash.digest('hex');
            active.hash.destroy?.();
            if (active.bytes !== active.unit.byteLength || digest !== active.unit.contentHash)
              bad();
            if (active.utf8) {
              try {
                active.utf8.decode();
              } catch {
                bad();
              }
            }
            if (active.own) {
              await onOwnUnit(
                Object.freeze({
                  index: Number(active.id),
                  unit: Object.freeze(active.unit),
                  payload: Buffer.concat(active.parts, active.bytes),
                }),
              );
              signal?.throwIfAborted();
            }
            if (active.derived) {
              await onDerivedUnit(
                Object.freeze({
                  index: Number(active.id),
                  contentVersion: header.contentVersion,
                  unit: Object.freeze(active.unit),
                  payload: active.parts ? Buffer.concat(active.parts, active.bytes) : null,
                }),
              );
              signal?.throwIfAborted();
            }
            active = null;
          }
        } else if (r.kind === 'unit') {
          if (r.id !== String(units) || r.part !== 0) bad();
          const unit = campaignFileJson(r.payload, (v) =>
            campaignFileUnit(v, header.contentVersion),
          );
          if (unit.section === 'own:campaign' && unit.id !== header.originCampaignId) bad();
          if (unit.section === 'own:progress' && unit.id !== 'current') bad();
          units = add(units);
          bytes = add(bytes, unit.byteLength ?? 0);
          chunks = add(chunks, unit.chunkCount ?? 0);
          if (unit.outcome === 'omitted') omitted = add(omitted);
          if (unit.outcome === 'unavailable') unavailable = add(unavailable);
          fold(content, unit);
          const own = onOwnUnit && unit.section.startsWith('own:'),
            derived = onDerivedUnit && !unit.section.startsWith('own:'),
            json = own || (derived && !campaignTextUnit(unit.section) && unit.section !== 'image');
          if (json && unit.outcome === 'available' && unit.byteLength > CAMPAIGN_OWN_JSON_BYTES)
            bad();
          if (unit.outcome === 'available')
            active = {
              id: r.id,
              unit,
              index: 0,
              bytes: 0,
              hash: await hasher(),
              own,
              derived,
              ...(json ? { parts: [] } : {}),
              ...(derived && campaignTextUnit(unit.section)
                ? { utf8: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }) }
                : {}),
            };
          else if (own || derived) {
            await (own ? onOwnUnit : onDerivedUnit)(
              Object.freeze({
                index: units - 1,
                unit: Object.freeze(unit),
                payload: null,
                ...(derived ? { contentVersion: header.contentVersion } : {}),
              }),
            );
            signal?.throwIfAborted();
          }
        } else if (r.kind === 'witness') {
          if (r.id !== String(witnesses) || r.part !== 0) bad();
          const witness = campaignFileJson(r.payload, campaignFileWitness, 65536);
          if (witness[0] === 'project') {
            if (
              header.provenanceVersion !== 2 ||
              witnesses !== 0 ||
              sawProject ||
              witness[1] !== header.originCampaignId
            )
              bad();
            sawProject = true;
          } else if (header.provenanceVersion === 2 && !sawProject) bad();
          witnesses = add(witnesses);
          witnessBytes = add(
            witnessBytes,
            witness[3] === null ? 0 : Buffer.byteLength(JSON.stringify(witness[3])),
          );
          fold(provenance, witness);
          // Provisional callback for temporary staging only; no origin lookup before final proof.
          if (onWitness) {
            await onWitness(
              Object.freeze({ index: witnesses - 1, record: Object.freeze(witness) }),
            );
            signal?.throwIfAborted();
          }
        } else if (r.kind === 'attestation') {
          if (r.id !== 'manifest' || r.part !== 0) bad();
          packet = campaignFileJson(r.payload, (v) => {
            if (!closedCampaignRecord(v, ['manifest', 'attestation'])) bad();
            return {
              manifest: validatePortableCampaignManifest(v.manifest),
              attestation: validateCampaignAttestation(v.attestation),
            };
          });
        } else bad();
        if (onProgress) {
          await onProgress(Object.freeze({ records: cursor.records, units, witnesses }));
          signal?.throwIfAborted();
        }

        return { done: false };
      } catch (e) {
        failed = true;
        throw e;
      } finally {
        busy = false;
      }
    },
    async result() {
      if (busy || disposed || failed) throw new TypeError('Leitor indisponível.');
      return result();
    },
    snapshot() {
      if (busy || disposed || failed || !resumable || !cursor || !header)
        throw new TypeError('Checkpoint indisponível.');
      return structuredClone({
        schemaVersion: 1,
        codec: CAMPAIGN_FILE_CHECKPOINT_CODEC,
        uid,
        size,
        cursor,
        header,
        packet,
        active: active
          ? {
              id: active.id,
              unit: active.unit,
              index: active.index,
              bytes: active.bytes,
              previousLength: active.previousLength ?? null,
              hashState: Buffer.from(active.hash.save()).toString('base64'),
            }
          : null,
        units,
        bytes,
        chunks,
        omitted,
        unavailable,
        witnesses,
        witnessBytes,
        sawProject,
        contentHashState: Buffer.from(content.save()).toString('base64'),
        provenanceHashState: Buffer.from(provenance.save()).toString('base64'),
        seal,
      });
    },
    dispose() {
      disposed = true;
      active?.hash.destroy?.();
      content.destroy?.();
      provenance.destroy?.();
    },
  });
}
