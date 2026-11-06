import { workFail, workProject } from './workProgressContracts.mjs';
import {
  readLiteraryIntegrationUnit,
  readLiteraryIntegrationFence,
} from './literaryIntegrationSources.mjs';
import { literaryWritingIsCurrent } from './literaryWritingContext.mjs';
import {
  authorizeLiteraryArchitectureGuide,
  authorizeLiteraryArchitectureSource,
} from './literaryArchitectureSources.mjs';
/** Shared reauthorization for viewing, deciding, reconfirming and committing an analysis. */
export async function authorizeLiteraryIntegrationRequest(tx, c, header) {
  for (const source of header.sources ?? []) await readLiteraryIntegrationUnit(tx, c, source);
  if (header.manifest && !(await literaryWritingIsCurrent(tx, c, header.manifest)))
    workFail('failed-precondition', 'As fontes editoriais desta análise mudaram.');
  if (header.architectureGuide)
    await authorizeLiteraryArchitectureGuide(tx, c, header.architectureGuide);
  const architectureSource = header.architectureSource
    ? await authorizeLiteraryArchitectureSource(tx, c, header.architectureSource)
    : null;
  return { architectureSource };
}

/** Native timestamps are private association witnesses, never content grants. */
export function literaryIntegrationBirth(row) {
  if (!row.exists) return null;
  const value = row.createTime;
  if (
    !Number.isSafeInteger(value?.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value?.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'A identidade da integração não pôde ser conferida.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
/** Same current-source rule as the interactive reader, with no stale transition. */
export async function inspectLiteraryIntegrationSource(tx, c, job) {
  await workProject(tx, c);
  if (['canceled', 'stale'].includes(job.state))
    return { current: false, source: null, reason: 'source-unavailable' };
  let actual;
  try {
    actual = await readLiteraryIntegrationFence(tx, c);
  } catch (cause) {
    if (!['not-found', 'permission-denied', 'failed-precondition'].includes(cause.code))
      throw cause;
    await workProject(tx, c);
    return {
      current: false,
      source: null,
      reason: ['not-found', 'permission-denied'].includes(cause.code)
        ? 'source-revoked'
        : 'source-unavailable',
    };
  }
  const current = actual.token === job.sourceFence;
  return { current, source: actual, reason: current ? null : 'source-unavailable' };
}
