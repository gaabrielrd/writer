import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type { CampaignBase, CampaignBaseReferences } from '../model/campaignBase';
import type {
  ActivateCampaignCaptureInput,
  AdvanceCampaignCaptureInput,
  CancelCampaignCaptureInput,
  CampaignBaseImage,
  CampaignBaseList,
  CampaignBaseWindow,
  CampaignCaptureActivation,
  CampaignCaptureActivationResolution,
  ResolveCampaignCaptureActivationInput,
  CampaignCaptureList,
  CampaignCaptureProgress,
  CampaignCaptureSource,
  ListCampaignBaseItemsInput,
  ListCampaignCapturesInput,
  ReadCampaignBaseItemInput,
  StartCampaignCaptureInput,
} from '../model/campaignBase';
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw Object.assign(
      new Error('Não foi possível confirmar o pedido. Repita o mesmo pedido antes de continuar.', {
        cause,
      }),
      { code: 'functions/unavailable' },
    );
  }
}
export const getCampaignCaptureSource = (input: {
  adventureId: string;
}): Promise<CampaignCaptureSource | null> => call('getCampaignCaptureSource', input);
export const startCampaignCapture = (
  input: StartCampaignCaptureInput,
): Promise<CampaignCaptureProgress> => call('startCampaignCapture', input);
export const getCampaignCapture = (input: {
  captureId: string;
}): Promise<CampaignCaptureProgress> => call('getCampaignCapture', input);
export const listCampaignCaptures = (
  input: ListCampaignCapturesInput = {},
): Promise<CampaignCaptureList> => call('listCampaignCaptures', input);
export const advanceCampaignCapture = (
  input: AdvanceCampaignCaptureInput,
): Promise<CampaignCaptureProgress> => call('advanceCampaignCapture', input);
export const activateCampaignCapture = (
  input: ActivateCampaignCaptureInput,
): Promise<CampaignCaptureActivation> => call('activateCampaignCapture', input);
export const resolveCampaignCaptureActivation = (
  input: ResolveCampaignCaptureActivationInput,
): Promise<CampaignCaptureActivationResolution> => call('resolveCampaignCaptureActivation', input);
export const cancelCampaignCapture = (
  input: CancelCampaignCaptureInput,
): Promise<CampaignCaptureProgress> => call('cancelCampaignCapture', input);
export const listCampaignBaseItems = (
  input: ListCampaignBaseItemsInput,
): Promise<CampaignBaseList> => call('listCampaignBaseItems', input);
export const readCampaignBaseItem = (
  input: ReadCampaignBaseItemInput,
): Promise<CampaignBaseWindow> => call('readCampaignBaseItem', input);
export const readCampaignBaseImage = (input: {
  campaignId: string;
  imageKey: string;
}): Promise<CampaignBaseImage> => call('readCampaignBaseImage', input);
export const getCampaignBase = (input: { campaignId: string }): Promise<CampaignBase> =>
  call('getCampaignBase', input);
export const listCampaignBaseReferences = (input: {
  campaignId: string;
  sourceKey: string;
  cursor?: string | null;
  limit?: number;
}): Promise<CampaignBaseReferences> => call('listCampaignBaseReferences', input);
