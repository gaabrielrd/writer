import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  campaignStatusLabels,
  supportedCampaignProvenance,
  type Campaign,
  type CampaignPatch,
  type UpdateCampaignInput,
} from '../model/campaign';
import { getCampaign } from '../services/campaignService';
import {
  updateCampaign,
  runCampaignManagement,
  definitiveCampaignFailure,
  campaignRevisionConflict,
} from '../services/campaignManagementService';
import {
  readPendingCampaignOperation,
  writePendingCampaignOperation,
  clearPendingCampaignOperation,
} from '../services/campaignManagementRecovery';
export type CampaignManagementFields = Pick<
  Campaign,
  'title' | 'description' | 'status' | 'universeId'
>;
export interface CampaignManagementCallbacks {
  onConfirmed?: (campaign: Campaign) => void;
  onPendingChange?: (pending: boolean) => void;
}
const fieldsOf = (campaign: Campaign): CampaignManagementFields => ({
  title: campaign.title,
  description: campaign.description,
  status: campaign.status,
  universeId: campaign.universeId,
});
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a alteração. Tente novamente com o mesmo pedido.';
function campaignChanges(fields: CampaignManagementFields, base: Campaign): CampaignPatch {
  const changed: CampaignPatch = {};
  if (fields.title.trim() !== base.title) changed.title = fields.title.trim();
  if (fields.description.trim() !== base.description)
    changed.description = fields.description.trim();
  if (fields.status !== base.status) changed.status = fields.status;
  if (fields.universeId !== base.universeId) changed.universeId = fields.universeId;
  return changed;
}
export function useCampaignManagement(
  initial: Campaign,
  callbacks: CampaignManagementCallbacks = {},
) {
  const { user } = useAuth(),
    uid = user?.uid,
    key = JSON.stringify([uid, initial.id]);
  const active = useRef(true),
    reserved = useRef(false),
    identity = useRef(key),
    current = useRef(initial),
    latest = useRef(callbacks);
  useLayoutEffect(() => {
    identity.current = key;
    latest.current = callbacks;
  });
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [recovery] = useState(() => {
    try {
      return { input: uid ? readPendingCampaignOperation(uid, initial.id) : null, error: '' };
    } catch (cause) {
      return { input: null, error: message(cause) };
    }
  });
  const [fields, setFields] = useState<CampaignManagementFields>(() => ({
    ...fieldsOf(initial),
    ...recovery.input?.patch,
  }));
  const [base, setBase] = useState(initial);
  const [pending, setPending] = useState(recovery.input),
    pendingRef = useRef(recovery.input);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(recovery.error),
    [conflict, setConflict] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const isCurrent = () => active.current && identity.current === key;
  useEffect(() => {
    latest.current.onPendingChange?.(busy || Boolean(pending) || Boolean(recovery.error));
  }, [busy, pending, recovery.error]);
  useEffect(() => {
    if (!busy && !pending && !recovery.error) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, pending, recovery.error]);
  function changePending(value: UpdateCampaignInput | null) {
    pendingRef.current = value;
    if (isCurrent()) setPending(value);
  }
  function assertCampaign(value: Campaign, input?: UpdateCampaignInput): void {
    if (
      !value ||
      value.id !== initial.id ||
      value.ownerId !== uid ||
      !supportedCampaignProvenance(value) ||
      value.provenance.kind !== initial.provenance.kind ||
      (value.provenance.kind === 'original' &&
        (initial.provenance.kind !== 'original' ||
          value.provenance.adventureId !== initial.provenance.adventureId ||
          value.provenance.baseId !== initial.provenance.baseId)) ||
      value.activeBaseId !== initial.activeBaseId ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      (input && value.revision !== input.expectedRevision + 1) ||
      typeof value.title !== 'string' ||
      typeof value.description !== 'string' ||
      !Object.hasOwn(campaignStatusLabels, value.status) ||
      (value.universeId !== null && typeof value.universeId !== 'string')
    )
      throw Object.assign(
        new Error(
          'A confirmação desta campanha não pôde ser validada. Confirme o mesmo pedido antes de continuar.',
        ),
        { code: 'functions/unavailable' },
      );
  }
  async function execute(input: UpdateCampaignInput, replay = false): Promise<Campaign | null> {
    if (
      !uid ||
      !isCurrent() ||
      reserved.current ||
      recovery.error ||
      (!replay && pendingRef.current)
    )
      return null;
    reserved.current = true;
    setBusy(true);
    setError('');
    let preserved = replay;
    try {
      if (!replay) {
        writePendingCampaignOperation(uid, input);
        preserved = true;
        changePending(input);
      }
      const value = await runCampaignManagement(uid, initial.id, async () => {
        if (!isCurrent()) return null;
        return updateCampaign(input);
      });
      if (!isCurrent() || !value) return null;
      assertCampaign(value, input);
      clearPendingCampaignOperation(uid, initial.id, input.operationId);
      changePending(null);
      current.current = value;
      setBase(value);
      setFields(fieldsOf(value));
      setConflict(false);
      setUnavailable(false);
      latest.current.onConfirmed?.(value);
      return value;
    } catch (cause) {
      if (!isCurrent()) return null;
      if (preserved && definitiveCampaignFailure(cause)) {
        try {
          clearPendingCampaignOperation(uid, initial.id, input.operationId);
          changePending(null);
        } catch {
          /* Keep the same request until its receipt can be reconciled. */
        }
      } else if (!preserved) {
        try {
          const existing = readPendingCampaignOperation(uid, initial.id);
          if (existing) changePending(existing);
        } catch {
          /* Keep the adapter error visible; no request was sent. */
        }
      }
      setConflict(campaignRevisionConflict(cause));
      setError(message(cause));
      return null;
    } finally {
      reserved.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  function patch(): CampaignPatch {
    return campaignChanges(fields, current.current);
  }
  async function submit() {
    if (
      !uid ||
      conflict ||
      unavailable ||
      !fields.title.trim() ||
      fields.title.length > 300 ||
      fields.description.length > 4000
    )
      return null;
    const changes = patch();
    if (!Object.keys(changes).length) return null;
    return execute({
      campaignId: initial.id,
      operationId: crypto.randomUUID(),
      expectedRevision: current.current.revision,
      patch: changes,
    });
  }
  async function loadCurrent() {
    if (!isCurrent() || reserved.current || pendingRef.current || recovery.error) return;
    reserved.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await getCampaign(initial.id);
      if (!isCurrent()) return;
      if (!value || value.ownerId !== uid) {
        setUnavailable(true);
        setError('Esta campanha não está disponível para sua conta.');
        return;
      }
      assertCampaign(value);
      current.current = value;
      setBase(value);
      setFields(fieldsOf(value));
      setConflict(false);
      setUnavailable(false);
      latest.current.onConfirmed?.(value);
    } catch (cause) {
      if (isCurrent()) setError(message(cause));
    } finally {
      reserved.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return {
    fields,
    pending,
    busy,
    error,
    conflict,
    unavailable,
    recoveryBlocked: Boolean(recovery.error),
    hasChanges: Object.keys(campaignChanges(fields, base)).length > 0,
    change: <K extends keyof CampaignManagementFields>(
      name: K,
      value: CampaignManagementFields[K],
    ) => {
      if (
        isCurrent() &&
        !reserved.current &&
        !pendingRef.current &&
        !conflict &&
        !recovery.error &&
        !unavailable
      )
        setFields((old) => ({ ...old, [name]: value }));
    },
    submit,
    recover: () => (pendingRef.current ? execute(pendingRef.current, true) : Promise.resolve(null)),
    loadCurrent,
    isReserved: () => reserved.current || Boolean(pendingRef.current) || Boolean(recovery.error),
  };
}
