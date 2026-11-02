import { structureRestoreFixture } from './bookRestoreStructureFixture.mjs';
import { persona, record, address } from './bookContentFixture.mjs';
import { readyRestoreCounts, finishRestoreCounts } from './bookRestoreCountsFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export function personasRestoreFixture({ extraProfiles = 0 } = {}) {
  const records = structureRestoreFixture(),
    shared = {
      ...structuredClone(persona),
      name: '  Shared writing  ',
      description: '  Exact description  ',
      instructions: '\ufeff  Keep original\nLiteral style  ',
      revision: 17,
      createdAt: 3,
      updatedAt: 7,
    },
    archived = {
      ...structuredClone(persona),
      id: 'custom-archived-copy',
      name: 'Archived writing',
      instructions: 'Archived original',
      archived: true,
      revision: 23,
      createdAt: 4,
      updatedAt: 8,
    };
  const newBindings = [];
  for (let at = 0; at < records.length; at++) {
    const r = records[at];
    if (r.kind === 'chapter') {
      const value = JSON.parse(new TextDecoder().decode(r.payload)),
        p = r.id === 'chapter' ? shared : archived;
      value.personaComplement = { personaId: p.id, overrides: [{ traitId: 'sensory', value: 77 }] };
      records[at] = record('chapter', r.id, value);
      newBindings.push(
        record('book-persona', address(['chapter', r.id]), {
          schemaVersion: 1,
          scope: 'chapter',
          ownerId: r.id,
          personaId: p.id,
          profile: structuredClone(p),
        }),
      );
    } else if (r.kind === 'book-persona') {
      const value = JSON.parse(new TextDecoder().decode(r.payload));
      value.profile = structuredClone(shared);
      records[at] = record('book-persona', r.id, value);
    }
  }
  const firstResource = records.findIndex((r) => r.kind === 'book-lore'),
    extras = [];
  for (let i = 0; i < extraProfiles; i++) {
    const id = 'extra-chapter-' + i,
      p = { ...structuredClone(shared), id: 'custom-extra-' + i };
    extras.push(
      record('chapter', id, {
        title: 'Extra ' + i,
        order: i + 3,
        content: '',
        personaComplement: { personaId: p.id, overrides: [] },
      }),
    );
    newBindings.push(
      record('book-persona', address(['chapter', id]), {
        schemaVersion: 1,
        scope: 'chapter',
        ownerId: id,
        personaId: p.id,
        profile: p,
      }),
    );
  }
  records.splice(firstResource, 0, ...extras);
  const at = records.findIndex((r) => r.kind === 'book-personas'),
    manifest = JSON.parse(new TextDecoder().decode(records[at].payload));
  manifest.owners.chapter += extraProfiles;
  manifest.bindings.chapter = 2 + extraProfiles;
  records[at] = record('book-personas', 'book', manifest);
  records.splice(at, 0, ...newBindings);
  return { records, shared, archived };
}
export async function readyRestorePersonas(
  factory,
  uid,
  id,
  records = personasRestoreFixture().records,
) {
  const p = await readyRestoreCounts(factory, uid, id, records);
  return finishRestoreCounts(factory, uid, id, p);
}
export async function finishRestorePersonas(
  factory,
  uid,
  id,
  progress,
  prefix = id + '-personas-',
) {
  let unit = 0;
  while (progress.preparation.phase !== 'universe') {
    if (unit > 1000) throw new Error('Personas did not finish');
    progress = (
      await factory().advanceBookRestorePersonas(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}

export function personasWithDraftFixture({ exclusive = true } = {}) {
  const fixture = personasRestoreFixture(),
    { records, shared } = fixture,
    profile = exclusive
      ? {
          ...structuredClone(shared),
          id: 'custom-draft-exclusive',
          name: 'Draft only',
          instructions: '\ufeff  Draft exact\nOnly here  ',
        }
      : structuredClone(shared),
    at = records.findIndex((r) => r.kind === 'book-draft'),
    value = JSON.parse(new TextDecoder().decode(records[at].payload));
  value.chapter.personaComplement = { personaId: profile.id, overrides: [] };
  value.persona = profile;
  records[at] = record('book-draft', 'book', value);
  return { ...fixture, profile };
}
