import { auth } from '@/shared/lib';
import { recoveryCheck as check, recoveryOwner } from './adventureRestoreRecoveryContracts';
import { validId } from './adventureInventoryContracts';
import { createAdventureArchiveApi } from './adventureArchiveCallables';
import { saveAdventureBackup } from './saveAdventureBackup';
import type { AdventureDraftInput } from './adventureDraftData';
import {
  adventureArchivePicker,
  openAdventureArchiveSink,
  type AdventureArchivePicker,
  type AdventureArchiveSink,
} from './adventureArchiveDestination';
export function adventureArchiveFileName(title: string) {
  const safe = Array.from(
    title
      .normalize('NFC')
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\p{Cc}/gu, ' ')
      .trim(),
  )
    .slice(0, 100)
    .join('')
    .replace(/[. ]+$/g, '');
  return 'Aventura - ' + (safe || 'sem título') + '.writer';
}
export async function exportAdventureArchive(
  input: {
    ownerId: string;
    adventureId: string;
    title: string;
    draft?: AdventureDraftInput | null;
    signal?: AbortSignal;
    check?: () => void;
  },
  ports: { picker?: AdventureArchivePicker; save?: typeof saveAdventureBackup } = {},
): Promise<{ kind: 'saved' } | { kind: 'cancelled' }> {
  const ownerId = input.ownerId,
    adventureId = input.adventureId,
    picker = ports.picker ?? adventureArchivePicker,
    save = ports.save ?? saveAdventureBackup,
    signal = input.signal,
    scopeCheck = input.check;
  function guard() {
    signal?.throwIfAborted();
    scopeCheck?.();
    check(
      recoveryOwner(ownerId) &&
        validId(adventureId) &&
        auth.currentUser?.uid === ownerId &&
        input.ownerId === ownerId &&
        input.adventureId === adventureId,
    );
  }
  guard();
  check(typeof input.title === 'string');
  if (!picker.supported())
    throw Error('Este navegador não oferece gravação de backup com seleção de arquivo.');
  let resolve!: (sink: AdventureArchiveSink) => void, reject!: (error: unknown) => void;
  const destination = new Promise<AdventureArchiveSink>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const saving = save(
    adventureId,
    createAdventureArchiveApi(ownerId, adventureId, guard),
    { guard, signal, draft: input.draft ?? null },
    destination,
  );
  const settled = saving.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let sink: AdventureArchiveSink | undefined,
    choosing = true,
    pickerCancelled = false;
  try {
    const handle = await picker.pick(adventureArchiveFileName(input.title));
    choosing = false;
    guard();
    sink = await openAdventureArchiveSink(handle);
    guard();
    resolve(sink);
  } catch (error) {
    pickerCancelled = choosing && error instanceof DOMException && error.name === 'AbortError';
    let failure = error;
    if (sink)
      try {
        await sink.abort(error);
      } catch (cleanup) {
        failure = new AggregateError(
          [error, cleanup],
          'Não foi possível encerrar o arquivo de backup.',
          { cause: error },
        );
      }
    reject(failure);
  }
  const outcome = await settled;
  if (!outcome.ok) {
    if (pickerCancelled) {
      guard();
      return { kind: 'cancelled' };
    }
    throw outcome.error;
  }
  guard();
  return { kind: 'saved' };
}
