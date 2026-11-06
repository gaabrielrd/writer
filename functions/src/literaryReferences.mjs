import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import { workFail, workScope, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  createBookLoreReferenceReader,
  createBookLoreReferenceBudget,
} from './bookLoreReferenceRead.mjs';

const collections = {
  act: 'acts',
  chapter: 'chapters',
  scene: 'scenes',
  arc: 'arcs',
  event: 'timelineEvents',
  localLore: 'lore',
};
export const literaryReferenceCollection = (context, root, kind) => {
  if (kind === 'globalLore')
    return root.universeId ? 'universes/' + root.universeId + '/lore' : null;
  const collection = collections[kind];
  return collection ? context.path + '/' + collection : null;
};
function birth(snapshot) {
  const value = snapshot.createTime;
  if (!Number.isSafeInteger(value?.seconds) || !Number.isSafeInteger(value?.nanoseconds))
    workFail('failed-precondition', 'Identidade nativa da referência indisponível.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export async function createLiteraryReferenceReader(tx, context, root) {
  let localReader;
  const budget = createBookLoreReferenceBudget();
  return async (reference, labels = false) => {
    const { kind, id } = reference;
    if (kind === 'volumeUnit') {
      let origin;
      try {
        origin = validateLiteraryVolumeReference(reference);
      } catch {
        return null;
      }
      if (origin.bookId === context.target.id) return null;
      const sourceContext = workScope(
        context.db,
        context.uid,
        { target: { kind: 'book', id: origin.bookId } },
        [],
      );
      const book = await readWorkMetadata(tx, sourceContext.ref, ['authorId', 'deleting', 'title']);
      if (!book.exists || book.data().authorId !== context.uid || book.data().deleting) return null;
      const read = await createLiteraryReferenceReader(tx, sourceContext, book.data());
      const native = await read(
        { kind: origin.kind, id: origin.id, scopeId: origin.bookId, purpose: 'source' },
        labels,
      );
      if (!native) return null;
      const identityToken = digest({
        domain: 'literary-volume-unit-origin-v1',
        origin,
        nativeIdentity: native.identityToken,
      });
      return {
        identityToken,
        versionToken: digest({ identityToken, nativeVersion: native.versionToken }),
        reference: {
          kind,
          id,
          scopeId: origin.bookId,
          sourceToken: digest({
            domain: 'literary-volume-unit-v1',
            origin,
            nativeSource: native.reference.sourceToken,
          }),
          revision: native.reference.revision,
          purpose: 'source',
        },
        label: labels
          ? (book.data().title ?? origin.bookId) +
            ' · ' +
            { act: 'Ato', chapter: 'Capítulo', scene: 'Cena', arc: 'Arco', event: 'Evento' }[
              origin.kind
            ] +
            ' · ' +
            native.label
          : null,
      };
    }
    const path = literaryReferenceCollection(context, root, kind);
    if (!path) return null;
    let value,
      snapshot,
      sourceToken,
      worldBirth = null;
    if (kind === 'localLore') {
      if (reference.scopeId != null && reference.scopeId !== context.target.id) return null;
      localReader ??= await createBookLoreReferenceReader(
        tx,
        context.db,
        context.uid,
        context.target.id,
      );
      const found = labels ? await localReader.label(id, budget) : await localReader.origin(id);
      if (!found) return null;
      ({ snapshot, sourceToken } = found);
      if (reference.purpose === 'subject') {
        const book = await readWorkMetadata(tx, context.ref, []);
        sourceToken = digest({
          domain: 'literary-subject-v1',
          ownerId: context.uid,
          bookBirth: birth(book),
          path: snapshot.ref.path,
          birth: birth(snapshot),
        });
      }
      value = { ...snapshot.data(), ...found.entity };
    } else {
      if (kind === 'globalLore') {
        if (reference.scopeId != null && reference.scopeId !== root.universeId) return null;
        const world = await readWorkMetadata(tx, context.db.doc('universes/' + root.universeId), [
          'authorId',
          'deleting',
        ]);
        if (!world.exists || world.data().authorId !== context.uid || world.data().deleting)
          return null;
        worldBirth = birth(world);
      } else if (reference.scopeId != null && reference.scopeId !== context.target.id) return null;
      snapshot = await readWorkMetadata(tx, context.db.doc(path + '/' + id), [
        'ownerId',
        'bookId',
        'deleting',
        'deleted',
        'archived',
        'revision',
        'updatedAt',
        ...(labels ? ['name', 'title'] : []),
      ]);
      value = snapshot.data();
      if (!value || value.deleting || value.deleted || value.archived) return null;
      if (value.ownerId != null && value.ownerId !== context.uid) return null;
      if (value.bookId != null && value.bookId !== context.target.id) return null;
      const book = await readWorkMetadata(tx, context.ref, []);
      sourceToken = digest({
        domain: 'literary-reference-v1',
        ownerId: context.uid,
        bookId: context.target.id,
        bookBirth: birth(book),
        worldBirth,
        kind,
        path: snapshot.ref.path,
        birth: birth(snapshot),
      });
    }
    const bookIdentity = await readWorkMetadata(tx, context.ref, []);
    const identityToken = digest({
      domain: 'literary-origin-v1',
      uid: context.uid,
      bookBirth: birth(bookIdentity),
      path: snapshot.ref.path,
      birth: birth(snapshot),
      worldBirth,
    });
    const updateTime = snapshot.updateTime;
    if (
      !Number.isSafeInteger(updateTime?.seconds) ||
      !Number.isSafeInteger(updateTime?.nanoseconds)
    )
      workFail('failed-precondition', 'Versão nativa da referência indisponível.');
    const versionToken = digest({
      identityToken,
      updated: [updateTime.seconds, updateTime.nanoseconds],
      sourceToken,
    });
    const revision = value.revision ?? value.updatedAt ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0)
      workFail('failed-precondition', 'Revisão da referência inválida.');
    return {
      identityToken,
      versionToken,
      reference: {
        kind,
        id,
        scopeId: kind === 'globalLore' ? root.universeId : context.target.id,
        sourceToken,
        revision,
        purpose: reference.purpose ?? 'source',
      },
      label: labels ? (value.name ?? value.title ?? id) : null,
    };
  };
}

// Alias scopes (null/current book or universe) identify the same source. A
// conflicting captured version must not disappear because a later plan wins
// a Map insertion. Callers enforce the operation's distinct-source budget.
export function mergeLiteraryReferences(context, root, references) {
  const selected = new Map();
  for (const value of references) {
    const reference = {
      ...value,
      scopeId:
        value.scopeId ??
        (value.kind === 'globalLore' ? (root.universeId ?? null) : context.target.id),
      purpose: value.purpose ?? 'source',
    };
    const key = JSON.stringify([
      reference.kind,
      reference.scopeId,
      reference.id,
      reference.purpose,
    ]);
    const previous = selected.get(key);
    if (
      previous &&
      (previous.sourceToken !== reference.sourceToken ||
        (reference.purpose === 'source' && previous.revision !== reference.revision))
    )
      workFail(
        'failed-precondition',
        'Dois planejamentos apontam para versões diferentes da mesma fonte. Confira os vínculos antes de gerar.',
      );
    if (!previous) selected.set(key, reference);
  }
  return [...selected.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, value]) => value);
}
