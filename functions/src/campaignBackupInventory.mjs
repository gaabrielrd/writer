import {
  campaignBackupScope,
  campaignBackupToken,
  campaignBackupIdentity,
  readCampaignBackupSource,
} from './campaignBackupSource.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { digest, workClosed, workFail, workId } from './workProgressContracts.mjs';

const invalid = () => workFail('invalid-argument', 'Inventário de campanha inválido.');
const inconsistent = () =>
  workFail(
    'failed-precondition',
    'O recurso ou seu controle de campanha está inconsistente.',
    'campaign-backup-item-inconsistent',
  );
const safe = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const validId = (value) => {
  try {
    workId(value);
  } catch {
    inconsistent();
  }
  return value;
};
const ownFields = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'revision'];
const itemFields = ['id', ...ownFields, 'deleted', 'createdAt', 'updatedAt'];
const headFields = [
  ...itemFields,
  'sessionId',
  'itemId',
  'kind',
  'order',
  'nextOrder',
  'checklistRevision',
  'checklistTotal',
  'checklistCompleted',
  'completed',
];
const families = Object.freeze({
  note: { collection: 'notes', fields: itemFields },
  session: { collection: 'sessions', fields: [...itemFields, 'order'] },
  checklist: {
    collection: 'workChecklist',
    fields: ['id', 'revision', 'completed', 'createdAt', 'updatedAt'],
  },
  'preparation-item': { collection: 'preparationItems', fields: [...itemFields, 'kind', 'order'] },
  'preparation-body': { collection: 'preparationBodies', fields: ['id', ...ownFields, 'kind'] },
  'session-reference': { collection: 'sessionReferences', fields: [...itemFields, 'sessionId'] },
  'session-reference-state': {
    collection: 'sessionReferenceState',
    fields: [...ownFields, 'sessionId'],
  },
  'session-preparation-link': {
    collection: 'sessionPreparationLinks',
    fields: [...itemFields, 'sessionId', 'itemId', 'order'],
  },
  'session-preparation-state': {
    collection: 'sessionPreparationState',
    fields: [...ownFields, 'sessionId', 'nextOrder'],
  },
});
function input(db, uid, data) {
  const context = campaignBackupScope(db, uid, data, [
    'sourceToken',
    'family',
    'limit',
    'cursor',
    'expectedPageToken',
  ]);
  if (typeof data.family !== 'string' || !Object.hasOwn(families, data.family)) invalid();
  const family = data.family,
    expected = campaignBackupToken(data.sourceToken),
    limit = Object.hasOwn(data, 'limit') ? data.limit : 25;
  if (!safe(limit, 1) || limit > 25) invalid();
  const pageExpected = Object.hasOwn(data, 'expectedPageToken')
    ? campaignBackupToken(data.expectedPageToken)
    : undefined;
  const cursorScope = {
    version: 1,
    uid,
    campaignId: context.campaignId,
    sourceToken: expected,
    family,
    limit,
  };
  let after = null;
  if (data.cursor != null) {
    const cursor = data.cursor;
    if (typeof cursor !== 'string' || cursor.length > 24576 || !/^[A-Za-z0-9_-]+$/.test(cursor))
      invalid();
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      invalid();
    }
    workClosed(parsed, [...Object.keys(cursorScope), 'after']);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== cursor ||
      Object.keys(cursorScope).some((key) => parsed[key] !== cursorScope[key])
    )
      invalid();
    after = workId(parsed.after);
  }
  return { ...context, expected, family, limit, after, pageExpected, cursorScope };
}
function own(value, c) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== c.uid ||
    value.campaignId !== c.campaignId ||
    value.campaignToken !== c.campaignToken ||
    !safe(value.revision)
  )
    inconsistent();
}
function dated(value) {
  if (
    ![value.createdAt, value.updatedAt].every(
      (date) => Number.isFinite(date) && date >= 0 && date <= 8640000000000000,
    ) ||
    value.updatedAt < value.createdAt
  )
    inconsistent();
}
function item(value, c, id, control, ordered = false) {
  own(value, c);
  if (
    value.id !== id ||
    !safe(value.revision, 1) ||
    value.revision > control.revision ||
    typeof value.deleted !== 'boolean' ||
    (ordered && (!safe(value.order, 1) || value.order >= control.nextOrder))
  )
    inconsistent();
  dated(value);
}
function pageContext(tx, c) {
  const cache = new Map();
  async function head(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const ref = c.db.doc(c.path + '/' + relative),
      snapshots = await tx.getAll(ref, { fieldMask: headFields }),
      snapshot = snapshots?.[0];
    if (
      !Array.isArray(snapshots) ||
      snapshots.length !== 1 ||
      !snapshot ||
      snapshot.ref?.path !== ref.path
    )
      inconsistent();
    const result = { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) };
    cache.set(relative, result);
    return result;
  }
  async function global(name) {
    const result = await head(name + '/current'),
      value = result.value;
    if (!result.snapshot.exists) inconsistent();
    if (name === 'workProgress') {
      if (
        value?.schemaVersion !== 1 ||
        !safe(value.checklistRevision) ||
        !safe(value.checklistTotal) ||
        !safe(value.checklistCompleted) ||
        value.checklistCompleted > value.checklistTotal
      )
        inconsistent();
    } else {
      own(value, c);
      if (['sessionState', 'preparationState'].includes(name) && !safe(value.nextOrder, 1))
        inconsistent();
    }
    return result;
  }
  async function session(id) {
    validId(id);
    const result = await head('sessions/' + id),
      control = await global('sessionState');
    item(result.value, c, id, control.value, true);
    return result;
  }
  async function perSession(name, id, optional = false) {
    validId(id);
    const result = await head(name + '/' + id);
    if (!result.snapshot.exists) {
      if (!optional) inconsistent();
      return result;
    }
    own(result.value, c);
    if (
      result.value.sessionId !== id ||
      (name === 'sessionPreparationState' && !safe(result.value.nextOrder, 1))
    )
      inconsistent();
    return result;
  }
  async function preparation(id) {
    validId(id);
    const result = await head('preparationItems/' + id),
      control = await global('preparationState');
    item(result.value, c, id, control.value, true);
    if (!['clue', 'quest'].includes(result.value.kind)) inconsistent();
    return result;
  }
  function body(value, parent) {
    own(value, c);
    if (
      !parent ||
      parent.deleted ||
      value.id !== parent.id ||
      value.kind !== parent.kind ||
      value.revision !== parent.revision
    )
      inconsistent();
  }
  return { head, global, session, perSession, preparation, body };
}
async function unit(snapshot, c, reader) {
  const value = snapshot.data(),
    id = validId(snapshot.id),
    dependencies = {};
  const bind = (key, result) => {
    dependencies[key] = result.native;
    return result.value;
  };
  switch (c.family) {
    case 'note': {
      const control = bind('noteState', await reader.global('noteState'));
      item(value, c, id, control);
      break;
    }
    case 'session': {
      const control = bind('sessionState', await reader.global('sessionState'));
      item(value, c, id, control, true);
      bind('references', await reader.perSession('sessionReferenceState', id, true));
      bind('preparation', await reader.perSession('sessionPreparationState', id, true));
      break;
    }
    case 'checklist': {
      const control = bind('workProgress', await reader.global('workProgress'));
      if (
        !value ||
        value.id !== id ||
        !safe(value.revision, 1) ||
        value.revision > control.checklistRevision ||
        typeof value.completed !== 'boolean'
      )
        inconsistent();
      dated(value);
      break;
    }
    case 'preparation-item': {
      const control = bind('preparationState', await reader.global('preparationState'));
      item(value, c, id, control, true);
      if (!['clue', 'quest'].includes(value.kind)) inconsistent();
      if (!value.deleted) {
        const body = bind('body', await reader.head('preparationBodies/' + id));
        reader.body(body, value);
      }
      break;
    }
    case 'preparation-body': {
      const parent = bind('item', await reader.preparation(id));
      reader.body(value, parent);
      break;
    }
    case 'session-reference':
    case 'session-preparation-link': {
      own(value, c);
      const sessionId = validId(value.sessionId),
        reference = c.family === 'session-reference';
      bind('session', await reader.session(sessionId));
      const control = bind(
        'control',
        await reader.perSession(
          reference ? 'sessionReferenceState' : 'sessionPreparationState',
          sessionId,
        ),
      );
      item(value, c, id, control, !reference);
      if (!reference && !value.deleted)
        bind('item', await reader.preparation(validId(value.itemId)));
      break;
    }
    case 'session-reference-state':
    case 'session-preparation-state': {
      own(value, c);
      if (
        value.sessionId !== id ||
        (c.family === 'session-preparation-state' && !safe(value.nextOrder, 1))
      )
        inconsistent();
      bind('session', await reader.session(id));
      break;
    }
  }
  return {
    id,
    itemToken: digest({
      version: 1,
      uid: c.uid,
      campaignId: c.campaignId,
      sourceToken: c.expected,
      family: c.family,
      id,
      native: campaignBackupIdentity(snapshot),
      dependencies,
    }),
  };
}

