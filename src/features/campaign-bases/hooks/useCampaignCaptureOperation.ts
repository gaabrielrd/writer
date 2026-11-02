import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import type {
  CampaignCaptureActivation,
  CampaignCaptureActivationResolution,
  CampaignCaptureProgress,
  PendingCampaignCaptureOperation,
} from '../model/campaignBase';
import * as api from '../services/campaignBaseService';
import {
  clearPendingCampaignCapture,
  readPendingCampaignCapture,
  writePendingCampaignCapture,
  withCampaignCaptureJournalLock,
  type CampaignCaptureRecoveryScope,
} from '../services/campaignCaptureRecovery';
export type CampaignCaptureResult = CampaignCaptureProgress | CampaignCaptureActivation;
export function useCampaignCaptureOperation(
  scope: CampaignCaptureRecoveryScope,
  callbacks: {
    onResult?: (value: CampaignCaptureResult) => void;
    onPendingChange?: (pending: boolean) => void;
    expectedAdventureId?: string;
  } = {},
) {
  const { user } = useAuth(),
    uid = user?.uid,
    key = JSON.stringify([uid, scope]);
  const active = useRef(true),
    identity = useRef(key),
    busyRef = useRef(false),
    conflictRef = useRef(false),
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
  const [initial] = useState(() => {
    try {
      return { pending: uid ? readPendingCampaignCapture(uid, scope) : null, error: '' };
    } catch (cause) {
      return { pending: null, error: api.captureErrorMessage(cause) };
    }
  });
  const [pending, setPending] = useState(initial.pending),
    pendingRef = useRef(initial.pending);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initial.error),
    [conflict, setConflict] = useState(false),
    [historical, setHistorical] = useState<CampaignCaptureActivationResolution | null>(null);
  const isCurrent = () => active.current && identity.current === key;
  useEffect(() => {
    latest.current.onPendingChange?.(busy || Boolean(pending) || Boolean(initial.error));
  }, [busy, pending, initial.error]);
  useEffect(() => {
    if (!busy && !pending && !initial.error) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, pending, initial.error]);
  const changePending = (value: PendingCampaignCaptureOperation | null) => {
    pendingRef.current = value;
    if (isCurrent()) setPending(value);
  };
  const journal = <T>(work: () => T) =>
    withCampaignCaptureJournalLock(
      uid!,
      scope,
      () => {
        if (!isCurrent()) throw new Error('A sessão ou a captura mudou. O pedido foi preservado.');
      },
      work,
    );
  async function execute(
    operation: PendingCampaignCaptureOperation,
    replay = false,
  ): Promise<CampaignCaptureResult | null> {
    if (
      !uid ||
      !isCurrent() ||
      busyRef.current ||
      initial.error ||
      (!replay && (pendingRef.current || conflictRef.current))
    )
      return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setHistorical(null);
    let preserved = replay;
    try {
      if (!replay) {
        await journal(() => writePendingCampaignCapture(uid, scope, operation));
        if (!isCurrent()) return null;
        preserved = true;
        changePending(operation);
      }
      const value = await api.runCampaignCapture(
        uid,
        scope.kind === 'start' ? scope.adventureId : scope.captureId,
        async () => {
          if (!isCurrent()) return null;
          await journal(() => {
            if (
              JSON.stringify(readPendingCampaignCapture(uid, scope)) !== JSON.stringify(operation)
            )
              throw new Error('O pedido preservado mudou em outra aba. Reabra a preparação.');
          });
          if (!isCurrent()) return null;
          switch (operation.method) {
            case 'startCampaignCapture':
              return api.startCampaignCapture(operation.input);
            case 'advanceCampaignCapture':
              return api.advanceCampaignCapture(operation.input);
            case 'activateCampaignCapture':
              return api.activateCampaignCapture(operation.input);
            case 'cancelCampaignCapture':
              return api.cancelCampaignCapture(operation.input);
          }
        },
      );
      if (!isCurrent() || !value) return null;
      const expectedCaptureId =
        operation.method === 'startCampaignCapture'
          ? operation.input.operationId
          : operation.input.captureId;
      const expectedAdventureId =
        operation.method === 'startCampaignCapture'
          ? operation.input.adventureId
          : operation.expected.adventureId;
      const expected = operation.method === 'startCampaignCapture' ? null : operation.expected;
      const matchesPreparation = (progress: CampaignCaptureProgress) => {
        api.validateCampaignCapture(progress, expectedCaptureId);
        if (
          progress.request.adventureId !== expectedAdventureId ||
          (expected &&
            (progress.reserved.campaignId !== expected.campaignId ||
              progress.reserved.baseId !== expected.baseId)) ||
          (latest.current.expectedAdventureId &&
            progress.request.adventureId !== latest.current.expectedAdventureId)
        )
          throw Object.assign(new Error('A identidade da preparação não pôde ser confirmada.'), {
            code: 'functions/unavailable',
          });
      };
      if ('kind' in value) {
        if (value.kind === 'aborted') {
          if (operation.method !== 'activateCampaignCapture')
            throw Object.assign(new Error('Resposta de captura incompatível.'), {
              code: 'functions/unavailable',
            });
          matchesPreparation(value.preparation);
        } else if (
          operation.method !== 'activateCampaignCapture' ||
          (value.kind === 'activated'
            ? value.campaign.ownerId !== uid ||
              value.campaign.provenance.kind !== 'original' ||
              value.campaign.activeBaseId !== value.campaign.provenance.baseId ||
              value.campaign.activeBaseId !== expected?.baseId ||
              value.campaign.id !== expected?.campaignId ||
              (Boolean(expectedAdventureId) &&
                value.campaign.provenance.adventureId !== expectedAdventureId)
            : value.kind !== 'already-activated' ||
              typeof value.campaignId !== 'string' ||
              value.campaignId !== expected?.campaignId)
        )
          throw Object.assign(
            new Error('A ativação não pôde ser confirmada. Repita o mesmo pedido.'),
            { code: 'functions/unavailable' },
          );
      } else {
        matchesPreparation(value);
      }
      if (!(await journal(() => clearPendingCampaignCapture(uid, scope, operation))))
        throw new Error('O pedido preservado mudou em outra aba. Reabra a preparação.');
      if (!isCurrent()) return null;
      changePending(null);
      setConflict(false);
      conflictRef.current = false;
      latest.current.onResult?.(value);
      return value;
    } catch (cause) {
      if (!isCurrent()) return null;
      if (
        preserved &&
        operation.method !== 'activateCampaignCapture' &&
        api.definitiveCaptureFailure(cause)
      ) {
        try {
          const cleared = await journal(() => clearPendingCampaignCapture(uid, scope, operation));
          if (cleared && isCurrent()) changePending(null);
        } catch {
          /* Retain the exact request until reconciliation. */
        }
      }
      if (!isCurrent()) return null;
      setError(api.captureErrorMessage(cause));
      setConflict(preserved && api.definitiveCaptureFailure(cause));
      conflictRef.current = preserved && api.definitiveCaptureFailure(cause);
      return null;
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function resolveActivation() {
    const operation = pendingRef.current;
    if (!uid || !isCurrent() || busyRef.current || operation?.method !== 'activateCampaignCapture')
      return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await api.runCampaignCapture(uid, operation.input.captureId, async () => {
        if (!isCurrent()) return null;
        await journal(() => {
          if (JSON.stringify(readPendingCampaignCapture(uid, scope)) !== JSON.stringify(operation))
            throw new Error('O pedido preservado mudou em outra aba. Reabra a preparação.');
        });
        if (!isCurrent()) return null;
        return api.resolveCampaignCaptureActivation(operation.input);
      });
      if (!isCurrent() || !value) return null;
      const confirmed = api.validateCampaignCaptureActivationResolution(
        value,
        uid,
        operation.input,
      );
      if (!(await journal(() => clearPendingCampaignCapture(uid, scope, operation))))
        throw new Error('O pedido preservado mudou em outra aba. Reabra a preparação.');
      if (!isCurrent()) return null;
      changePending(null);
      conflictRef.current = false;
      setConflict(false);
      setHistorical(confirmed);
      return confirmed;
    } catch (cause) {
      if (isCurrent()) setError(api.captureErrorMessage(cause));
      return null;
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return {
    pending,
    historical,
    resolveActivation,
    busy,
    error,
    conflict,
    blocked: Boolean(initial.error),
    execute: (operation: PendingCampaignCaptureOperation) => execute(operation),
    recover: () => (pendingRef.current ? execute(pendingRef.current, true) : Promise.resolve(null)),
    clearConflict: () => {
      conflictRef.current = false;
      setConflict(false);
      setError('');
    },
    isReserved: () => busyRef.current || Boolean(pendingRef.current) || Boolean(initial.error),
  };
}
