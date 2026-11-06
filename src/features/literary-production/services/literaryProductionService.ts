import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import { getFirebaseApp } from '@/shared/lib';
import type {
  EditorialState,
  EditorialVersionPage,
  SaveEditorialContract,
} from '../model/editorial';

async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const getLiteraryContract = (bookId: string) =>
  call<EditorialState>('getLiteraryContract', { target: { kind: 'book', id: bookId } });
export const saveLiteraryContract = (input: SaveEditorialContract, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'contract', 'current', input, () =>
    call<EditorialState>('saveLiteraryContract', input),
  );
export const getLiteraryOperation = (bookId: string, operationId: string) =>
  call<
    | { state: 'unconfirmed' }
    | {
        state: 'confirmed';
        kind:
          | 'contract'
          | 'plan'
          | 'gate'
          | 'milestone'
          | 'prose'
          | 'proseApply'
          | 'review'
          | 'draft'
          | 'draftExecution'
          | 'workflow'
          | 'integration'
          | 'integrationRecheck'
          | 'finding'
          | 'progress'
          | 'publication'
          | 'publicationGuide'
          | 'publicationConfirm';
        id: string;
        revision: number;
        updatedAt: number;
        noOp: boolean;
      }
  >('getLiteraryOperation', { target: { kind: 'book', id: bookId }, operationId });
export const listLiteraryContractVersions = (
  bookId: string,
  beforeRevision: number | null = null,
) =>
  call<EditorialVersionPage>('listLiteraryContractVersions', {
    target: { kind: 'book', id: bookId },
    beforeRevision,
    limit: 25,
  });
export const getLiteraryContractVersion = (bookId: string, revision: number) =>
  call<EditorialState>('getLiteraryContractVersion', {
    target: { kind: 'book', id: bookId },
    revision,
  });
