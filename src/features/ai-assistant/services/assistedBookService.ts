import { capturePlatformTextGeneration } from './byokStorage';
import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type {
  CreationKind,
  AssistedCosts,
  AssistedProposal,
  AssistedRequest,
  AssistedSession,
} from '../model/assistedBook';

export class AssistedBookError extends Error {
  readonly uncertain: boolean;
  readonly contextUnavailable: boolean;
  constructor(message: string, code: string, reason?: string) {
    super(message);
    this.contextUnavailable = reason === 'creation-context-changed';
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
      (error as { details?: { reason?: string } }).details?.reason,
    );
  }
}
export const loadAssistedBook = () =>
  call<{
    session: AssistedSession | null;
    costs: AssistedCosts;
    bookId?: string | null;
    project?: { kind: CreationKind; id: string } | null;
  }>({
    action: 'load',
  });
export const requestAssistedBook = (data: AssistedRequest) => {
  if (['interview', 'generate', 'entity'].includes(data.action))
    data.generation ??= capturePlatformTextGeneration();
  return call<AssistedSession>(data);
};
export interface AssistedCommit {
  flowVersion?: 2;
  expectedCost: number;
  sessionId: string;
  revision: number;
  proposal: AssistedProposal;
  coverId: string | null;
  imageId: string | null;
}
export const commitAssistedBook = (data: AssistedCommit) =>
  call<{ book: { id: string }; project?: { kind: CreationKind; id: string }; credits: number }>({
    action: 'commit',
    ...data,
  });
