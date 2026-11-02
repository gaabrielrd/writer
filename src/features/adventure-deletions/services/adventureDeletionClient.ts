import type {
  AdventureDeletionSource as Source,
  AdventureDeletionPending as Pending,
  AdventureDeletionProgress as Progress,
  AdventureDeletionControl as Control,
  AdventureDeletionStartPending as StartPending,
} from '../model/adventureDeletion';
import {
  assertScope,
  canonical,
  fail,
  readSource,
  readLookup,
  readMutation,
  readCanceled,
  reason,
} from '../model/adventureDeletionContracts';
import * as recovery from './adventureDeletionRecovery';
import { listAdventureDeletions } from './adventureDeletionCatalog';
import {
  adventureDeletionTransport,
  type AdventureDeletionTransport,
} from './adventureDeletionTransport';

export interface AdventureDeletionClientOptions {
  uid: string;
  adventureId: string;
  isActive: () => boolean;
  onRevoked?: (progress: Progress) => void;
  transport?: AdventureDeletionTransport;
}
export function createAdventureDeletionClient(options: AdventureDeletionClientOptions) {
  const { uid, adventureId } = options,
    transport = options.transport ?? adventureDeletionTransport;
  assertScope(uid, adventureId);
  let busy = false,
    conflict: string | null = null;
  function check() {
    if (!options.isActive()) fail('A conta ou a aventura mudou. O pedido foi preservado.');
  }
  async function run<T>(work: () => Promise<T>): Promise<T> {
    check();
    if (busy) fail('Já existe uma operação de exclusão em andamento nesta tela.');
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  }
  function local(): Control | null {
    check();
    return recovery.readDeletion(uid, adventureId);
  }
  async function perform(value: Pending) {
    const op = structuredClone(value);
    check();
    if (!recovery.recoveryAvailable())
      fail('Este navegador não permite preservar pedidos com reserva segura.');
    recovery.assertCurrent(op);
    let response: unknown;
    try {
      response =
        op.kind === 'start'
          ? op.phase === 'cancel-start'
            ? await transport.resolveStart({ ...op.input, intent: 'cancel' })
            : await transport.start(structuredClone(op.input))
          : await transport.advance(structuredClone(op.input));
    } catch (cause) {
      check();
      if (op.kind === 'step' && reason(cause) === 'checkpoint-conflict') conflict = canonical(op);
      throw cause;
    }
    check();
    recovery.assertCurrent(op);
    const proof =
      response && typeof response === 'object' && 'kind' in response
        ? readCanceled(response, op)
        : readMutation(response, op);
    if (!('kind' in proof)) {
      check();
      options.onRevoked?.(structuredClone(proof.progress));
    }
    const result = await recovery.settleDeletion(op, proof, check);
    check();
    conflict = null;
    return result;
  }
  return {
    async getSource(): Promise<Source | null> {
      check();
      const value = await transport.getSource({ adventureId });
      check();
      return readSource(value, uid, adventureId);
    },
    async load(): Promise<{
      control: Control | null;
      progress: Progress | null;
      readOnly: boolean;
    }> {
      check();
      if (!recovery.recoveryAvailable()) {
        const value = await transport.get({ adventureId });
        check();
        const progress = readLookup(value, uid, adventureId).deletion;
        if (progress) {
          check();
          options.onRevoked?.(structuredClone(progress));
        }
        return { control: null, progress, readOnly: true };
      }
      const expected = local();
      if (expected && expected.kind !== 'known')
        return { control: expected, progress: null, readOnly: false };
      const response = await transport.get({ adventureId });
      check();
      const lookup = readLookup(response, uid, adventureId, expected?.identity, expected?.floor);
      if (!lookup.deletion) {
        if (expected || canonical(local()) !== canonical(expected))
          fail('O controle preservado ainda não pôde ser confirmado.');
        return { control: null, progress: null, readOnly: false };
      }
      check();
      options.onRevoked?.(structuredClone(lookup.deletion));
      const control = await recovery.rememberDeletion(
        uid,
        adventureId,
        expected,
        lookup.deletion,
        check,
      );
      check();
      return { control, progress: lookup.deletion, readOnly: false };
    },
    async start(source: Source, operationId: string = crypto.randomUUID()) {
      const snapshot = readSource(source, uid, adventureId);
      if (!snapshot) fail('Confira a aventura antes de excluir.');
      const op: Pending = {
        schemaVersion: 1,
        ownerId: uid,
        kind: 'start',
        phase: 'request',
        input: {
          adventureId,
          adventureToken: snapshot.adventureToken,
          sourceToken: snapshot.sourceToken,
          expectedRevision: snapshot.revision,
          operationId,
        },
      };
      return run(async () => {
        await recovery.reserveDeletion(op, check);
        check();
        return perform(op);
      });
    },
    async recover(expected?: Pending) {
      const captured = expected ? structuredClone(expected) : undefined;
      return run(async () => {
        const op = local();
        if (!op || op.kind === 'known') fail('Não há pedido pendente para recuperar.');
        if (captured && canonical(captured) !== canonical(op))
          fail('O pedido mudou em outra aba e foi preservado.');
        return perform(op);
      });
    },
    async cancelStart(expected?: StartPending) {
      const captured = expected ? structuredClone(expected) : undefined;
      return run(async () => {
        const old = local();
        if (old?.kind !== 'start') fail('Não há início preservado para encerrar.');
        if (captured && canonical(captured) !== canonical(old))
          fail('O pedido mudou em outra aba e foi preservado.');
        const op = await recovery.cancelDeletionStart(old, check);
        check();
        return perform(op);
      });
    },
    async advance(operationId: string = crypto.randomUUID()) {
      return run(async () => {
        const old = local();
        if (old?.kind !== 'known' || old.floor.complete)
          fail('Consulte uma exclusão ainda em andamento.');
        const op: Pending = {
          schemaVersion: 1,
          ownerId: uid,
          kind: 'step',
          identity: old.identity,
          floor: old.floor,
          input: {
            deletionId: old.identity.deletionId,
            deletionToken: old.identity.deletionToken,
            expectedCheckpoint: old.floor.checkpoint,
            operationId,
          },
        };
        await recovery.reserveDeletion(op, check);
        check();
        return perform(op);
      });
    },
    async resolveConflict() {
      return run(async () => {
        const op = local();
        if (op?.kind !== 'step' || conflict !== canonical(op))
          fail('Confirme primeiro o conflito do pedido preservado.');
        const response = await transport.get({ adventureId });
        check();
        recovery.assertCurrent(op);
        const proof = readLookup(response, uid, adventureId, op.identity, op.floor);
        if (proof.deletion) {
          check();
          options.onRevoked?.(structuredClone(proof.deletion));
        }
        const next = await recovery.settleDeletionConflict(op, proof, check);
        check();
        conflict = null;
        return next;
      });
    },
    list(input: { cursor?: string; limit?: number } = {}, visited = new Set<string>()) {
      return listAdventureDeletions({ uid, check, transport }, input, visited);
    },
  };
}
export type AdventureDeletionClient = ReturnType<typeof createAdventureDeletionClient>;