/** Metadata inventory only; complete archive coverage requires a second full pass. */
export function createCampaignBackupInventoryService({ db }) {
  return {
    async listCampaignBackupOwnInventory(uid, data) {
      const context = input(db, uid, data);
      return db.runTransaction(async (tx) => {
        const source = await readCampaignBackupSource(tx, context),
          roots = await tx.getAll(db.doc(context.path), { fieldMask: ['ownerId'] }),
          root = roots?.[0];
        if (!root?.exists || root.data()?.ownerId !== uid) inconsistent();
        campaignBackupIdentity(root);
        const c = {
            ...context,
            campaignToken: campaignIdentityToken(uid, context.campaignId, root),
          },
          definition = families[c.family],
          collection = c.path + '/' + definition.collection;
        let query = db
          .collection(collection)
          .orderBy('__name__')
          .limit(c.limit + 1);
        if (c.after !== null) query = query.startAfter(c.after);
        query = query.select(...definition.fields);
        const page = await tx.get(query);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) inconsistent();
        const reader = pageContext(tx, c),
          observed = [];
        let previous = c.after;
        for (const snapshot of page.docs) {
          const id = validId(snapshot.id);
          if (
            snapshot.ref?.path !== collection + '/' + id ||
            !snapshot.exists ||
            (previous !== null && Buffer.compare(Buffer.from(id), Buffer.from(previous)) <= 0)
          )
            inconsistent();
          observed.push(await unit(snapshot, c, reader));
          previous = id;
        }
        const pageToken = digest({ ...c.cursorScope, after: c.after, observed });
        if (c.pageExpected !== undefined && c.pageExpected !== pageToken)
          workFail(
            'failed-precondition',
            'O inventário mudou. Reinicie a captura.',
            'campaign-backup-page-changed',
          );
        const items = observed.slice(0, c.limit);
        return {
          ...source,
          family: c.family,
          items,
          pageToken,
          nextCursor:
            observed.length > c.limit
              ? Buffer.from(JSON.stringify({ ...c.cursorScope, after: items.at(-1).id })).toString(
                  'base64url',
                )
              : null,
        };
      });
    },
  };
}
