import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type { Campaign, UpdateCampaignInput } from '../model/campaign';
export async function updateCampaign(input: UpdateCampaignInput): Promise<Campaign> {
  try {
    return (
      await httpsCallable<UpdateCampaignInput, Campaign>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        'updateCampaign',
      )(input)
    ).data;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw Object.assign(
      new Error(
        'Não foi possível confirmar a alteração. Confirme o mesmo pedido antes de continuar.',
        { cause },
      ),
      { code: 'functions/unavailable' },
    );
  }
}
