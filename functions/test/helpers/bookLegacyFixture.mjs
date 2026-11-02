import { createHash } from 'node:crypto';
import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
const digest = (v) => createHash('sha256').update(v).digest('hex');
export function bookLegacyFixture(version) {
  const book = {
    id: '\ufeffbook',
    title: 'Own title',
    status: 'published',
    coverUrl: 'https://example.invalid/cover?token=PRIVATE_TOKEN',
  };
  const chapter = { id: 'chapter', title: 'Chapter', order: 1, content: '', updatedAt: 2 };
  const lore = {
    id: 'entity',
    name: 'Own lore',
    category: 'character',
    details: 'Own prose',
    relations: [],
  };
  const value = { format: 'writer-book-backup', version, book, chapters: [chapter], lore: [lore] };
  if (version >= 2) {
    book.universeId = 'world';
    value.universe = {
      id: 'world',
      name: 'GLOBAL NAME MUST NOT COPY',
      description: 'GLOBAL PROSE MUST NOT COPY',
      lore: [
        {
          id: 'global',
          details: 'GLOBAL BODY MUST NOT COPY',
          relations: [{ available: true, name: 'GLOBAL LABEL' }],
        },
      ],
    };
  }
  if (version >= 3) {
    book.personaId = DEFAULT_PERSONAS[0].id;
    value.personas = [structuredClone(DEFAULT_PERSONAS[0])];
  }
  if (version >= 4) {
    value.acts = [{ id: 'act', name: null, order: 1 }];
    chapter.actId = 'act';
  }
  if (version >= 5) {
    chapter.contentMode = 'scenes';
    chapter.assemblyRevision = 1;
    chapter.structureRevision = 1;
    chapter.content = '<p>Rendered scene 🌙</p>';
    const content = '\ufeffCanonical scene 🌙';
    value.scenes = {
      schemaVersion: 1,
      projectRevision: 9,
      groups: [
        {
          id: 'chapter',
          title: 'Chapter',
          kind: 'chapter',
          contentMode: 'scenes',
          assemblyRevision: 1,
          structureRevision: 1,
          wordCount: 3,
          sceneCount: 1,
          rankSlot: 'B',
          order: 1,
          updatedAt: 2,
          actId: 'act',
        },
      ],
      scenes: [
        {
          id: 'scene',
          schemaVersion: 1,
          revision: 2,
          title: 'Scene',
          parentId: 'chapter',
          stage: 'planned',
          archived: false,
          rank: 'V',
          wordCount: 3,
          bodyHash: digest(content),
          bodyBytes: Buffer.byteLength(content),
          createdAt: 1,
          updatedAt: 2,
          content,
          planning: { objective: '', conflict: '', pointOfView: '' },
          references: [
            {
              id: 'ref',
              reference: { kind: 'universe', scopeId: 'world', entityId: 'global' },
              available: false,
              name: 'PRIVATE RESOLVED NAME',
            },
          ],
        },
      ],
      sources: [
        {
          id: 'chapter',
          content: 'Original',
          hash: digest('Original'),
          original: {
            title: 'Before',
            order: 1,
            wordCount: 1,
            personaComplement: { personaId: 'missing-source-style', overrides: [] },
          },
        },
      ],
    };
  }
  if (version >= 6) {
    const base = {
      schemaVersion: 1,
      revision: 1,
      title: 'Narrative',
      rank: 'V',
      createdAt: 1,
      updatedAt: 2,
    };
    value.narrative = {
      schemaVersion: 1,
      projectRevision: 8,
      sceneRevision: 9,
      arcs: [
        {
          ...base,
          id: 'arc',
          kind: 'arc',
          initialState: '',
          objective: '',
          plannedOutcome: '',
          references: [{ kind: 'scene', sceneId: 'scene' }],
        },
      ],
      milestones: [
        {
          ...base,
          id: 'milestone',
          kind: 'milestone',
          arcId: 'arc',
          notes: 'Own notes',
          references: [],
        },
      ],
      events: [
        {
          ...base,
          id: 'event',
          kind: 'event',
          description: 'Own event',
          dateLabel: '3º dia do inverno',
          references: [],
        },
      ],
    };
  }
  return value;
}
