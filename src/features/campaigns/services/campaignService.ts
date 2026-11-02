import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  Campaign,
  CampaignListInput,
  CampaignPageResult,
  CreateCampaignInput,
} from '../model/campaign';

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (cause) {
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    if (
      ['internal', 'unavailable', 'deadline-exceeded', 'cancelled'].includes(
        code.replace(/^functions\//, ''),
      )
    ) {
      throw Object.assign(
        new Error('Não foi possível confirmar esta operação. Tente novamente.', { cause }),
        { code },
      );
    }
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar a campanha. Tente novamente.', { cause });
  }
}
export function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  return call('createCampaign', input);
}
export function getCampaign(id: string): Promise<Campaign | null> {
  return call('getCampaign', { id });
}
export function listCampaigns(input: CampaignListInput = {}): Promise<CampaignPageResult> {
  return call('listStudioProjects', { ...input, kind: 'campaign' });
}
