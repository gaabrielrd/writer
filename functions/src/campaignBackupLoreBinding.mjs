import { LORE_BYTES, CHUNK_BYTES } from './campaignLoreContracts.mjs';
import { normalizedBodyBinding } from './campaignLoreStorage.mjs';
import { baseMasked, baseHash } from './campaignBackupBaseContext.mjs';
import { loreBackupBad, loreBackupChanged } from './campaignBackupLoreContext.mjs';
import { digest } from './workProgressContracts.mjs';
const safe = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
/** Structural routing only; canonical JSON and whole-body SHA remain in the content reader. */
export async function campaignBackupLoreBinding(c, unit) {
  if (unit.entry.availability !== 'available') return null;
  const read = await baseMasked(c.tx, c.db.doc(c.lorePath + '/loreVariants/' + unit.entry.id), [
    'manifest',
    'bodyBinding',
  ]);
  if (digest(read.native) !== digest(unit.native)) loreBackupChanged();
  const overlay = { ...unit.value, ...read.value },
    mode = overlay.mode === 'removed' ? overlay.previousMode : overlay.mode;
  if (mode === 'base') {
    if (overlay.manifest != null || overlay.bodyBinding != null) loreBackupBad();
    return { binding: null, manifest: null, scope: null };
  }
  const m = overlay.manifest;
  if (
    !m ||
    !safe(m.bodyRevision, 1) ||
    m.bodyRevision > overlay.revision ||
    !safe(m.bytes, 1) ||
    m.bytes > LORE_BYTES ||
    !safe(m.chunkCount, 1) ||
    m.chunkCount > Math.ceil(m.bytes / (CHUNK_BYTES - 3)) ||
    !baseHash(m.sha256)
  )
    loreBackupBad();
  let binding;
  try {
    binding = normalizedBodyBinding(
      { base: { id: c.baseId }, generationId: c.generationId },
      overlay,
    );
  } catch {
    loreBackupBad();
  }
  return {
    binding,
    manifest: {
      bodyRevision: m.bodyRevision,
      bytes: m.bytes,
      chunkCount: m.chunkCount,
      sha256: m.sha256,
    },
    scope: binding.layout === 'legacy' ? 'legacy' : binding.generationId,
  };
}
