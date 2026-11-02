import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  blockErrorMessage,
  isBlockFailureDefinitive,
  type AdventureBlockJob,
  type AdventureBlockMutation,
  type AdventureBlockVerificationProgress,
  type PendingAdventureBlockOperation,
} from '../model/adventureBlock';
import * as api from '../services/adventureBlockService';
import {
  clearPendingAdventureBlockOperation,
  readPendingAdventureBlockOperation,
  writePendingAdventureBlockOperation,
} from '../services/adventureBlockRecovery';
export type AdventureBlockOperationResult = AdventureBlockMutation | AdventureBlockJob;
export interface AdventureBlockMutationCallbacks {
  onResult?: (
    result: AdventureBlockOperationResult,
    operation: PendingAdventureBlockOperation,
  ) => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
  runExclusive?: <T>(work: () => Promise<T>, options?: { recovery: boolean }) => Promise<T>;
}
export function useAdventureBlockMutation(
  adventureId: string,
  sceneId: string,
  callbacks: AdventureBlockMutationCallbacks = {},
) {
  const { user } = useAuth();
  const uid = user?.uid;
  const key = JSON.stringify([uid, adventureId, sceneId]);
  const latest = useRef({ key, callbacks });
  useLayoutEffect(() => {
    latest.current = { key, callbacks };
  });
  const [state, setState] = useState(() => ({
    key,
    busy: false,
    pending: uid ? readPendingAdventureBlockOperation(uid, adventureId, sceneId) : null,
    error: '',
    conflict: false,
    verificationProcessed: null as number | null,
  }));
  const active = useRef(true),
    busy = useRef(false);
  const failure = useRef<unknown>(null);
  const pending = useRef(state.pending);
  useEffect(() => {
    active.current = true;
    busy.current = false;
    pending.current = uid ? readPendingAdventureBlockOperation(uid, adventureId, sceneId) : null;
    setState({
      key,
      busy: false,
      pending: pending.current,
      error: '',
      conflict: false,
      verificationProcessed: null,
    });
    latest.current.callbacks.onPendingChange?.(Boolean(pending.current));
    return () => {
      active.current = false;
    };
  }, [key, uid, adventureId, sceneId]);
  const isCurrent = () => active.current && latest.current.key === key;
  const changePending = (value: PendingAdventureBlockOperation | null) => {
    pending.current = value;
    if (isCurrent()) {
      setState((old) => ({ ...old, pending: value }));
      latest.current.callbacks.onPendingChange?.(Boolean(value));
    }
  };
  const execute = async (
    operation: PendingAdventureBlockOperation,
    recovery = false,
  ): Promise<AdventureBlockOperationResult | null> => {
    if (!uid || !isCurrent() || busy.current || (!recovery && pending.current)) return null;
    busy.current = true;
    failure.current = null;
    setState((old) => ({
      ...old,
      busy: true,
      error: '',
      conflict: false,
      verificationProcessed: operation.method === 'verifyAdventureBlockCount' ? 0 : null,
    }));
    let preserved = recovery;
    const work = async () => {
      if (!recovery) {
        writePendingAdventureBlockOperation(uid, adventureId, sceneId, operation);
        preserved = true;
        changePending(operation);
      }
      return await api.runAdventureBlockOperation(uid, adventureId, sceneId, async () => {
        let result: AdventureBlockOperationResult | AdventureBlockVerificationProgress;
        do {
          if (!isCurrent()) return null;
          switch (operation.method) {
            case 'setAdventureBlockImage':
              result = await api.setAdventureBlockImage(operation.input);
              break;
            case 'createAdventureBlock':
              result = await api.createAdventureBlock(operation.input);
              break;
            case 'updateAdventureBlock':
              result = await api.updateAdventureBlock(operation.input);
              break;
            case 'duplicateAdventureBlock':
              result = await api.duplicateAdventureBlock(operation.input);
              break;
            case 'moveAdventureBlock':
              result = await api.moveAdventureBlock(operation.input);
              break;
            case 'archiveAdventureBlock':
              result = await api.archiveAdventureBlock(operation.input);
              break;
            case 'deleteAdventureBlock':
              result = await api.deleteAdventureBlock(operation.input);
              break;
            case 'verifyAdventureBlockCount':
              result = await api.verifyAdventureBlockCount(operation.input);
              break;
          }
          if (!isCurrent()) return null;
          if (operation.method === 'verifyAdventureBlockCount' && 'processed' in result) {
            if (!Number.isSafeInteger(result.processed) || result.processed < 0)
              throw Object.assign(new Error('A verificação não pôde ser confirmada.'), {
                code: 'functions/unavailable',
              });
            const processed = result.processed;
            setState((old) => ({ ...old, verificationProcessed: processed }));
          }
          const partialVerification =
            operation.method === 'verifyAdventureBlockCount' &&
            'complete' in result &&
            !result.complete &&
            result.sceneWordCount === null;
          if (
            ![result.sceneRevision, result.structureRevision].every(
              (value) => Number.isSafeInteger(value) && value >= 0,
            ) ||
            (!partialVerification &&
              (!Number.isSafeInteger(result.sceneWordCount) ||
                result.sceneWordCount === null ||
                result.sceneWordCount < 0)) ||
            !/^[a-f0-9]{64}$/.test(result.mainBodyHash) ||
            ('block' in result && result.block.sceneId !== sceneId)
          )
            throw Object.assign(new Error('A confirmação do bloco não pôde ser verificada.'), {
              code: 'functions/unavailable',
            });
        } while ('complete' in result && !result.complete);
        if (result.sceneWordCount === null)
          throw Object.assign(new Error('A contagem ainda não foi confirmada.'), {
            code: 'functions/unavailable',
          });
        const confirmed = { ...result, sceneWordCount: result.sceneWordCount };
        await latest.current.callbacks.onResult?.(confirmed, operation);
        if (!isCurrent()) return null;
        clearPendingAdventureBlockOperation(uid, adventureId, sceneId, operation.input.operationId);
        changePending(null);
        return confirmed;
      });
    };
    try {
      const reserve = latest.current.callbacks.runExclusive;
      return reserve ? await reserve(work, { recovery }) : await work();
    } catch (cause) {
      if (!isCurrent()) return null;
      failure.current = cause;
      if (preserved && isBlockFailureDefinitive(cause)) {
        try {
          clearPendingAdventureBlockOperation(
            uid,
            adventureId,
            sceneId,
            operation.input.operationId,
          );
          changePending(null);
        } catch {
          /* Keep the same receipt for explicit reconciliation. */
        }
      } else if (!preserved) {
        const existing = readPendingAdventureBlockOperation(uid, adventureId, sceneId);
        if (existing) changePending(existing);
      }
      setState((old) => ({
        ...old,
        error: blockErrorMessage(cause),
        conflict: preserved && isBlockFailureDefinitive(cause),
      }));
      return null;
    } finally {
      if (isCurrent()) {
        busy.current = false;
        setState((old) => ({ ...old, busy: false }));
      }
    }
  };
  const current =
    state.key === key
      ? state
      : {
          key,
          busy: false,
          pending: null,
          error: '',
          conflict: false,
          verificationProcessed: null,
        };
  return {
    ...current,
    verifying: current.pending?.method === 'verifyAdventureBlockCount',
    getFailure: () => failure.current,
    isReserved: () => busy.current || Boolean(pending.current),
    execute: (operation: PendingAdventureBlockOperation) => execute(operation),
    recover: () => (pending.current ? execute(pending.current, true) : Promise.resolve(null)),
    clearConflict: () => setState((old) => ({ ...old, error: '', conflict: false })),
  };
}
