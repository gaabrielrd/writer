import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  AssistedCosts,
  AssistedProposal,
  AssistedRequest,
  AssistedSession,
} from '../model/assistedBook';

export class AssistedBookError extends Error {
  readonly uncertain: boolean;
  constructor(message: string, code: string) {
    super(message);
    this.uncertain = ![
      'functions/invalid-argument',
      'functions/failed-precondition',
      'functions/not-found',
      'functions/resource-exhausted',
      'functions/permission-denied',
      'functions/unauthenticated',
    ].includes(code);
  }
}
async function call<T>(data: object): Promise<T> {
  try {
    return (
      await httpsCallable<object, T>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        'assistedBook',
        { timeout: 120000 },
      )(data)
    ).data;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    throw new AssistedBookError(
      error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.',
      code,
    );
  }
}
export const loadAssistedBook = () =>
  call<{ session: AssistedSession | null; costs: AssistedCosts; bookId?: string | null }>({
    action: 'load',
  });
export const requestAssistedBook = (data: AssistedRequest) => call<AssistedSession>(data);
export interface AssistedCommit {
  expectedCost: number;
  sessionId: string;
  revision: number;
  proposal: AssistedProposal;
  coverId: string | null;
  imageId: string | null;
}
export const commitAssistedBook = (data: AssistedCommit) =>
  call<{ book: { id: string }; credits: number }>({ action: 'commit', ...data });
