import { useEffect, useRef, useState } from 'react';
import { runWorkActivity } from '../services/workActivityQueue';
import { useAuth } from '@/features/auth';
import type { RecordWorkActivityInput, WorkResource, WorkTarget } from '../model/workProgress';
import { isWorkConflict, isWorkFailureDefinitive, workErrorMessage } from '../model/workProgress';
import { getWorkProgress, recordWorkActivity } from '../services/workProgressService';
export interface WorkActivityFeedback {
  loading: boolean;
  error: string;
  conflict: boolean;
  retry: () => void;
}
export function useWorkActivity({
  target,
  resource,
  enabled = true,
}: {
  target: WorkTarget;
  resource: WorkResource;
  enabled?: boolean;
}): WorkActivityFeedback {
  const { user } = useAuth();
  const uid = user?.uid;
  const targetKind = target.kind,
    targetId = target.id,
    resourceKind = resource.kind,
    resourceId = resource.kind === 'project' ? '' : resource.id;
  const identity = [
    uid,
    target.kind,
    target.id,
    resource.kind,
    resource.kind === 'project' ? '' : resource.id,
  ].join(':');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    identity: string;
    loading: boolean;
    error: string;
    conflict: boolean;
  }>();
  const request = useRef<{ identity: string; input: RecordWorkActivityInput } | null>(null);
  useEffect(() => {
    if (!uid || !enabled) return;
    let active = true;
    const scope: WorkTarget = { kind: targetKind, id: targetId };
    const location: WorkResource =
      resourceKind === 'project' ? { kind: 'project' } : { kind: resourceKind, id: resourceId };
    async function record() {
      if (!active) return;
      await Promise.resolve();
      if (!active) return;
      setResult({ identity, loading: true, error: '', conflict: false });
      try {
        let input = request.current?.identity === identity ? request.current.input : null;
        if (!input) {
          const progress = await getWorkProgress({ target: scope });
          if (!active) return;
          if (
            !progress ||
            progress.ownerId !== uid ||
            progress.target.id !== targetId ||
            progress.target.kind !== targetKind
          )
            throw new Error('O projeto não está disponível para registrar a retomada.');
          input = {
            target: scope,
            resource: location,
            operationId: crypto.randomUUID(),
            expectedActivityRevision: progress.activityRevision,
          };
          request.current = { identity, input };
        }
        await recordWorkActivity(input);
        if (active) {
          request.current = null;
          setResult({ identity, loading: false, error: '', conflict: false });
        }
      } catch (cause) {
        if (active) {
          if (isWorkFailureDefinitive(cause)) request.current = null;
          setResult({
            identity,
            loading: false,
            error: workErrorMessage(cause),
            conflict: isWorkConflict(cause),
          });
        }
      }
    }
    void runWorkActivity(uid, record);
    return () => {
      active = false;
    };
  }, [identity, uid, enabled, attempt, targetKind, targetId, resourceKind, resourceId]);
  const current = enabled && result?.identity === identity ? result : undefined;
  return {
    loading: current?.loading ?? false,
    error: current?.error ?? '',
    conflict: current?.conflict ?? false,
    retry: () => setAttempt((n) => n + 1),
  };
}
