import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { IMPACT_REGISTRY_TOKEN, readLiteraryImpactScope } from './literaryImpactScope.mjs';
import { readLiteraryImpactFence } from './literaryImpactFence.mjs';
const same = (a, b) => a != null && b != null && digest(a) === digest(b);
/** Shared native current-source check. Caller must authorize control UID/book/birth first. No writes. */
export async function inspectLiteraryImpactCurrent(tx, c, value, context) {
  if (value.registryToken !== IMPACT_REGISTRY_TOKEN) return false;
  const actual = await readLiteraryImpactScope(tx, c, value.intent);
  if (actual.scopeToken !== value.scopeToken) return false;
  if (!value.sourceFence) return true;
  const native = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryImpactJobs/' + value.jobId),
    ['uid', 'sourceFence'],
  );
  if (
    !native.exists ||
    native.data().uid !== c.uid ||
    native.data().sourceFence !== value.sourceFence
  )
    return false;
  if (value.graphBirth != null) {
    if (!same(value.graphBirth, literaryNativeBirth(native))) return false;
  } else if (
    !context ||
    !same(literaryNativeBirth(native), [
      context.row.updateTime.seconds,
      context.row.updateTime.nanoseconds,
    ])
  )
    return false;
  return (
    digest({
      registry: IMPACT_REGISTRY_TOKEN,
      token: (await readLiteraryImpactFence(tx, c, { bookIds: value.bookIds })).token,
    }) === value.sourceFence
  );
}
