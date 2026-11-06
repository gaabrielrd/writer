import {
  editorialFields,
  type EditorialState,
  type SaveEditorialContract,
} from '../../../src/features/literary-production/model/editorial';
const empty = (): EditorialState => ({
  revision: 0,
  updatedAt: null,
  contract: {
    schemaVersion: 1,
    fields: Object.fromEntries(
      Object.keys(editorialFields).map((key) => [key, '']),
    ) as EditorialState['contract']['fields'],
    decisions: [],
  },
});
let current = empty();
const versions = new Map<number, EditorialState>();
const receipts = new Map<string, { fingerprint: string; state: EditorialState }>();
export const getLiteraryContract = () => Promise.resolve(structuredClone(current));
export const listLiteraryContractVersions = (
  _bookId: string,
  beforeRevision: number | null = null,
) => {
  const items = [...versions.values()]
    .filter((v) => beforeRevision === null || v.revision < beforeRevision)
    .sort((a, b) => b.revision - a.revision)
    .slice(0, 25)
    .map(({ revision, updatedAt }) => ({ revision, updatedAt }));
  return Promise.resolve({
    items,
    nextBeforeRevision: items.length === 25 ? (items.at(-1)?.revision ?? null) : null,
  });
};
export const getLiteraryContractVersion = (_bookId: string, revision: number) =>
  Promise.resolve(structuredClone(versions.get(revision) ?? empty()));
export const getLiteraryOperation = () => Promise.resolve({ state: 'unconfirmed' as const });
export const saveLiteraryContract = (input: SaveEditorialContract) => {
  const fingerprint = JSON.stringify(input);
  const old = receipts.get(input.operationId);
  if (old) {
    if (old.fingerprint !== fingerprint) return Promise.reject(new Error('Operação diferente.'));
    return Promise.resolve(structuredClone(old.state));
  }
  if (input.expectedRevision !== current.revision)
    return Promise.reject(new Error('Revisão alterada.'));
  current = {
    revision: current.revision + 1,
    updatedAt: 100 + current.revision,
    contract: structuredClone(input.contract),
  };
  versions.set(current.revision, structuredClone(current));
  receipts.set(input.operationId, { fingerprint, state: structuredClone(current) });
  return Promise.resolve(structuredClone(current));
};
