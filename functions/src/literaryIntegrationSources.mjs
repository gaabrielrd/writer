import {
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { readBookChapterText } from './bookChapterText.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { literaryProseText } from './literaryAIContext.mjs';

const stamp = (snapshot) => {
  const born = snapshot.createTime,
    changed = snapshot.updateTime;
  if (
    !snapshot.exists ||
    !Number.isSafeInteger(born?.seconds) ||
    !Number.isSafeInteger(born?.nanoseconds) ||
    !Number.isSafeInteger(changed?.seconds) ||
    !Number.isSafeInteger(changed?.nanoseconds)
  )
    workFail('failed-precondition', 'A identidade da fonte de integração não pôde ser conferida.');
  return {
    born: [born.seconds, born.nanoseconds],
    changed: [changed.seconds, changed.nanoseconds],
  };
};
const chapterFields = [
  'ownerId',
  'bookId',
  'title',
  'order',
  'actId',
  'deleting',
  'contentMode',
  'rankSlot',
  'assemblyRevision',
  'structureRevision',
];
function position(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'Há uma posição inválida no manuscrito.');
  return value;
}
function title(value) {
  if (typeof value !== 'string' || value.length > 300)
    workFail('failed-precondition', 'Há um título inválido no manuscrito.');
  return value;
}
export async function readLiteraryIntegrationFence(tx, c) {
  const root = await workProject(tx, c),
    book = await tx.get(c.ref);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'A integração exige um livro.');
  // The collection scan uses this conservative fence. It is not a manuscript hash
  // and must never by itself prove that the complete text was read.
  const fence = {
    domain: 'literary-integration-fence-v1',
    uid: c.uid,
    target: c.target,
    birth: stamp(book).born,
    updatedAt: root.updatedAt ?? 0,
    sceneRevision: root.sceneRevision ?? 0,
    narrativeRevision: root.narrativeRevision ?? 0,
    literaryContextRevision: root.literaryContextRevision ?? 0,
    localLoreVersion: root.localLoreVersion ?? 0,
    loreVersion: root.loreVersion ?? 0,
    universeId: root.universeId ?? null,
  };
  let world = null;
  if (root.universeId) {
    const snapshot = await readWorkMetadata(tx, c.db.doc('universes/' + workId(root.universeId)), [
      'authorId',
      'deleting',
    ]);
    if (!snapshot.exists || snapshot.data().authorId !== c.uid || snapshot.data().deleting)
      workFail('permission-denied', 'O universo vinculado não está disponível.');
    world = stamp(snapshot);
  }
  return { root, token: digest({ ...fence, world }) };
}
export async function readLiteraryIntegrationChapter(tx, c, chapterId) {
  await workProject(tx, c);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'A integração exige um livro.');
  const book = await readWorkMetadata(tx, c.ref, []);
  const id = workId(chapterId),
    snapshot = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + id), chapterFields);
  const value = snapshot.data();
  if (
    !value ||
    value.deleting ||
    (value.bookId && value.bookId !== c.target.id) ||
    (value.ownerId != null && value.ownerId !== c.uid)
  )
    workFail('not-found', 'Um capítulo da integração não está disponível.');
  if (value.contentMode != null && !['legacy', 'scenes'].includes(value.contentMode))
    workFail('failed-precondition', 'O formato do capítulo não é reconhecido.');
  let act = null;
  if (value.actId) {
    const ref = c.db.doc(c.path + '/acts/' + workId(value.actId));
    const row = await readWorkMetadata(tx, ref, ['name', 'order', 'deleting']);
    if (row.exists) {
      if (row.data().deleting) workFail('failed-precondition', 'Um ato está sendo removido.');
      act = {
        id: value.actId,
        name: row.data().name ?? null,
        order: position(row.data().order),
        stamp: stamp(row),
      };
    }
    // Native grouping preserves dangling links in the unassigned group.
  }
  const token = digest({
    domain: 'literary-integration-chapter-v1',
    chapterId: id,
    stamp: stamp(snapshot),
    act,
    title: title(value.title),
    order: position(value.order),
    mode: value.contentMode ?? 'legacy',
    assemblyRevision: value.assemblyRevision ?? 0,
    structureRevision: value.structureRevision ?? 0,
  });
  const identityToken = digest({
    domain: 'literary-integration-origin-v1',
    uid: c.uid,
    target: c.target,
    book: stamp(book).born,
    chapterId: id,
    chapter: stamp(snapshot).born,
  });
  return {
    id,
    identityToken,
    title: value.title,
    order: value.order,
    actId: act?.id ?? null,
    actOrder: act?.order ?? null,
    token,
    mode: value.contentMode === 'scenes' ? 'scenes' : 'legacy',
    slot: value.rankSlot === 'B' ? 'rankB' : 'rankA',
  };
}
export async function listLiteraryIntegrationChapters(
  tx,
  c,
  { level, actId = null, afterId = null },
) {
  await workProject(tx, c);
  if (
    !['act', 'book'].includes(level) ||
    (level === 'act' && !actId) ||
    (level === 'book' && actId !== null)
  )
    workFail('invalid-argument', 'Escolha ato ou livro para integrar.');
  if (level === 'act') {
    const row = await readWorkMetadata(tx, c.db.doc(c.path + '/acts/' + workId(actId)), [
      'deleting',
    ]);
    if (!row.exists || row.data().deleting) workFail('not-found', 'Ato indisponível.');
  }
  let query = c.db
    .collection(c.path + '/chapters')
    .orderBy('__name__')
    .limit(25)
    .select();
  if (afterId !== null) query = query.startAfter(workId(afterId));
  const page = await tx.get(query),
    items = [];
  for (const row of page.docs) {
    const chapter = await readLiteraryIntegrationChapter(tx, c, row.id);
    if (level === 'book' || chapter.actId === actId) items.push(chapter);
  }
  return { items, nextAfterId: page.docs.length === 25 ? page.docs.at(-1).id : null };
}
export function orderLiteraryIntegrationChapters(chapters) {
  const seen = new Set();
  for (const chapter of chapters) {
    if (seen.has(chapter.id)) workFail('failed-precondition', 'Capítulo repetido na integração.');
    seen.add(chapter.id);
    position(chapter.order);
    if (chapter.actOrder !== null) position(chapter.actOrder);
  }
  // Match groupChapters: ordered acts followed by unassigned chapters.
  return [...chapters].sort((a, b) => {
    if (a.actOrder === null && b.actOrder !== null) return 1;
    if (a.actOrder !== null && b.actOrder === null) return -1;
    return (
      (a.actOrder ?? 0) - (b.actOrder ?? 0) ||
      (a.actId ?? '').localeCompare(b.actId ?? '') ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    );
  });
}
export async function listLiteraryIntegrationUnits(
  tx,
  c,
  { chapterId, chapterToken, after = null },
) {
  const chapter = await readLiteraryIntegrationChapter(tx, c, chapterId);
  if (chapter.token !== chapterToken)
    workFail('failed-precondition', 'O capítulo mudou durante a integração.');
  if (chapter.mode === 'legacy') {
    if (after !== null)
      workFail('invalid-argument', 'Um capítulo legado é uma única fonte de texto.');
    return {
      items: [
        {
          chapterId: chapter.id,
          chapterToken: chapter.token,
          resource: { kind: 'chapter', id: chapter.id },
          title: chapter.title,
          rank: null,
          token: digest({ chapterToken: chapter.token, kind: 'chapter' }),
        },
      ],
      nextAfter: null,
    };
  }
  let query = c.db
    .collection(c.path + '/scenes')
    .where('parentId', '==', chapter.id)
    .where('archived', '==', false)
    .orderBy(chapter.slot)
    .orderBy('__name__')
    .limit(20)
    .select(
      'ownerId',
      'parentId',
      'archived',
      'deleting',
      'title',
      'bodyHash',
      'revision',
      chapter.slot,
    );
  if (after !== null) {
    if (typeof after.rank !== 'string' || !after.rank)
      workFail('invalid-argument', 'Posição de cena inválida.');
    query = query.startAfter(after.rank, workId(after.id));
  }
  const page = await tx.get(query),
    items = [];
  for (const row of page.docs) {
    const value = row.data();
    if (
      value.ownerId !== c.uid ||
      value.parentId !== chapter.id ||
      value.archived !== false ||
      value.deleting ||
      typeof value[chapter.slot] !== 'string' ||
      !value[chapter.slot]
    )
      workFail('permission-denied', 'Uma cena não pertence à composição autorizada.');
    items.push({
      chapterId: chapter.id,
      chapterToken: chapter.token,
      resource: { kind: 'scene', id: row.id },
      title: title(value.title),
      rank: value[chapter.slot],
      token: digest({
        chapterToken: chapter.token,
        sceneId: row.id,
        stamp: stamp(row),
        bodyHash: value.bodyHash,
        revision: value.revision,
      }),
    });
  }
  const last = page.docs.at(-1);
  return {
    items,
    nextAfter: page.docs.length === 20 ? { rank: last.data()[chapter.slot], id: last.id } : null,
  };
}
// The canonical metadata origin of a unit, without opening manuscript bytes.
// The caller decides whether a captured version must still match.
export async function readLiteraryIntegrationUnitMetadata(tx, c, unit) {
  const chapter = await readLiteraryIntegrationChapter(tx, c, unit.chapterId);
  let token, identityToken;
  if (unit.resource.kind === 'chapter') {
    if (chapter.mode !== 'legacy' || unit.resource.id !== chapter.id)
      workFail('failed-precondition', 'A fonte não corresponde ao capítulo legado.');
    token = digest({ chapterToken: chapter.token, kind: 'chapter' });
    identityToken = digest({ chapterIdentity: chapter.identityToken, kind: 'chapter' });
  } else if (unit.resource.kind === 'scene') {
    if (chapter.mode !== 'scenes')
      workFail('failed-precondition', 'A fonte deixou de ser uma composição de cenas.');
    const row = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/scenes/' + workId(unit.resource.id)),
      [
        'ownerId',
        'parentId',
        'archived',
        'deleting',
        'title',
        'bodyHash',
        'revision',
        chapter.slot,
      ],
    );
    const value = row.data();
    if (
      !value ||
      value.ownerId !== c.uid ||
      value.parentId !== chapter.id ||
      value.archived ||
      value.deleting
    )
      workFail('permission-denied', 'A cena foi retirada da composição.');
    identityToken = digest({
      chapterIdentity: chapter.identityToken,
      sceneId: row.id,
      birth: stamp(row).born,
    });
    token = digest({
      chapterToken: chapter.token,
      sceneId: row.id,
      stamp: stamp(row),
      bodyHash: value.bodyHash,
      revision: value.revision,
    });
  } else workFail('invalid-argument', 'Fonte de integração inválida.');
  return { chapter, token, identityToken };
}
export async function readLiteraryIntegrationMarkup(tx, c, unit) {
  const {
    chapter,
    token: unitToken,
    identityToken,
  } = await readLiteraryIntegrationUnitMetadata(tx, c, unit);
  if (chapter.token !== unit.chapterToken)
    workFail('failed-precondition', 'A composição do capítulo mudou.');
  if (unitToken !== unit.token)
    workFail('failed-precondition', 'A fonte mudou desde o planejamento da leitura.');
  let html;
  if (unit.resource.kind === 'chapter') {
    const stored = (await tx.get(c.db.doc(c.path + '/chapters/' + chapter.id))).data();
    html = await readBookChapterText(tx, c.db, {
      uid: c.uid,
      bookId: c.target.id,
      chapterId: chapter.id,
      chapter: stored,
    });
  } else {
    const source = await readHistorySource(tx, c.db, c, unit.resource);
    if (!source) workFail('failed-precondition', 'O corpo canônico da cena não está disponível.');
    html = source.source.content;
  }
  return {
    id: 'manuscript:' + chapter.id + ':' + unit.resource.kind + ':' + unit.resource.id,
    chapterId: chapter.id,
    resource: unit.resource,
    label: chapter.title + ' · ' + unit.title,
    token: unitToken,
    identityToken,
    contentHash: digest(html),
    html,
  };
}
export async function readLiteraryIntegrationUnit(tx, c, unit) {
  const { html, ...source } = await readLiteraryIntegrationMarkup(tx, c, unit),
    text = literaryProseText(html);
  if (!text.trim())
    workFail(
      'failed-precondition',
      'Há uma unidade sem prosa; não é possível afirmar leitura integral.',
    );
  return { ...source, text };
}
