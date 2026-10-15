import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import type {
  CampaignNoteMutationResult,
  PendingCampaignNoteOperation,
} from '../model/campaignNote';
import * as api from '../services/campaignNotesService';
import {
  readPendingCampaignNote,
  reserveCampaignNote,
  clearPendingCampaignNote,
  observePendingCampaignNotes,
  noteLocksAvailable,
} from '../services/campaignNotesRecovery';
export interface CampaignNoteMutationCallbacks {
  onConfirmed?: (
    result: CampaignNoteMutationResult,
    operation: PendingCampaignNoteOperation,
  ) => void;
  onRejected?: (operation: PendingCampaignNoteOperation, reason: string | undefined) => void;
  getCollectionRevision?: () => number | undefined;
}
export function useCampaignNoteMutation(
  campaignId: string,
  callbacks: CampaignNoteMutationCallbacks = {},
) {
  const { user } = useAuth(),
    uid = user?.uid,
    key = JSON.stringify([uid, campaignId]);
  const identity = useRef(key),
    active = useRef(true),
    busyRef = useRef(false),
    latest = useRef(callbacks),
    conflictRef = useRef(false);
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
      return { pending: uid ? readPendingCampaignNote(uid, campaignId) : null, error: '' };
    } catch (cause) {
      return { pending: null, error: api.notesMessage(cause) };
    }
  });
  const [pending, setPending] = useState(initial.pending),
    pendingRef = useRef(initial.pending),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initial.error),
    [blocked, setBlocked] = useState(Boolean(initial.error)),
    [conflict, setConflict] = useState(false),
    [campaignChanged, setCampaignChanged] = useState(false);
  const isCurrent = useCallback(() => active.current && identity.current === key, [key]);
  const adoptPending = useCallback(
    (value: PendingCampaignNoteOperation | null) => {
      pendingRef.current = value;
      if (isCurrent()) setPending(value);
    },
    [isCurrent],
  );
  useEffect(() => {
    if (!uid) return;
    return observePendingCampaignNotes(uid, campaignId, () => {
      if (!isCurrent()) return;
      try {
        adoptPending(readPendingCampaignNote(uid, campaignId));
      } catch (cause) {
        setBlocked(true);
        setError(api.notesMessage(cause));
      }
    });
  }, [uid, campaignId, key, adoptPending, isCurrent]);
  useEffect(() => {
    if (!busy && !pending && !blocked) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, pending, blocked]);
  async function execute(
    operation: PendingCampaignNoteOperation,
    replay = false,
  ): Promise<CampaignNoteMutationResult | null> {
    if (
      !uid ||
      !isCurrent() ||
      busyRef.current ||
      blocked ||
      (!replay && (pendingRef.current || conflictRef.current))
    )
      return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let preserved = false;
    try {
      const reservation = await reserveCampaignNote(uid, operation, isCurrent);
      if (!isCurrent()) return null;
      adoptPending(reservation.pending);
      if (!reservation.reserved) {
        setError(
          'Há outro pedido preservado para esta campanha. Seus campos foram mantidos. Confirme o pedido pendente antes de continuar.',
        );
        return null;
      }
      preserved = true;
      const value = await api.runNoteOperation<CampaignNoteMutationResult | null>(
        uid,
        campaignId,
        () => {
          if (!isCurrent()) return Promise.resolve(null);
          return operation.method === 'saveCampaignNote'
            ? api.saveCampaignNote(operation.input)
            : api.deleteCampaignNote(operation.input);
        },
      );
      if (!isCurrent() || !value) return null;
      api.validateNoteMutation(value, uid, operation);
      const minimum = latest.current.getCollectionRevision?.();
      if (minimum !== undefined && value.collectionRevision < minimum)
        throw Object.assign(
          new Error(
            'A confirmação pertence a uma revisão anterior da lista. Repita o mesmo pedido.',
          ),
          { code: 'functions/unavailable' },
        );
      await clearPendingCampaignNote(uid, campaignId, operation.input.operationId, isCurrent);
      if (!isCurrent()) return null;
      const remaining = readPendingCampaignNote(uid, campaignId);
      const latestMinimum = latest.current.getCollectionRevision?.();
      if (latestMinimum !== undefined && value.collectionRevision < latestMinimum) {
        if (remaining) adoptPending(remaining);
        else {
          const recovery = await reserveCampaignNote(uid, operation, isCurrent);
          if (!isCurrent()) return null;
          adoptPending(recovery.pending);
        }
        throw Object.assign(
          new Error(
            'Uma revisão mais nova da lista foi observada. O pedido foi preservado para confirmação.',
          ),
          { code: 'functions/unavailable' },
        );
      }
      adoptPending(remaining);
      setConflict(false);
      conflictRef.current = false;
      setCampaignChanged(false);
      latest.current.onConfirmed?.(value, operation);
      return value;
    } catch (cause) {
      if (!isCurrent()) return null;
      const definitive = preserved && api.definitiveNoteFailure(cause),
        reason = api.noteErrorReason(cause);
      if (definitive) {
        try {
          await clearPendingCampaignNote(uid, campaignId, operation.input.operationId, isCurrent);
          if (!isCurrent()) return null;
          adoptPending(readPendingCampaignNote(uid, campaignId));
        } catch {
          /* Keep the original request when journal cleanup cannot be confirmed. */
        }
        if (!isCurrent()) return null;
        const hasConflict = reason === 'revision-conflict' || reason === 'campaign-changed';
        setConflict(hasConflict);
        conflictRef.current = hasConflict;
        setCampaignChanged(reason === 'campaign-changed');
        latest.current.onRejected?.(operation, reason);
      }
      setError(api.notesMessage(cause));
      return null;
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  return {
    pending,
    busy,
    error,
    blocked,
    conflict,
    campaignChanged,
    locksAvailable: noteLocksAvailable(),
    execute: (operation: PendingCampaignNoteOperation) => execute(operation),
    recover: () => (pendingRef.current ? execute(pendingRef.current, true) : Promise.resolve(null)),
    clearConflict: () => {
      conflictRef.current = false;
      setConflict(false);
      setCampaignChanged(false);
      setError('');
    },
    isReserved: () => busyRef.current || Boolean(pendingRef.current) || blocked,
  };
}
