import { createHash } from 'node:crypto';
import { GenerationError } from './generation.mjs';
import { universeDocumentId } from './universes.mjs';
import { DEFAULT_PERSONAS, validatePersona, resolveWritingPersona } from './personaProfile.mjs';
import { readAvailablePersonaMetadata } from './personaAvailability.mjs';

const fail = () => {
  const error = new GenerationError(
    'failed-precondition',
    'O universo ou a persona mudou. Revise o contexto antes de continuar.',
  );
  error.details = { reason: 'creation-context-changed' };
  throw error;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const native = (snapshot) => {
  const stamp = snapshot.createTime;
  if (!Number.isSafeInteger(stamp?.seconds) || !Number.isSafeInteger(stamp?.nanoseconds)) fail();
  return { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
};
export function creationContextInput(data) {
  if (
    !['book', 'adventure', 'campaign'].includes(data.kind) ||
    !['manual', 'assisted'].includes(data.method)
  )
    throw new GenerationError('invalid-argument', 'Escolha o tipo e a forma de criação.');
  const universeId = data.universeId == null ? null : universeDocumentId(data.universeId);
  const personaId = data.personaId ?? null;
  if (
    personaId !== null &&
    (typeof personaId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(personaId))
  )
    throw new GenerationError('invalid-argument', 'Persona inválida.');
  return { flowVersion: 2, kind: data.kind, method: data.method, universeId, personaId };
}
/** Revalidate original identities before and after provider I/O and inside activation. */
export async function readCreationContext(tx, db, uid, setup, expected) {
  let world = null,
    persona = null;
  const proof = { universe: null, persona: null };
  if (setup.universeId) {
    const snapshot = await tx.get(db.doc('universes/' + setup.universeId));
    const value = snapshot.data();
    if (!value || value.authorId !== uid || value.deleting) fail();
    proof.universe = {
      id: setup.universeId,
      birth: native(snapshot),
      revision: value.loreVersion ?? 0,
      privacy: value.privacyVersion ?? 0,
      name: value.name,
      description: value.description ?? '',
    };
    if (!Number.isSafeInteger(value.loreVersion ?? 0) || (value.loreVersion ?? 0) < 0) fail();
    const lore = await tx.get(
      db
        .collection('universes/' + setup.universeId + '/lore')
        .orderBy('__name__')
        .limit(12)
        .select('name', 'summary', 'deleted', 'deleting'),
    );
    world = {
      name: value.name,
      description: (value.description ?? '').slice(0, 4000),
      lore: lore.docs
        .map((doc) => doc.data())
        .filter((entry) => !entry.deleted && !entry.deleting && typeof entry.name === 'string')
        .map((entry) => ({
          name: entry.name.slice(0, 200),
          summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 140) : '',
        })),
    };
  }
  if (setup.personaId) {
    const preset = DEFAULT_PERSONAS.find((p) => p.id === setup.personaId);
    if (preset) {
      persona = validatePersona(preset);
      proof.persona = hash(persona);
    } else {
      const snapshot = await readAvailablePersonaMetadata(tx, db, uid, setup.personaId, [
        'id',
        'schemaVersion',
        'revision',
        'archived',
      ]);
      const value = snapshot?.data();
      if (!value || value.archived || value.id !== setup.personaId) fail();
      const full = await tx.get(db.doc(`users/${uid}/aiPersonas/${setup.personaId}`));
      try {
        persona = validatePersona(full.data());
      } catch {
        fail();
      }
      if (persona.archived || persona.revision !== value.revision) fail();
      proof.persona = { birth: native(snapshot), profileHash: hash(persona) };
    }
  }
  const digest = hash(proof);
  if (expected !== undefined && expected !== digest) fail();
  return {
    proof: digest,
    content: {
      universe: world,
      persona: persona ? resolveWritingPersona([persona], persona.id, null).instruction : null,
    },
  };
}
