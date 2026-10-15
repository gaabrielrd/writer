import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  isUncertainHistoryFailure,
  sameVersionResource,
  sameVersionTarget,
  workHistoryHash,
  workHistoryMessage,
  type CompleteWorkVersion,
  type PendingWorkHistoryOperation,
  type VersionEditorAdapter,
  type VersionResource,
  type VersionSource,
  type VersionSummary,
  type VersionTarget,
} from '../model/workHistory';
import {
  clearPendingWorkHistoryOperation,
  readPendingWorkHistoryOperation,
  writePendingWorkHistoryOperation,
} from '../services/workHistoryRecovery';
import {
  copyWorkVersionText,
  createWorkVersion,
  deleteWorkVersion,
  getWorkVersionSource,
  listWorkVersions,
  readCompleteWorkVersion,
  restoreWorkVersion,
} from '../services/workHistoryService';

export interface UseWorkHistoryOptions {
  open: boolean;
  target: VersionTarget;
  resource?: VersionResource;
  editor?: VersionEditorAdapter;
  onPendingChange?: (pending: boolean) => void;
}
type State = {
  key: string;
  items: VersionSummary[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  listError: string;
  moreError: string;
  selected: CompleteWorkVersion | null;
  selectedId: string | null;
  reading: boolean;
  readError: string;
  source: VersionSource | null;
  sourceLoading: boolean;
  sourceError: string;
  pending: PendingWorkHistoryOperation | null;
  busy: boolean;
  error: string;
  notice: string;
  conflict: boolean;
};
const newState = (key: string, pending: PendingWorkHistoryOperation | null): State => ({
  key,
  items: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  listError: '',
  moreError: '',
  selected: null,
  selectedId: null,
  reading: false,
  readError: '',
  source: null,
  sourceLoading: false,
  sourceError: '',
  pending,
  busy: false,
  error: '',
  notice: '',
  conflict: false,
});
const operationResource = (operation: PendingWorkHistoryOperation) =>
  operation.kind === 'delete' ? operation.resource : operation.input.resource;
const invalidResponse = () =>
  Object.assign(
    new Error('A confirmação recebida não pôde ser verificada. Confirme o mesmo pedido novamente.'),
    { code: 'functions/unavailable' },
  );
const accessDenied = (cause: unknown) => {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return code === 'permission-denied' || code === 'unauthenticated';
};

export function useWorkHistory(options: UseWorkHistoryOptions) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { target, resource, open } = options;
  const targetKind = target.kind,
    targetId = target.id,
    resourceKind = resource?.kind,
    resourceId = resource?.id;
  const identity = JSON.stringify([uid, target.kind, target.id, resource?.kind, resource?.id]);
  const currentOptions = useRef({ ...options, identity });
  currentOptions.current = { ...options, identity };
  const [state, setState] = useState(() =>
    newState(identity, uid ? readPendingWorkHistoryOperation(uid, target, resource) : null),
  );
  const [attempt, setAttempt] = useState(0);
  const scope = useRef<{ identity: string; active: boolean }>({ identity, active: true });
  const selection = useRef(0);
  const mutationBusy = useRef(false);
  const pendingRef = useRef(state.pending);
  const current = state.key === identity ? state : newState(identity, null);
  const isCurrent = () =>
    scope.current.active &&
    scope.current.identity === identity &&
    currentOptions.current.identity === identity;
  const update = (patch: Partial<State>) => {
    if (isCurrent())
      setState((previous) => (previous.key === identity ? { ...previous, ...patch } : previous));
  };
  useEffect(() => {
    const control = { identity, active: true };
    scope.current = control;
    const pending = uid
      ? readPendingWorkHistoryOperation(
          uid,
          { kind: targetKind, id: targetId },
          resourceKind && resourceId ? { kind: resourceKind, id: resourceId } : undefined,
        )
      : null;
    pendingRef.current = pending;
    mutationBusy.current = false;
    setState(newState(identity, pending));
    currentOptions.current.onPendingChange?.(Boolean(pending));
    return () => {
      control.active = false;
    };
    // Identity contains the full scope. Opening the dialog must not clear a pending receipt.
  }, [identity, uid, targetKind, targetId, resourceKind, resourceId]);

  useEffect(() => {
    if (!open || !uid) return;
    let active = true;
    const valid = () =>
      active && scope.current.active && currentOptions.current.identity === identity;
    const scopeTarget: VersionTarget = { kind: targetKind, id: targetId };
    const scopeResource: VersionResource | undefined =
      resourceKind && resourceId ? { kind: resourceKind, id: resourceId } : undefined;
    async function load() {
      setState((previous) => ({ ...previous, loading: true, listError: '', moreError: '' }));
      try {
        const page = await listWorkVersions({
          target: scopeTarget,
          ...(scopeResource ? { resource: scopeResource } : {}),
          cursor: null,
          limit: 25,
        });
        if (!valid()) return;
        if (
          !page.items.every(
            (version) =>
              sameVersionTarget(version.target, scopeTarget) &&
              (!scopeResource || sameVersionResource(version.resource, scopeResource)),
          )
        )
          throw invalidResponse();
        setState((previous) => ({
          ...previous,
          items: page.items,
          nextCursor: page.nextCursor,
          loading: false,
        }));
      } catch (cause) {
        if (valid())
          setState((previous) => ({
            ...previous,
            loading: false,
            listError: workHistoryMessage(cause),
            items: [],
            nextCursor: null,
            selected: null,
            source: null,
          }));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, identity, uid, targetKind, targetId, resourceKind, resourceId, attempt]);

  async function verifiedSource(wanted: VersionResource, valid = isCurrent) {
    if (!valid()) return null;
    const source = await getWorkVersionSource({ target, resource: wanted });
    if (!valid() || !source) return null;
    if (
      !sameVersionTarget(source.target, target) ||
      !sameVersionResource(source.resource, wanted) ||
      !/^[a-f0-9]{64}$/.test(source.sourceToken) ||
      typeof source.content !== 'string' ||
      (wanted.kind === 'chapter'
        ? source.revision !== null
        : !Number.isSafeInteger(source.revision) || source.revision === null || source.revision < 0)
    )
      throw invalidResponse();
    const hash = await workHistoryHash(source.content);
    if (!valid()) return null;
    if (hash !== source.contentHash) throw invalidResponse();
    return source;
  }
  useEffect(() => {
    if (!open || !uid || !resource) return;
    let active = true;
    const token = ++selection.current;
    const valid = () => active && isCurrent() && selection.current === token;
    update({ sourceLoading: true, sourceError: '', source: null });
    void verifiedSource(resource, valid)
      .then((source) => {
        if (valid()) update({ source, sourceLoading: false });
      })
      .catch((cause: unknown) => {
        if (valid()) update({ sourceLoading: false, sourceError: workHistoryMessage(cause) });
      });
    return () => {
      active = false;
    };
    // Helpers are scoped by identity and only dereference current adapter/callback refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identity, uid, resource?.kind, resource?.id]);
  useEffect(() => {
    if (!open) {
      selection.current++;
      setState((previous) =>
        previous.key === identity
          ? {
              ...previous,
              selected: null,
              selectedId: null,
              reading: false,
              source: null,
              readError: '',
            }
          : previous,
      );
    }
  }, [open, identity]);

  const loadMore = async () => {
    if (!uid || mutationBusy.current || current.loadingMore || !current.nextCursor || !isCurrent())
      return;
    const cursor = current.nextCursor;
    update({ loadingMore: true, moreError: '' });
    try {
      const page = await listWorkVersions({
        target,
        ...(resource ? { resource } : {}),
        cursor,
        limit: 25,
      });
      if (!isCurrent()) return;
      if (
        !page.items.every(
          (version) =>
            sameVersionTarget(version.target, target) &&
            (!resource || sameVersionResource(version.resource, resource)),
        )
      )
        throw invalidResponse();
      setState((previous) => {
        if (previous.key !== identity) return previous;
        const seen = new Set(previous.items.map((version) => version.id));
        return {
          ...previous,
          items: [...previous.items, ...page.items.filter((version) => !seen.has(version.id))],
          nextCursor: page.nextCursor,
          loadingMore: false,
        };
      });
    } catch (cause) {
      update({ loadingMore: false, moreError: workHistoryMessage(cause) });
    }
  };
  const select = async (version: VersionSummary) => {
    if (!uid || !isCurrent() || !sameVersionTarget(version.target, target)) return;
    const token = ++selection.current;
    const valid = () => isCurrent() && currentOptions.current.open && selection.current === token;
    update({
      selected: null,
      selectedId: version.id,
      reading: true,
      readError: '',
      source: null,
      sourceLoading: true,
      sourceError: '',
      error: '',
      notice: '',
    });
    const results = await Promise.allSettled([
      readCompleteWorkVersion({ target, versionId: version.id }, valid),
      verifiedSource(version.resource, valid),
    ]);
    if (!valid()) return;
    const body = results[0],
      source = results[1];
    if (
      (body.status === 'rejected' && accessDenied(body.reason)) ||
      (source.status === 'rejected' && accessDenied(source.reason))
    ) {
      update({
        selected: null,
        reading: false,
        source: null,
        sourceLoading: false,
        readError:
          'Este histórico não está disponível. Reabra o projeto para verificar seu acesso.',
      });
      return;
    }
    if (
      body.status === 'fulfilled' &&
      body.value &&
      sameVersionResource(body.value.version.resource, version.resource)
    )
      update({ selected: body.value, reading: false });
    else
      update({
        reading: false,
        readError:
          body.status === 'rejected'
            ? workHistoryMessage(body.reason)
            : 'Esta versão está indisponível.',
      });
    update({
      source: source.status === 'fulfilled' ? source.value : null,
      sourceLoading: false,
      sourceError: source.status === 'rejected' ? workHistoryMessage(source.reason) : '',
    });
  };
  const compareCurrent = async () => {
    const wanted = current.selected?.version.resource ?? resource;
    if (!wanted || !uid || !isCurrent()) return;
    const token = ++selection.current;
    const valid = () => isCurrent() && selection.current === token;
    update({ sourceLoading: true, sourceError: '', source: null, error: '' });
    try {
      const source = await verifiedSource(wanted, valid);
      if (valid()) update({ source, sourceLoading: false, conflict: false });
    } catch (cause) {
      if (valid()) update({ sourceLoading: false, sourceError: workHistoryMessage(cause) });
    }
  };

  function setPending(pending: PendingWorkHistoryOperation | null) {
    pendingRef.current = pending;
    update({ pending });
    currentOptions.current.onPendingChange?.(Boolean(pending));
  }
  async function execute(pending: PendingWorkHistoryOperation, recovering: boolean) {
    if (!uid || mutationBusy.current || !isCurrent()) return;
    mutationBusy.current = true;
    update({ busy: true, error: '', notice: '' });
    const adapter = currentOptions.current.editor;
    const editable = adapter && sameVersionResource(adapter.resource, operationResource(pending));
    let persisted = recovering;
    const work = async () => {
      if (!isCurrent()) return;
      if (!recovering && pending.kind !== 'delete') {
        const observed = current.source;
        if (
          !editable ||
          !observed ||
          adapter.blockedReason ||
          adapter.getConfirmedContent() !== observed.content ||
          observed.sourceToken !== pending.input.expectedSourceToken
        )
          throw new Error('Salve e confirme o texto atual antes de criar ou restaurar uma versão.');
      }
      if (!recovering) {
        writePendingWorkHistoryOperation(uid, pending);
        persisted = true;
        setPending(pending);
      }
      if (!isCurrent()) return;
      if (pending.kind === 'create') {
        const result = await createWorkVersion(pending.input);
        if (!isCurrent()) return;
        if (
          !result.version ||
          !sameVersionTarget(result.version.target, target) ||
          !sameVersionResource(result.version.resource, pending.input.resource)
        )
          throw invalidResponse();
        update({
          items: [result.version, ...current.items.filter((item) => item.id !== result.version.id)],
          notice: 'Versão guardada. O texto do manuscrito permanece igual.',
        });
      } else if (pending.kind === 'restore') {
        const result = await restoreWorkVersion(pending.input);
        if (!isCurrent()) return;
        if (
          !result.source ||
          !sameVersionTarget(result.source.target, target) ||
          !sameVersionResource(result.source.resource, pending.input.resource) ||
          !/^[a-f0-9]{64}$/.test(result.source.sourceToken) ||
          (pending.input.resource.kind === 'scene'
            ? !Number.isSafeInteger(result.source.revision) ||
              result.source.revision === null ||
              result.source.revision < 0
            : result.source.revision !== null)
        )
          throw invalidResponse();
        const hash = await workHistoryHash(result.source.content);
        if (!isCurrent()) return;
        if (
          hash !== result.source.contentHash ||
          !result.previousVersion ||
          !sameVersionTarget(result.previousVersion.target, target) ||
          !sameVersionResource(result.previousVersion.resource, pending.input.resource)
        )
          throw invalidResponse();
        if (editable) await adapter.acceptRestored(result.source);
        if (!isCurrent()) return;
        update({
          source: result.source,
          notice: 'Texto restaurado. A versão anterior foi guardada para recuperação.',
          items: [
            result.previousVersion,
            ...current.items.filter((item) => item.id !== result.previousVersion.id),
          ],
        });
      } else {
        if (current.selectedId === pending.input.versionId) {
          selection.current++;
          update({ selected: null, selectedId: null, reading: false, readError: '' });
        }
        let complete = false;
        while (!complete && isCurrent()) {
          const result = await deleteWorkVersion(pending.input);
          if (!isCurrent()) return;
          if (
            typeof result.complete !== 'boolean' ||
            !Number.isSafeInteger(result.processed) ||
            result.processed < 0
          )
            throw invalidResponse();
          complete = result.complete;
        }
        if (!isCurrent()) return;
        update({
          items: current.items.filter((item) => item.id !== pending.input.versionId),
          notice: 'Versão excluída.',
        });
      }
      clearPendingWorkHistoryOperation(uid, pending);
      setPending(null);
    };
    try {
      if (pending.kind !== 'delete' && editable)
        await adapter.runExclusive(work, { recovery: recovering });
      else await work();
    } catch (cause) {
      if (!isCurrent()) return;
      if (persisted && !isUncertainHistoryFailure(cause)) {
        try {
          clearPendingWorkHistoryOperation(uid, pending);
          setPending(null);
        } catch {
          update({
            error:
              'Não foi possível limpar a confirmação neste navegador. Confirme o mesmo pedido novamente.',
          });
          return;
        }
      }
      update({
        error: workHistoryMessage(cause),
        conflict: persisted && !isUncertainHistoryFailure(cause),
      });
    } finally {
      if (isCurrent()) {
        mutationBusy.current = false;
        update({ busy: false });
      }
    }
  }
  const create = async (label: string) => {
    const wanted = resource ?? currentOptions.current.editor?.resource;
    if (!wanted || !current.source || current.conflict || pendingRef.current) return;
    await execute(
      {
        kind: 'create',
        input: {
          target,
          resource: wanted,
          operationId: crypto.randomUUID(),
          expectedSourceToken: current.source.sourceToken,
          ...(label.trim() ? { label: label.trim() } : {}),
        },
      },
      false,
    );
  };
  const restore = async () => {
    if (!current.selected || !current.source || current.conflict || pendingRef.current) return;
    await execute(
      {
        kind: 'restore',
        input: {
          target,
          resource: current.selected.version.resource,
          versionId: current.selected.version.id,
          operationId: crypto.randomUUID(),
          expectedSourceToken: current.source.sourceToken,
        },
      },
      false,
    );
  };
  const remove = async (version: VersionSummary) => {
    if (pendingRef.current || !sameVersionTarget(version.target, target)) return;
    await execute(
      {
        kind: 'delete',
        resource: version.resource,
        input: { target, versionId: version.id, operationId: crypto.randomUUID() },
      },
      false,
    );
  };
  const recover = async () => {
    if (pendingRef.current) await execute(pendingRef.current, true);
  };
  const copy = async () => {
    if (!current.selected || current.reading || mutationBusy.current) return;
    try {
      await copyWorkVersionText(current.selected.content);
      update({ notice: 'Texto copiado.' });
    } catch {
      update({ error: 'Não foi possível copiar. Tente novamente com a versão aberta.' });
    }
  };
  return {
    ...current,
    create,
    restore,
    remove,
    recover,
    select,
    compareCurrent,
    loadMore,
    copy,
    refresh: () => {
      selection.current++;
      update({ selected: null, selectedId: null, reading: false, readError: '' });
      setAttempt((value) => value + 1);
    },
  };
}
