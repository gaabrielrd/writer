import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type {
  LiteraryProposalPage,
  LiteraryProposalResponse,
  StartLiteraryProposal,
} from '../model/proposal';
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
export const startLiteraryProposal = (input: StartLiteraryProposal) =>
  call<LiteraryProposalResponse>('startLiteraryProposal', input);
export const cancelLiteraryProposal = (bookId: string, operationId: string) =>
  call<LiteraryProposalResponse>('cancelLiteraryProposal', {
    target: { kind: 'book', id: bookId },
    operationId,
  });
export const getLiteraryProposal = (bookId: string, operationId: string) =>
  call<LiteraryProposalResponse>('getLiteraryProposal', {
    target: { kind: 'book', id: bookId },
    operationId,
  });
export const listLiteraryProposals = (bookId: string, afterId: string | null = null) =>
  call<LiteraryProposalPage>('listLiteraryProposals', {
    target: { kind: 'book', id: bookId },
    afterId,
    limit: 25,
  });
