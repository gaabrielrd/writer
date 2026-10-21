import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  blockContentHash,
  blockErrorMessage,
  sameBlockResource,
  type AdventureBlockDocument,
  type AdventureBlockSummary,
  type AdventureBlockTotals,
} from '../model/adventureBlock';
import {
  clearAdventureBlockDraft,
  readAdventureBlockDraft,
  writeAdventureBlockDraft,
} from '../services/adventureBlockRecovery';
import { getAdventureBlock } from '../services/adventureBlockService';
import { useAdventureBlockMutation } from './useAdventureBlockMutation';
export function useAdventureBlockDraft(
  uid: string,
  adventureId: string,
  initial: AdventureBlockDocument,
) {
  const [document, setDocument] = useState(initial);
  const [content, setContent] = useState(initial.content);
  const [recovery, setRecovery] = useState(() => {
    const draft = readAdventureBlockDraft(uid, adventureId, initial.sceneId, initial.resource);
    return draft && draft.content !== initial.content ? draft : null;
  });
  const [storageError, setStorageError] = useState(false);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'error' | 'conflict'>('saved');
  const [error, setError] = useState('');
  const [remote, setRemote] = useState<AdventureBlockDocument | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [exclusiveBusy, setExclusiveBusy] = useState(false);
  const active = useRef(true),
    reserved = useRef(false),
    comparison = useRef(0);
  const saved = useRef(initial.content),
    confirmedBodyHash = useRef(initial.bodyHash),
    latest = useRef(initial.content),
    currentDocument = useRef(initial),
    recoveryRef = useRef(recovery);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const keepDraft = (value: string) =>
    setStorageError(
      !writeAdventureBlockDraft(uid, adventureId, initial.sceneId, initial.resource, {
        content: value,
        revision: currentDocument.current.revision,
        savedAt: Date.now(),
      }),
    );
  const acceptMetadata = (totals: AdventureBlockTotals, block?: AdventureBlockSummary) => {
    if (!active.current) return;
    if (
      block &&
      sameBlockResource(block.resource, initial.resource) &&
      block.bodyHash !== confirmedBodyHash.current
    ) {
      keepDraft(latest.current);
      setStatus('conflict');
      setError(
        'O texto deste bloco mudou em outro dispositivo. Seu texto local foi preservado; compare as versões antes de continuar a escrita.',
      );
      return;
    }
    const next = {
      ...currentDocument.current,
      ...totals,
      ...(block && sameBlockResource(block.resource, initial.resource) ? block : {}),
    };
    currentDocument.current = next;
    setDocument(next);
  };
  const mutation = useAdventureBlockMutation(adventureId, initial.sceneId, {
    onResult: async (result, operation) => {
      if (!active.current) return;
      if ('block' in result) {
        const own = sameBlockResource(result.block.resource, initial.resource);
        if (
          own &&
          operation.method === 'updateAdventureBlock' &&
          typeof operation.input.patch.content === 'string'
        ) {
          const written = operation.input.patch.content;
          const hash = await blockContentHash(written);
          if (!active.current) return;
          if (hash !== result.block.bodyHash)
            throw Object.assign(
              new Error(
                'O texto confirmado não corresponde ao pedido. Confirme o mesmo pedido novamente.',
              ),
              { code: 'functions/unavailable' },
            );
          saved.current = written;
          confirmedBodyHash.current = hash;
          currentDocument.current = { ...currentDocument.current, content: written };
          acceptMetadata(result, result.block);
          setError('');
          if (recoveryRef.current) {
            const retained = recoveryRef.current.content !== written ? recoveryRef.current : null;
            latest.current = written;
            setContent(written);
            setRecovery(retained);
            recoveryRef.current = retained;
          }
          if (latest.current === written) {
            clearAdventureBlockDraft(uid, adventureId, initial.sceneId, initial.resource, written);
            setStatus('saved');
          } else {
            keepDraft(latest.current);
            setStatus('dirty');
          }
        } else acceptMetadata(result, result.block);
      } else {
        acceptMetadata(result);
        if (
          operation.method === 'deleteAdventureBlock' &&
          operation.input.blockId === initial.resource.id
        )
          setDeleted(true);
      }
    },
  });
  const getConfirmedContent = () =>
    !active.current ||
    recoveryRef.current ||
    remote ||
    status !== 'saved' ||
    latest.current !== saved.current ||
    mutation.isReserved()
      ? null
      : saved.current;
  const getConfirmedSnapshot = () => {
    const content = getConfirmedContent();
    return content === null
      ? null
      : {
          content,
          revision: currentDocument.current.revision,
          bodyHash: confirmedBodyHash.current,
        };
  };
  const change = (value: string) => {
    if (!active.current || reserved.current || mutation.isReserved()) return;
    latest.current = value;
    setContent(value);
    keepDraft(value);
    if (status !== 'conflict') setStatus(value === saved.current ? 'saved' : 'dirty');
  };
  const save = async () => {
    if (
      !active.current ||
      reserved.current ||
      mutation.isReserved() ||
      recoveryRef.current ||
      status === 'conflict'
    )
      return;
    if (latest.current === saved.current) {
      setStatus('saved');
      return;
    }
    const result = await mutation.execute({
      method: 'updateAdventureBlock',
      input: {
        adventureId,
        resource: initial.resource,
        operationId: crypto.randomUUID(),
        expectedRevision: currentDocument.current.revision,
        patch: { content: latest.current },
      },
    });
    if (!active.current || result) return;
    const cause = mutation.getFailure();
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? String(cause.code).replace(/^functions\//, '')
        : '';
    setStatus(code === 'failed-precondition' ? 'conflict' : 'error');
    setError(blockErrorMessage(cause));
  };
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (status !== 'dirty' || recovery || mutation.pending || mutation.busy || exclusiveBusy)
      return;
    const timer = setTimeout(() => void saveRef.current(), 600);
    return () => clearTimeout(timer);
  }, [content, status, recovery, mutation.pending, mutation.busy, exclusiveBusy]);
  useEffect(() => {
    if (status === 'saved' && !recovery && !mutation.pending && !mutation.busy && !exclusiveBusy)
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status, recovery, mutation.pending, mutation.busy, exclusiveBusy]);
  const compare = async () => {
    const token = ++comparison.current;
    setError('');
    try {
      const value = await getAdventureBlock({ adventureId, resource: initial.resource });
      if (!active.current || comparison.current !== token) return;
      if (
        !value ||
        value.sceneId !== initial.sceneId ||
        !sameBlockResource(value.resource, initial.resource)
      )
        throw new Error('Este bloco está indisponível. Seu rascunho foi preservado.');
      const hash = await blockContentHash(value.content);
      if (!active.current || comparison.current !== token) return;
      if (hash !== value.bodyHash)
        throw new Error('O texto remoto não pôde ser confirmado. Seu rascunho foi preservado.');
      setRemote(value);
    } catch (cause) {
      if (active.current) setError(blockErrorMessage(cause));
    }
  };
  const resolve = (keepLocal: boolean) => {
    if (!remote || mutation.isReserved() || reserved.current) return;
    const old = latest.current;
    saved.current = remote.content;
    confirmedBodyHash.current = remote.bodyHash;
    currentDocument.current = remote;
    setDocument(remote);
    if (keepLocal) {
      keepDraft(latest.current);
      setStatus(latest.current === remote.content ? 'saved' : 'dirty');
    } else {
      latest.current = remote.content;
      setContent(remote.content);
      clearAdventureBlockDraft(uid, adventureId, initial.sceneId, initial.resource, old);
      setStatus('saved');
    }
    setRemote(null);
    setError('');
    mutation.clearConflict();
  };
  async function runExclusive<T>(
    work: () => Promise<T>,
    options?: { recovery: boolean },
  ): Promise<T> {
    const recoveringOwnRequest = options?.recovery && mutation.pending && !mutation.busy;
    if (
      reserved.current ||
      (!recoveringOwnRequest && (mutation.isReserved() || getConfirmedContent() === null))
    )
      throw new Error('Confirme o texto e resolva a recuperação antes de continuar.');
    reserved.current = true;
    setExclusiveBusy(true);
    try {
      return await work();
    } finally {
      reserved.current = false;
      if (active.current) setExclusiveBusy(false);
    }
  }
  const acceptConfirmedContent = (value: {
    content: string;
    revision: number;
    sceneWordCount: number;
    bodyHash: string;
    wordCount: number;
  }) => {
    if (
      !active.current ||
      !reserved.current ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !Number.isSafeInteger(value.sceneWordCount) ||
      value.sceneWordCount < 0
    )
      throw new Error('Esta confirmação não pertence ao bloco aberto.');
    const next = {
      ...currentDocument.current,
      content: value.content,
      revision: value.revision,
      sceneWordCount: value.sceneWordCount,
      wordCount: value.wordCount,
      bodyHash: value.bodyHash,
      bodyBytes: new TextEncoder().encode(value.content).byteLength,
    };
    currentDocument.current = next;
    saved.current = value.content;
    confirmedBodyHash.current = value.bodyHash;
    latest.current = value.content;
    setDocument(next);
    setContent(value.content);
    setStatus('saved');
    setRemote(null);
    setError('');
    clearAdventureBlockDraft(uid, adventureId, initial.sceneId, initial.resource, value.content);
  };
  return {
    document,
    content,
    status,
    error,
    recovery,
    remote,
    storageError,
    deleted,
    exclusiveBusy,
    mutation,
    change,
    save,
    compare,
    resolve,
    getConfirmedContent,
    getConfirmedSnapshot,
    runExclusive,
    acceptConfirmedContent,
    acceptMetadata,
    closeComparison: () => {
      comparison.current++;
      setRemote(null);
    },
    recoverDraft: () => {
      if (!recovery || mutation.isReserved()) return;
      const draft = recovery;
      latest.current = draft.content;
      setContent(draft.content);
      setRecovery(null);
      recoveryRef.current = null;
      keepDraft(draft.content);
      setStatus(draft.revision === currentDocument.current.revision ? 'dirty' : 'conflict');
      if (draft.revision !== currentDocument.current.revision)
        setError('O texto remoto mudou desde este rascunho. Compare antes de salvar.');
    },
    discardDraft: () => {
      if (!recovery || mutation.isReserved()) return;
      clearAdventureBlockDraft(
        uid,
        adventureId,
        initial.sceneId,
        initial.resource,
        recovery.content,
      );
      setRecovery(null);
      recoveryRef.current = null;
    },
  };
}
