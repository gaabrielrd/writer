import { countVisibleWords } from './visibleWordCount.mjs';
import { adventureBlockExtra } from './adventureBlocksState.mjs';
import {
  digest,
  workPath,
  workFail,
  initialWorkControl,
  workRevision,
  readWorkMetadata,
} from './workProgressContracts.mjs';

export const workSourceKey = (kind, id) => digest({ kind, id });
export const workGroupKey = (target, id) =>
  digest({ kind: target.kind === 'book' ? 'chapter' : 'part', id });
export function createWorkProgressLedger({ db, countWords = countVisibleWords }) {
  async function prepareChanges(
    tx,
    { target, root, changes = [], groupStates = [], disableGroups = [] },
  ) {
    const path = workPath(target);
    if (!root.hasProgressResources || target.kind === 'campaign')
      return { commit() {}, wordCount: null, ready: false };
    const controlRef = db.doc(path + '/workProgress/current'),
      controlSnapshot = await tx.get(controlRef);
    const control = controlSnapshot.data() ?? initialWorkControl(target, root);
    if (!controlSnapshot.exists)
      workFail('failed-precondition', 'O controle do manuscrito ainda não foi ativado.');
    if (
      new Set(changes.map((change) => workSourceKey(change.kind, change.id))).size !==
      changes.length
    )
      workFail('invalid-argument', 'Fonte repetida na mesma alteração.');
    const overrides = new Map(groupStates.map((value) => [value.id, value]));
    const groups = new Map(),
      sources = [];
    async function readGroup(id) {
      const key = workGroupKey(target, id);
      if (groups.has(key)) return groups.get(key);
      let parent = null;
      if (id !== null) {
        parent =
          (
            await readWorkMetadata(
              tx,
              db.doc(path + '/' + (target.kind === 'book' ? 'chapters' : 'parts') + '/' + id),
              ['ownerId', 'contentMode', 'deleting'],
            )
          ).data() ?? null;
        if (parent?.ownerId && parent.ownerId !== (root.authorId ?? root.ownerId))
          workFail('failed-precondition', 'Agrupador indisponível.');
      }
      const future = overrides.has(id) ? overrides.get(id) : parent;
      const ref = db.doc(path + '/workWordGroups/' + key),
        stored = (await tx.get(ref)).data();
      const enabled = id !== null && Boolean(future) && !future.deleting;
      const entry = {
        key,
        ref,
        words: stored?.words ?? 0,
        enabled: stored?.enabled ?? enabled,
        desiredEnabled: enabled,
        parent: future,
      };
      if (!Number.isSafeInteger(entry.words) || entry.words < 0)
        workFail('failed-precondition', 'Agregado de palavras inválido.');
      groups.set(key, entry);
      return entry;
    }
    for (const id of disableGroups) {
      const group = await readGroup(id);
      group.desiredEnabled = false;
    }
    for (const change of changes) {
      if (
        !['chapter', 'scene'].includes(change.kind) ||
        (change.kind === 'chapter' && target.kind !== 'book')
      )
        workFail('invalid-argument', 'Fonte inválida.');
      const key = workSourceKey(change.kind, change.id),
        ref = db.doc(path + '/workWordSources/' + key),
        prior = (await tx.get(ref)).data();
      const sourceRef = db.doc(
          path + '/' + (change.kind === 'chapter' ? 'chapters' : 'scenes') + '/' + change.id,
        ),
        current = (
          await readWorkMetadata(tx, sourceRef, [
            'bookId',
            'ownerId',
            'parentId',
            'archived',
            'contentMode',
            'deleting',
            'hasBlocks',
            'mainWordCount',
            'blockWordCount',
            'blockCount',
            'wordCount',
            'revision',
            'blocksStructureRevision',
            'nextBlockOrder',
            'mainBlockOrder',
          ])
        ).data();
      if (current?.bookId && current.bookId !== target.id)
        workFail('failed-precondition', 'Fonte indisponível.');
      if (current && change.kind === 'scene' && current.ownerId !== (root.authorId ?? root.ownerId))
        workFail('failed-precondition', 'Fonte indisponível.');
      const groupId =
        change.kind === 'chapter'
          ? change.id
          : 'parentId' in change
            ? change.parentId
            : (current?.parentId ?? null);
      const nextGroup = await readGroup(groupId);
      const oldGroup = prior ? await readGroup(prior.groupId) : null;
      const archived = change.archived ?? current?.archived ?? false;
      const mode = change.contentMode ?? current?.contentMode ?? 'legacy';
      if (change.kind === 'chapter' && !['legacy', 'scenes'].includes(mode))
        workFail('failed-precondition', 'O modo de texto do capítulo é inválido.');
      let content = change.content;
      const eligible =
        !change.removed &&
        !archived &&
        (change.kind === 'chapter'
          ? mode === 'legacy' && Boolean(nextGroup.parent) && !nextGroup.parent.deleting
          : groupId !== null &&
            Boolean(nextGroup.parent) &&
            !nextGroup.parent.deleting &&
            (target.kind === 'adventure' || nextGroup.parent.contentMode === 'scenes'));
      if (content === undefined && eligible) {
        content =
          change.kind === 'chapter'
            ? ((await tx.get(sourceRef)).data()?.content ?? '')
            : (await tx.get(db.doc(sourceRef.path + '/body/current'))).data()?.content;
        if (typeof content !== 'string')
          workFail('failed-precondition', 'O texto da fonte está indisponível.');
      }
      if (content !== undefined && typeof content !== 'string')
        workFail('invalid-argument', 'Texto inválido.');
      const blockScene = change.blockScene ?? current,
        extra =
          change.kind === 'scene' && !change.removed ? adventureBlockExtra(target, blockScene) : 0,
        words = eligible ? countWords(content ?? '') + extra : 0;
      if (!Number.isSafeInteger(words) || words < 0)
        workFail('failed-precondition', 'Contagem de palavras inválida.');
      sources.push({
        ref,
        prior,
        oldGroup,
        nextGroup,
        value: {
          kind: change.kind,
          id: change.id,
          groupId,
          words,
          fingerprint: digest({
            content: content ?? null,
            mode,
            archived,
            groupId,
            removed: Boolean(change.removed),
            eligible,
            ...(target.kind === 'adventure' && change.kind === 'scene'
              ? {
                  blockWordCount: extra,
                  sceneRevision: blockScene?.revision ?? null,
                  blocksStructureRevision: blockScene?.blocksStructureRevision ?? 0,
                }
              : {}),
          }),
          countVersion: 1,
        },
      });
    }
    let delta = 0;
    for (const group of groups.values()) {
      if (group.enabled !== group.desiredEnabled) {
        delta += group.desiredEnabled ? group.words : -group.words;
        group.enabled = group.desiredEnabled;
      }
    }
    for (const source of sources) {
      if (source.oldGroup) {
        source.oldGroup.words -= source.prior.words;
        if (source.oldGroup.enabled) delta -= source.prior.words;
      }
      source.nextGroup.words += source.value.words;
      if (source.nextGroup.enabled) delta += source.value.words;
    }
    const total = control.wordCount + delta;
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      [...groups.values()].some((group) => group.words < 0)
    )
      workFail('failed-precondition', 'O total do manuscrito está inconsistente.');
    const changed =
      delta !== 0 ||
      sources.some((source) => digest(source.prior ?? null) !== digest(source.value)) ||
      disableGroups.length > 0;
    const value = {
      ...control,
      wordCount: total,
      countRevision: workRevision(control.countRevision ?? 0) + (changed ? 1 : 0),
    };
    return {
      wordCount: total,
      ready: control.countReady,
      control: value,
      commit() {
        for (const group of groups.values())
          tx.set(group.ref, { words: group.words, enabled: group.enabled });
        for (const source of sources) tx.set(source.ref, source.value);
        if (changed) tx.set(controlRef, value);
        if (control.countReady && target.kind === 'book')
          tx.update(db.doc(path), { wordCount: total });
      },
    };
  }
  return { prepareChanges };
}
