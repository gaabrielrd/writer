import { createHash } from 'node:crypto';
import { sceneAdventureArchive } from './adventureRestoreSceneArchiveFixture.mjs';
import {
  encodeAdventureBackup,
  decodeAdventureBackup,
} from '../../src/adventureBackupContainer.mjs';
import {
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageSection,
} from '../../src/adventureBackupPackage.mjs';
import {
  adventureCoreRecordIdentity,
  adventureCoreCounts,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  adventureCoreManifest,
} from '../../src/adventureArchiveCore.mjs';
import { digest, sequenceKey } from '../../src/narrativeContracts.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const sourceScene = 'original-scene-source-0001';
export const sourceArc = 'original-arc-source-0001';
export const sourceMilestone = 'original-milestone-0001';
export const sourceEvent = 'original-event-source-0001';
/** Independent semantic archive; external references carry qualified addresses only. */
export async function resourceAdventureArchive({
  references = 3,
  milestoneFirst = false,
  planning = true,
  objective = 'PRIVATE_OBJECTIVE',
} = {}) {
  const base = await sceneAdventureArchive(),
    rows = [];
  for await (const row of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    rows.push(row);
  const values = rows
    .filter((r) => r.kind === 'adventure-resource')
    .map((r) => JSON.parse(Buffer.from(r.payload).toString('utf8')));
  const progress = values.find((v) => v.kind === 'progress');
  progress.present = true;
  progress.data = { editorialState: 'review', wordGoal: 12345, updatedAt: 1500 };
  const plan = values.find((v) => v.kind === 'scene-planning');
  plan.present = planning;
  plan.data = planning
    ? { objective, conflict: 'PRIVATE_CONFLICT', pointOfView: 'PRIVATE_POV' }
    : {};
  const arcOrder = values.find((v) => v.kind === 'arc-order');
  arcOrder.present = true;
  arcOrder.data = { rankSlot: 'B' };
  const resource = (kind, id, data, parentId = null, present = true) => ({
    schemaVersion: 1,
    kind,
    id,
    parentId,
    present,
    data,
  });
  const arc = resource('arc', sourceArc, {
    kind: 'arc',
    title: 'PRIVATE_ARC',
    initialState: 'Before',
    objective: 'Goal',
    plannedOutcome: 'After',
    rankA: 'U',
    rankB: 'V',
    createdAt: 1200,
    updatedAt: 1300,
  });
  const milestone = resource(
    'milestone',
    sourceMilestone,
    {
      kind: 'milestone',
      arcId: sourceArc,
      title: 'PRIVATE_MILESTONE',
      notes: 'PRIVATE_NOTES',
      rankA: 'U',
      rankB: 'V',
      createdAt: 1201,
      updatedAt: 1301,
    },
    sourceArc,
  );
  values.push(
    resource('checklist', 'original-checklist-0001', {
      title: 'PRIVATE_CHECKLIST',
      completed: true,
      createdAt: 1100,
      updatedAt: 1400,
    }),
    ...(milestoneFirst ? [milestone, arc] : [arc, milestone]),
    resource('event', sourceEvent, {
      kind: 'event',
      title: 'PRIVATE_EVENT',
      description: 'PRIVATE_DESCRIPTION',
      dateLabel: '3º dia do inverno',
      rankA: 'U',
      rankB: 'V',
      createdAt: 1202,
      updatedAt: 1302,
    }),
    resource(
      'milestone-order',
      sequenceKey({ kind: 'milestone', arcId: sourceArc }),
      { rankSlot: 'B' },
      sourceArc,
    ),
  );
  const source = { kind: 'milestone', id: sourceMilestone, arcId: sourceArc },
    reference = { kind: 'scene', sceneId: sourceScene };
  values.push(resource('narrative-link', digest({ source, reference }), { source, reference }));
  for (let n = 0; n < references; n++) {
    const ref = {
      kind: 'universe',
      scopeId: 'external-universe-0001',
      entityId: 'external-entity-' + String(n).padStart(5, '0'),
    };
    values.push(resource('scene-reference', digest(ref), ref, sourceScene));
  }
  const hash = createHash('sha256').update(adventureCoreDigestSeed('resources')),
    counts = adventureCoreCounts('resources'),
    prepared = [];
  for (const v of values) {
    const a = await adventureCoreRecordIdentity(
        { family: 'resources', kind: v.kind, parentId: v.parentId },
        v.id,
      ),
      payload = Buffer.from(JSON.stringify(v));
    hash.update(
      adventureCoreDigestLine(a, {
        byteLength: payload.length,
        chunkCount: 1,
        contentHash: sha(payload),
      }),
    );
    counts[v.kind]++;
    prepared.push({ ...a, part: 0, payload });
  }
  prepared.push({
    kind: 'adventure-resources',
    id: rows[0].id,
    part: 0,
    payload: Buffer.from(
      JSON.stringify(adventureCoreManifest('resources', values.length, hash.digest('hex'), counts)),
    ),
  });
  const body = rows
    .slice(1, -1)
    .flatMap((r) =>
      r.kind === 'adventure-resources' ? prepared : r.kind === 'adventure-resource' ? [] : [r],
    );
  const packageCounts = createAdventurePackageCounts();
  for (const r of body)
    countAdventurePackageRecord(packageCounts, adventurePackageSection(r.kind), r);
  const chunks = [];
  for await (const bytes of encodeAdventureBackup([
    rows[0],
    ...body,
    adventurePackageEnd(rows[0].id, packageCounts),
  ]))
    chunks.push(bytes);
  return Buffer.concat(chunks);
}
