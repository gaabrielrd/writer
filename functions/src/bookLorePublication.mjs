import {
  loreReadScope,
  readLoreBook,
  loreReadId,
  loreReadToken,
  matchesLoreEntityToken,
} from './bookLoreReadContracts.mjs';
import { createBookLoreContextReader } from './bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from './bookLoreTextProjection.mjs';
import { born, closed, integer } from './bookRestoreUploadContracts.mjs';
import { digest, workFail, readWorkMetadata } from './workProgressContracts.mjs';
export const BOOK_PUBLICATION_METHODS = Object.freeze([
  'getBookPublicationSource',
  'stageBookPublicationLore',
  'finalizeBookPublication',
]);
import { publicationCandidate } from './bookLorePublicationValidation.mjs';
import { inspectionPaths, inspectionRequest } from './bookLoreSourceInspectionContracts.mjs';
import { openBookLoreSourceInspection } from './bookLoreSourceInspectionStore.mjs';
const conflict = () =>
  workFail(
    'failed-precondition',
    'A origem mudou durante a publicação. Atualize e tente novamente.',
    'book-publication-changed',
  );
const invalid = () => workFail('invalid-argument', 'Publicação inválida.');
const equal = (a, b) => digest(a) === digest(b);
function text(value, maximum) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    !value.trim() ||
    value.trim().length > maximum
  )
    invalid();
  return value.trim();
}
const rootFields = [
  'authorId',
  'deleting',
  'title',
  'status',
  'updatedAt',
  'localLoreVersion',
  'publicationPrivacyVersion',
  'hasSceneResources',
  'sceneRevision',
  'universeId',
];
async function source(tx, db, c) {
  const book = await readLoreBook(tx, c),
    snapshot = await readWorkMetadata(tx, c.db.doc(c.path), rootFields),
    p = snapshot.data();
  if (!['draft', 'published'].includes(p.status)) conflict();
  let world = null,
    worldSnapshot = null,
    publicationPrivacy = null;
  const universeId = p.universeId ?? null;
  if (universeId !== null) {
    loreReadId(universeId);
    worldSnapshot = await readWorkMetadata(tx, db.doc('universes/' + universeId), [
      'authorId',
      'deleting',
      'loreVersion',
      'privacyVersion',
    ]);
    world = worldSnapshot.data();
    if (!world || world.authorId !== c.uid || world.deleting) conflict();
    const privacy = await readWorkMetadata(tx, db.doc('publicUniversePrivacy/' + universeId), [
      'active',
      'version',
    ]);
    if (
      !privacy.exists ||
      privacy.data().active !== true ||
      privacy.data().version !== world.privacyVersion
    )
      conflict();
    publicationPrivacy = digest({
      birth: born(privacy),
      updated: born({ createTime: privacy.updateTime }),
      value: privacy.data(),
    });
  }
  const proof = {
    schemaVersion: 1,
    bookId: c.bookId,
    bookToken: digest({
      domain: 'book-publication-origin',
      uid: c.uid,
      bookId: c.bookId,
      birth: born(snapshot),
    }),
    listToken: book.listToken,
    bookStamp: born({ createTime: snapshot.updateTime }),
    updatedAt: p.updatedAt ?? 0,
    status: p.status,
    privacyVersion: p.publicationPrivacyVersion ?? 0,
    hasScenes: p.hasSceneResources === true,
    sceneRevision: p.sceneRevision ?? 0,
    universeId,
    universeToken: worldSnapshot
      ? digest({
          domain: 'book-publication-universe',
          uid: c.uid,
          id: universeId,
          birth: born(worldSnapshot),
        })
      : null,
    universeStamp: worldSnapshot ? born({ createTime: worldSnapshot.updateTime }) : null,
    universePublicationToken: publicationPrivacy,
    universeLoreVersion: world?.loreVersion ?? null,
    universePrivacyVersion: world?.privacyVersion ?? null,
  };
  validateProof(proof, c.bookId);
  return { book, p, proof, sourceToken: digest(proof) };
}
function validateProof(value, bookId) {
  closed(value, [
    'schemaVersion',
    'bookId',
    'bookToken',
    'listToken',
    'bookStamp',
    'updatedAt',
    'status',
    'privacyVersion',
    'hasScenes',
    'sceneRevision',
    'universeId',
    'universeToken',
    'universeStamp',
    'universePublicationToken',
    'universeLoreVersion',
    'universePrivacyVersion',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.bookId !== bookId ||
    !['draft', 'published'].includes(value.status) ||
    typeof value.hasScenes !== 'boolean'
  )
    invalid();
  for (const key of ['bookToken', 'listToken']) loreReadToken(value[key]);
  stamp(value.bookStamp);
  for (const key of ['updatedAt', 'privacyVersion', 'sceneRevision']) integer(value[key]);
  if (value.universeId === null) {
    if (
      [
        'universeToken',
        'universeStamp',
        'universePublicationToken',
        'universeLoreVersion',
        'universePrivacyVersion',
      ].some((k) => value[k] !== null)
    )
      invalid();
  } else {
    loreReadId(value.universeId);
    if (value.universeId.length > 128) invalid();
    loreReadToken(value.universeToken);
    loreReadToken(value.universePublicationToken);
    stamp(value.universeStamp);
    integer(value.universeLoreVersion);
    integer(value.universePrivacyVersion);
  }
}
function stamp(value) {
  closed(value, ['seconds', 'nanoseconds']);
  born({ createTime: value });
}
function revision(value, proof, token) {
  if (!value) conflict();
  closed(
    value,
    [
      'createdAt',
      'chapterCount',
      'loreCount',
      'privacyVersion',
      'sourceLoreToken',
      'sourcePublicationToken',
    ],
    ['actCount', 'sourceSceneRevision', 'universeId', 'universePrivacyVersion'],
  );
  for (const key of ['createdAt', 'chapterCount', 'loreCount', 'privacyVersion'])
    integer(value[key]);
  if (Object.hasOwn(value, 'actCount')) integer(value.actCount);
  if (
    value.createdAt < proof.updatedAt ||
    value.sourceLoreToken !== proof.listToken ||
    value.sourcePublicationToken !== token ||
    value.privacyVersion !== proof.privacyVersion ||
    (value.sourceSceneRevision ?? null) !== (proof.hasScenes ? proof.sceneRevision : null) ||
    (value.universeId ?? null) !== proof.universeId ||
    (value.universePrivacyVersion ?? null) !== proof.universePrivacyVersion
  )
    conflict();
}
function control(db, uid, data, extra) {
  const c = loreReadScope(db, uid, data, ['revisionId', 'source', 'sourceToken', ...extra]);
  c.revisionId = loreReadId(data.revisionId);
  if (c.revisionId.length > 128) invalid();
  validateProof(data.source, c.bookId);
  loreReadToken(data.sourceToken);
  if (digest(data.source) !== data.sourceToken) invalid();
  c.revisionRef = db.doc('publicBooks/' + c.bookId + '/revisions/' + c.revisionId);
  c.publicRef = db.doc('publicBooks/' + c.bookId);
  return c;
}
function sameOrigins(current, previous) {
  return (
    current.bookToken === previous.bookToken &&
    current.listToken === previous.listToken &&
    current.privacyVersion === previous.privacyVersion &&
    current.hasScenes === previous.hasScenes &&
    current.sceneRevision === previous.sceneRevision &&
    current.universeId === previous.universeId &&
    current.universeToken === previous.universeToken &&
    equal(current.universeStamp, previous.universeStamp) &&
    current.universePublicationToken === previous.universePublicationToken &&
    current.universeLoreVersion === previous.universeLoreVersion &&
    current.universePrivacyVersion === previous.universePrivacyVersion
  );
}
export function setBookPublicationHeaders(method, request) {
  if (!BOOK_PUBLICATION_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
export function createBookPublicationService({ db }) {
  return {
    async getBookPublicationSource(uid, data) {
      const c = loreReadScope(db, uid, data, []);
      return db.runTransaction(async (tx) => {
        const value = await source(tx, db, c);
        return { source: value.proof, sourceToken: value.sourceToken };
      });
    },
    async stageBookPublicationLore(uid, data) {
      const certified =
          Object.hasOwn(data ?? {}, 'inspection') || Object.hasOwn(data ?? {}, 'publication'),
        c = control(db, uid, data, [
          'loreId',
          'readToken',
          'aliases',
          ...(certified ? ['inspection', 'publication'] : []),
        ]),
        loreId = loreReadId(data.loreId),
        candidate = certified ? publicationCandidate(data.publication) : null;
      if (certified) closed(data.inspection, ['inspectionId', 'startHash', 'jobToken']);
      loreReadToken(data.readToken);
      if (
        !Array.isArray(data.aliases) ||
        data.aliases.length > 20 ||
        data.aliases.some((v) => typeof v !== 'string' || !v.isWellFormed() || v.length > 200)
      )
        invalid();
      return db.runTransaction(async (tx) => {
        const current = await source(tx, db, c);
        if (current.sourceToken !== data.sourceToken) conflict();
        const header = (await tx.get(c.revisionRef)).data();
        revision(header, current.proof, data.sourceToken);
        const head = await tx.get(db.doc(c.path + '/lore/' + loreId));
        if (!head.exists || !matchesLoreEntityToken(c, current.book, head, data.readToken))
          conflict();
        let projected;
        if (certified) {
          const r = inspectionRequest(uid, data.inspection),
            inspected = await openBookLoreSourceInspection(
              tx,
              inspectionPaths(db, uid, r.inspectionId),
              r,
            ),
            context = inspected.loaded.job.context;
          if (
            context.bookId !== c.bookId ||
            context.loreId !== loreId ||
            context.sourceToken !== data.readToken ||
            context.publicationHash !== digest(candidate)
          )
            conflict();
          projected = {
            privacy: inspected.metadata.isPublic,
            fields: {
              name: { value: candidate.name },
              category: { value: candidate.category },
              summary: { value: candidate.summary, truncated: false },
              aliases: {
                value: candidate.aliases,
                count: candidate.aliases.length,
                truncated: false,
              },
            },
          };
        } else {
          const reader = await createBookLoreContextReader(tx, db, uid, c.bookId);
          projected = await reader.read(
            loreId,
            { name: null, category: null, summary: 141, aliases: { items: 21, characters: 201 } },
            createBookLoreProjectionBudget({
              bytes: 32 * 1024 * 1024,
              parts: 512,
              retainedBytes: 900000,
            }),
          );
        }
        const fields = projected.fields;
        if (!projected.privacy.present || projected.privacy.value !== true)
          workFail('permission-denied', 'Esta ficha não tem consentimento público.');
        if (
          !fields.aliases ||
          fields.aliases.count > 20 ||
          fields.aliases.truncated ||
          fields.aliases.value.some((v) => v.length > 200) ||
          !fields.summary ||
          fields.summary.truncated ||
          fields.summary.value.length > 140
        )
          invalid();
        let offset = 0;
        for (const alias of data.aliases) {
          const index = fields.aliases.value.indexOf(alias, offset);
          if (index < 0) invalid();
          offset = index + 1;
        }
        const projection = {
            name: text(fields.name.value, 200),
            aliases: [...data.aliases],
            category: fields.category.value,
            summary: fields.summary.value,
          },
          ref = db.doc(c.revisionRef.path + '/lore/' + loreId),
          existing = await tx.get(ref),
          live = await tx.get(c.publicRef);
        if (existing.exists) {
          if (!equal(existing.data(), projection)) conflict();
          return { bookId: c.bookId, revisionId: c.revisionId, loreId, status: 'already-staged' };
        }
        if (live.data()?.revisionId === c.revisionId) conflict();
        tx.create(ref, projection);
        return { bookId: c.bookId, revisionId: c.revisionId, loreId, status: 'staged' };
      });
    },
    async finalizeBookPublication(uid, data) {
      const c = control(db, uid, data, ['authorName']),
        authorName = text(data.authorName, 120);
      return db.runTransaction(async (tx) => {
        const current = await source(tx, db, c),
          header = (await tx.get(c.revisionRef)).data(),
          live = await tx.get(c.publicRef);
        revision(header, data.source, data.sourceToken);
        const projection = {
          schemaVersion: data.source.universeId ? 2 : 1,
          ...(header.actCount ? { hasActs: true } : {}),
          title: text(current.p.title, 300),
          authorName,
          revisionId: c.revisionId,
          publishedAt: header.createdAt,
          ...(data.source.universeId
            ? {
                universeId: data.source.universeId,
                universePrivacyVersion: data.source.universePrivacyVersion,
              }
            : {}),
          ...(data.source.hasScenes ? { sourceSceneRevision: data.source.sceneRevision } : {}),
          sourcePublicationToken: data.sourceToken,
        };
        if (live.data()?.revisionId === c.revisionId) {
          if (
            current.p.status !== 'published' ||
            !sameOrigins(current.proof, data.source) ||
            !equal(live.data(), projection)
          )
            conflict();
          return {
            bookId: c.bookId,
            revisionId: c.revisionId,
            publishedAt: header.createdAt,
            status: 'already-published',
          };
        }
        if (current.sourceToken !== data.sourceToken) conflict();
        tx.set(c.publicRef, projection);
        tx.update(db.doc(c.path), { status: 'published', updatedAt: header.createdAt });
        return {
          bookId: c.bookId,
          revisionId: c.revisionId,
          publishedAt: header.createdAt,
          status: 'published',
        };
      });
    },
  };
}
