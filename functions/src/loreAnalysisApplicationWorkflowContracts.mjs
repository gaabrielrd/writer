import { closed, integer } from './bookRestoreUploadContracts.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
export const initialApplicationCursor = () => ({ member: 0, stage: 'source', field: 0 });
export const initialApplicationCleanup = () => ({ member: 0, stage: 'edit', field: 0 });
export function validateApplicationState(state, context) {
  if (state?.schemaVersion === 1) {
    closed(state, ['schemaVersion', 'phase', 'revision', 'lastOperationId']);
    if (!['preparing', 'cancelled'].includes(state.phase)) conflict();
  } else {
    closed(state, [
      'schemaVersion',
      'phase',
      'revision',
      'lastOperationId',
      'cursor',
      'cleanup',
      'preparedCount',
    ]);
    if (
      state.schemaVersion !== 2 ||
      context.kind !== 'reservation' ||
      !['preparing', 'ready', 'cancelling', 'cancelled'].includes(state.phase)
    )
      conflict();
    const count = context.members.length;
    for (const [key, stages] of [
      ['cursor', ['source', 'fields', 'edit', 'reserve', 'compile']],
      ['cleanup', ['edit', 'fields', 'source']],
    ]) {
      const cursor = state[key];
      closed(cursor, ['member', 'stage', 'field']);
      integer(cursor.member);
      integer(cursor.field);
      if (cursor.member > count || cursor.field > 6 || !stages.includes(cursor.stage)) conflict();
    }
    integer(state.preparedCount);
    if (
      state.preparedCount !== state.cursor.member ||
      (state.phase === 'ready' && state.preparedCount !== count) ||
      (state.phase === 'preparing' && state.preparedCount === count) ||
      (state.phase === 'cancelled' && state.cleanup.member !== count)
    )
      conflict();
  }
  integer(state.revision);
  if (
    (context.kind === 'fence' && state.phase !== 'cancelled') ||
    (state.revision === 0
      ? state.lastOperationId !== null
      : typeof state.lastOperationId !== 'string')
  )
    conflict();
  return state;
}
export function applicationWorkflowState(l) {
  if (l.state.schemaVersion === 2) return structuredClone(l.state);
  if (l.context.kind !== 'reservation' || l.state.phase !== 'preparing') conflict();
  return {
    ...l.state,
    schemaVersion: 2,
    cursor: initialApplicationCursor(),
    cleanup: initialApplicationCleanup(),
    preparedCount: 0,
  };
}
