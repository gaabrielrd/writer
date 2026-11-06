import {
  workId,
  workFail,
  digest,
  readWorkMetadata,
  workProject,
} from './workProgressContracts.mjs';
import { readLiteraryMilestoneEnvelope } from './literaryMilestones.mjs';
import { readLiteraryPersona } from './literaryPersona.mjs';
const stamp = (snapshot) => {
  if (!snapshot.exists) return null;
  const created = snapshot.createTime,
    updated = snapshot.updateTime;
  if (
    !Number.isSafeInteger(created?.seconds) ||
    !Number.isSafeInteger(created?.nanoseconds) ||
    !Number.isSafeInteger(updated?.seconds) ||
    !Number.isSafeInteger(updated?.nanoseconds)
  )
    workFail('failed-precondition', 'Não foi possível conferir a origem das fontes.');
  return {
    created: [created.seconds, created.nanoseconds],
    updated: [updated.seconds, updated.nanoseconds],
  };
};
export async function readLiteraryReviewSource(tx, c, chapterId) {
  const env = await readLiteraryMilestoneEnvelope(tx, c, chapterId);
  if (env.chapter.contentMode !== 'scenes')
    workFail(
      'failed-precondition',
      'Este fluxo revisa capítulos compostos por cenas. Preserve o capítulo legado e faça a conversão explícita antes de usar este fluxo.',
    );
  const root = env.root;
  let global = null;
  if (root.universeId)
    global = stamp(
      await readWorkMetadata(tx, c.db.doc('universes/' + workId(root.universeId)), []),
    );
  const persona = await readLiteraryPersona(tx, c, { kind: 'chapter', id: chapterId });
  return {
    root,
    chapter: env.chapter,
    manuscriptToken: env.token,
    personaDependencies: persona.dependencies,
    token: digest({
      personaToken: persona.metadata.versionToken,
      domain: 'literary-chapter-review-v2',
      chapterToken: env.token,
      // The native chapter envelope advances for its scene writes/structure.
      // A prose edit in a different chapter does not invalidate this reading.
      narrativeRevision: root.narrativeRevision ?? 0,
      literaryContextRevision: root.literaryContextRevision ?? 0,
      localLoreVersion: root.localLoreVersion ?? 0,
      loreVersion: root.loreVersion ?? 0,
      universeId: root.universeId ?? null,
      global,
    }),
  };
}

export function literaryReviewBirth(snapshot) {
  const value = stamp(snapshot);
  return value ? { seconds: value.created[0], nanoseconds: value.created[1] } : null;
}
/** Read-only equivalent of the native review source check; does not retire a job. */
export async function inspectLiteraryReviewSource(tx, c, job) {
  await workProject(tx, c);
  if (job.state === 'canceled')
    return { source: null, matches: false, current: false, reason: 'not-recorded' };
  let actual;
  try {
    actual = await readLiteraryReviewSource(tx, c, job.chapterId);
  } catch (cause) {
    if (
      !['not-found', 'failed-precondition', 'permission-denied', 'resource-exhausted'].includes(
        cause.code,
      )
    )
      throw cause;
    await workProject(tx, c);
    return {
      source: null,
      matches: false,
      current: false,
      reason: ['not-found', 'permission-denied'].includes(cause.code)
        ? 'source-revoked'
        : 'source-unavailable',
    };
  }
  const matches = !!actual && actual.token === job.sourceToken;
  return {
    source: actual ?? null,
    matches,
    current: matches && job.state !== 'stale',
    reason: matches && job.state !== 'stale' ? null : 'source-unavailable',
  };
}
