import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  CampaignLoreAction,
  CampaignLoreEntityInput,
  CampaignLoreHeader,
  CampaignLoreOperation,
  CampaignLoreResult,
} from '../model/campaignLore';
import * as api from '../services/campaignLoreService';
import * as recovery from '../services/campaignLoreRecovery';
import { sealLore, sealedRequest, unsealLore } from '../services/campaignLoreCrypto';
interface Options {
  uid: string;
  campaignId: string;
  baseId: string;
  isActive: () => boolean;
  accessVersion: () => number;
  onConfirmed: (value: CampaignLoreResult) => void;
  onRecovered: (entity: CampaignLoreEntityInput, op: CampaignLoreOperation) => void;
  onClosed: () => void;
  onGateDenied: () => void;
  observe: (
    value: CampaignLoreResult | import('../model/campaignLore').CampaignLoreEnvelope,
  ) => void;
}
export function useCampaignLoreMutation(options: Options) {
  const [pending, setPending] = useState<CampaignLoreOperation | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true),
    reserved = useRef(false),
    latest = useRef(options),
    pendingRef = useRef(pending),
    accessAtStart = useRef(0);
  useLayoutEffect(() => {
    latest.current = options;
    pendingRef.current = pending;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const adopt = useCallback((op: CampaignLoreOperation | null) => {
    if (alive.current) {
      pendingRef.current = op;
      setPending(op);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const op = await recovery.readLoreOperation(options.uid, options.campaignId);
      adopt(op);
      if (alive.current) {
        setReady(true);
      }
    } catch (cause) {
      if (alive.current) {
        setError(api.loreMessage(cause));
        setReady(false);
      }
    }
  }, [options.uid, options.campaignId, adopt]);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void refresh();
    });
    const unsubscribe = recovery.subscribeLoreOperations(() => {
      if (!reserved.current) void refresh();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || reserved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function check() {
    if (
      !alive.current ||
      !latest.current.isActive() ||
      latest.current.accessVersion() !== accessAtStart.current
    )
      throw new Error('A sessão deste pedido foi encerrada.');
  }
  async function finish(op: CampaignLoreOperation, intent: 'confirm' | 'cancel') {
    const result = await api.resolveCampaignLoreOperation({
      ...op.header,
      action: op.action,
      ...(op.action === 'save' ? { relatedSourceKeys: op.relatedSourceKeys } : {}),
      intent,
    });
    check();
    api.validateResolution(result, op);
    const next = await recovery.clearLoreOperation(op, check);
    check();
    adopt(next);
    return result;
  }
  async function send(op: CampaignLoreOperation, expected?: CampaignLoreEntityInput) {
    check();
    const value =
      op.action === 'save'
        ? await api.saveCampaignLoreVariant({ ...api.saveHeader(op), sealed: sealedRequest(op) })
        : op.action === 'remove'
          ? await api.removeCampaignLore(op.header)
          : op.action === 'restore'
            ? await api.restoreCampaignLore(op.header)
            : await api.discardCampaignLoreVariant(op.header);
    check();
    api.validateMutation(value, op, expected);
    latest.current.observe(value);
    const confirmed: CampaignLoreOperation = {
      schemaVersion: 1,
      ownerId: op.ownerId,
      header: op.header,
      action: op.action,
      ...(op.action === 'save' ? { relatedSourceKeys: op.relatedSourceKeys } : {}),
      phase: 'confirmed',
      confirmedRevision: value.item!.revision,
    };
    await recovery.replaceLoreOperation(confirmed, op.phase, check);
    check();
    adopt(confirmed);
    // The view can be accepted only while authorized and not superseded locally.
    latest.current.observe(value);
    latest.current.onConfirmed(value);
    await finish(confirmed, 'confirm');
  }
  async function run(work: () => Promise<void>) {
    if (reserved.current) return;
    reserved.current = true;
    accessAtStart.current = latest.current.accessVersion();
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      if (alive.current) {
        if (api.gateDenied(cause)) latest.current.onGateDenied();
        setError(api.loreMessage(cause));
      }
    } finally {
      reserved.current = false;
      if (alive.current) {
        setBusy(false);
        await refresh();
      }
    }
  }
  function execute(
    action: CampaignLoreAction,
    header: CampaignLoreHeader,
    entity?: CampaignLoreEntityInput,
  ) {
    // Freeze the whole body, relation set, revision and identity before the first await.
    let snapshot: CampaignLoreEntityInput | undefined;
    try {
      if (entity) snapshot = api.normalizedEntity(entity, header.sourceKey);
    } catch (cause) {
      setError(api.loreMessage(cause));
      return Promise.resolve();
    }
    return run(async () => {
      if (!ready || pendingRef.current || !recovery.recoveryAvailable())
        throw new Error(
          'A recuperação segura precisa estar disponível e sem outro pedido antes de enviar.',
        );
      const op: CampaignLoreOperation = {
        schemaVersion: 1,
        ownerId: options.uid,
        header: { ...header },
        action,
        phase: action === 'save' ? 'preparing' : 'metadata-ready',
        ...(action === 'save' ? { relatedSourceKeys: api.relatedKeys(snapshot!) } : {}),
      };
      await recovery.reserveLoreOperation(op, check);
      check();
      adopt(op);
      if (action === 'save') {
        const prepared = await api.prepareCampaignLoreVariant(api.saveHeader(op));
        check();
        api.validatePrepared(prepared, op);
        latest.current.observe(prepared);
        const binary = await sealLore(op, snapshot!, prepared.key);
        check();
        const sealed: CampaignLoreOperation = { ...op, ...binary, phase: 'sealed' };
        await recovery.replaceLoreOperation(sealed, 'preparing', check);
        check();
        adopt(sealed);
        await send(sealed, snapshot);
      } else await send(op);
    });
  }
  function recover() {
    return run(async () => {
      const op = await recovery.readLoreOperation(options.uid, options.campaignId);
      check();
      adopt(op);
      if (!op) return;
      if (op.phase === 'confirmed') {
        await finish(op, 'confirm');
        latest.current.onClosed();
        return;
      }
      if (op.phase === 'preparing')
        throw new Error(
          'O preparo não contém um rascunho cifrado completo. Encerre o pedido; os campos desta sessão foram mantidos.',
        );
      if (op.header.baseId !== options.baseId)
        throw new Error(
          'Este pedido pertence a outra base. Encerre-o explicitamente para continuar.',
        );
      let expected: CampaignLoreEntityInput | undefined;
      if (op.phase === 'sealed') {
        const prepared = await api.prepareCampaignLoreVariant(api.saveHeader(op));
        check();
        api.validatePrepared(prepared, op);
        latest.current.observe(prepared);
        const entity = await unsealLore(op, prepared.key);
        check();
        latest.current.observe(prepared);
        latest.current.onRecovered(entity, op);
        expected = entity;
      }
      await send(op, expected);
    });
  }
  function cancel() {
    return run(async () => {
      const op = await recovery.readLoreOperation(options.uid, options.campaignId);
      check();
      adopt(op);
      if (!op) return;
      const result = await finish(op, 'cancel');
      latest.current.onClosed();
      setError(
        result.state === 'committed'
          ? 'O pedido já havia sido aplicado. A recuperação foi encerrada; consulte o estado atual autorizado.'
          : 'Pedido encerrado sem aplicar alterações.',
      );
    });
  }
  return {
    pending,
    ready,
    busy,
    error,
    execute,
    recover,
    cancel,
    refresh,
    isReserved: () => reserved.current,
    available: recovery.recoveryAvailable(),
  };
}
