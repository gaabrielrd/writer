import { emptyEditorialContract } from '../../src/literaryContracts.mjs';
import { LITERARY_PLAN_SCHEMA } from '../../src/literaryPlanningSchema.mjs';
import { record } from './bookContentFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import {
  readyEditorial,
  finishEditorial,
  editorialRecords,
  artifact,
  reference,
  contractId,
  uid,
} from './bookRestoreEditorialFixture.mjs';
export const context = {
  schemaVersion: 1,
  sourceBookId: 'book',
  bookId: 'new-book',
  jobToken: 'a'.repeat(64),
};
const planCID = 'f'.repeat(64),
  contractLineage = '1'.repeat(64),
  planLineage = '2'.repeat(64);
export const currentContract = () => ({
  ...artifact(contractId, 'contract', {
    ...emptyEditorialContract(),
    collaborationPolicy: { version: 1, mode: 'continuous' },
  }),
  lineage: { id: contractLineage, role: 'current' },
});
export const currentPlan = () => ({
  ...artifact(planCID, 'plan', {
    kind: 'chapterBrief',
    title: 'Original plan',
    status: 'approved',
    fields: Object.fromEntries(
      Object.keys(LITERARY_PLAN_SCHEMA.chapterBrief.fields).map((key) => [
        key,
        key === 'function' ? 'Own function' : '',
      ]),
    ),
    references: [{ ...reference('book'), kind: 'book' }],
  }),
  lineage: { id: planLineage, role: 'current' },
});
export function headRecords({ contracts = [currentContract()], plan = currentPlan() } = {}) {
  const rows = editorialRecords().filter(
    (row) => !(row.kind === 'book-editorial-artifact' && row.id === contractId),
  );
  const at = rows.findIndex((row) => row.kind === 'book-editorial-artifact');
  rows.splice(
    at,
    0,
    ...contracts.map((value) => record('book-editorial-artifact', value.id, value)),
    ...(plan ? [record('book-editorial-artifact', plan.id, plan)] : []),
  );
  const control = rows.findIndex((row) => row.kind === 'book-editorial');
  rows[control] = record('book-editorial', 'book', {
    schemaVersion: 1,
    bookId: 'book',
    presence: 'captured',
    artifacts: contracts.length + 1 + (plan ? 1 : 0),
    links: 1,
  });
  return rows;
}
export async function readyEditableEditorial(options) {
  const f = await readyEditorial({
    db: options?.db,
    id: options?.id,
    records: options?.records ?? headRecords(options),
    editorialActivation: options?.editorialActivation ?? false,
  });
  f.p = await finishEditorial(f);
  return f;
}
export const editorialState = (f) => f.records.get(f.root + '/preparedEditorial/current');
export async function finishEditableEditorial(f, start = f.p) {
  let p = start;
  for (let unit = 0; unit < 1000; unit++) {
    const metadata = await f
      .factory()
      .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: p.jobToken });
    if (metadata.heads?.phase === 'prepared') return p;
    p = (
      await f
        .factory()
        .advanceBookRestoreEditorialHeads(uid, mutation(f.id, p, f.id + '-heads-' + unit))
    ).progress;
  }
  throw Error('Editable heads did not finish');
}
