import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneDocument, SceneSummary, UpdateSceneInput } from '../model/scene';
import { isSceneConflict, isSceneFailureDefinitive, sceneErrorMessage } from '../model/sceneError';
import {
  clearSceneDraft,
  readSceneDraft,
  sceneDraftKey,
  writeSceneDraft,
} from '../services/sceneDraftStorage';
import { getScene, updateScene } from '../services/sceneService';
export function useSceneAutosave(uid: string, initial: SceneDocument) {
  const target = initial.project;
  const key = sceneDraftKey(uid, target, initial.id);
  const [recovery, setRecovery] = useState(() => {
    const draft = readSceneDraft(key);
    return draft && draft.content !== initial.content ? draft : null;
  });
  const [content, setContent] = useState(initial.content);
  const [document, setDocument] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>(
    'saved',
  );
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [remote, setRemote] = useState<SceneDocument | null>(null);
  const active = useRef(true);
  const latest = useRef(initial.content);
  const saved = useRef(initial.content);
  const revision = useRef(initial.revision);
  const pending = useRef<UpdateSceneInput | null>(null);
  const busy = useRef(false);
  const comparisonToken = useRef(0);
  const keepDraft = useCallback(
    (value: string) => {
      setStorageError(
        !writeSceneDraft(key, { content: value, revision: revision.current, savedAt: Date.now() }),
      );
    },
    [key],
  );
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const change = useCallback(
    (value: string) => {
      latest.current = value;
      setContent(value);
      keepDraft(value);
      setStatus((previous) =>
        previous === 'conflict' || previous === 'error' || previous === 'saving'
          ? previous
          : 'dirty',
      );
    },
    [keepDraft],
  );
  const save = useCallback(async () => {
    if (busy.current || recovery || !active.current) return;
    if (!pending.current && latest.current === saved.current) {
      setStatus('saved');
      return;
    }
    const request = pending.current ?? {
      target: { kind: initial.project.kind, id: initial.project.id },
      sceneId: initial.id,
      operationId: crypto.randomUUID(),
      expectedRevision: revision.current,
      patch: { content: latest.current },
    };
    pending.current = request;
    busy.current = true;
    setStatus('saving');
    setError('');
    try {
      const result = await updateScene(request);
      if (!active.current) return;
      revision.current = result.scene.revision;
      saved.current = request.patch.content ?? saved.current;
      pending.current = null;
      setDocument((previous) => ({
        ...previous,
        ...result.scene,
        content: saved.current,
        projectRevision: result.projectRevision,
      }));
      if (latest.current === saved.current) {
        clearSceneDraft(key, saved.current);
        setStatus('saved');
      } else {
        keepDraft(latest.current);
        setStatus('dirty');
      }
    } catch (failure) {
      if (!active.current) return;
      setError(sceneErrorMessage(failure));
      setStatus(isSceneConflict(failure) ? 'conflict' : 'error');
      if (isSceneFailureDefinitive(failure)) pending.current = null;
    } finally {
      busy.current = false;
    }
  }, [initial.id, initial.project.id, initial.project.kind, key, keepDraft, recovery]);
  useEffect(() => {
    if (recovery || status !== 'dirty') return;
    const timer = setTimeout(() => void save(), 600);
    return () => clearTimeout(timer);
  }, [content, recovery, status, save]);
  useEffect(() => {
    if (status === 'saved' && !recovery) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status, recovery]);
  const recover = () => {
    if (!recovery) return;
    const draft = recovery;
    setRecovery(null);
    latest.current = draft.content;
    setContent(draft.content);
    keepDraft(draft.content);
    if (draft.revision !== revision.current) {
      setStatus('conflict');
      setError('O texto remoto mudou desde este rascunho. Compare antes de salvar.');
    } else setStatus('dirty');
  };
  const discardRecovery = () => {
    if (recovery) clearSceneDraft(key, recovery.content);
    setRecovery(null);
  };
  const compare = async () => {
    const token = ++comparisonToken.current;
    setError('');
    try {
      const current = await getScene({
        target: { kind: initial.project.kind, id: initial.project.id },
        sceneId: initial.id,
      });
      if (!active.current || token !== comparisonToken.current) return;
      if (
        !current ||
        current.ownerId !== uid ||
        current.id !== initial.id ||
        current.project.kind !== initial.project.kind ||
        current.project.id !== initial.project.id
      )
        throw new Error('Esta cena está indisponível. Seu rascunho foi preservado.');
      setRemote(current);
    } catch (failure) {
      if (active.current) setError(sceneErrorMessage(failure));
    }
  };
  const resolve = (keepLocal: boolean) => {
    if (!remote) return;
    revision.current = remote.revision;
    saved.current = remote.content;
    pending.current = null;
    setDocument(remote);
    if (keepLocal) {
      keepDraft(latest.current);
      setStatus(latest.current === remote.content ? 'saved' : 'dirty');
    } else {
      const localContent = latest.current;
      latest.current = remote.content;
      setContent(remote.content);
      clearSceneDraft(key, localContent);
      setStatus('saved');
    }
    setRemote(null);
    setError('');
  };
  const acceptMetadata = (scene: SceneSummary) => {
    revision.current = scene.revision;
    setDocument((previous) => ({ ...previous, ...scene }));
  };
  return {
    closeComparison: () => {
      setRemote(null);
      if (status === 'conflict') setError('O texto remoto mudou. Compare antes de salvar.');
    },
    acceptMetadata,
    content,
    document,
    status,
    error,
    storageError,
    recovery,
    remote,
    change,
    save,
    recover,
    discardRecovery,
    compare,
    resolve,
  };
}
