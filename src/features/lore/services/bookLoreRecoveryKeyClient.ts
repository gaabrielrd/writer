import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '@/shared/lib';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readObject } from './bookLoreReadContracts';
import {
  journalIdentity,
  journalFail,
  type LoreJournalIdentity,
  type LoreJournalGrant,
} from './bookLoreJournalContracts';
export function bookLoreRecoveryKeySession(
  identity: LoreJournalIdentity,
  isCurrent: () => boolean = () => true,
) {
  const i = journalIdentity(identity),
    actor = auth.currentUser;
  if (!actor || actor.uid !== i.uid) throw Error('Entre na conta que iniciou a edição.');
  const currentActor = actor;
  const guard = () => {
    if (auth.currentUser !== actor || auth.currentUser?.uid !== i.uid || !isCurrent())
      throw Error('O contexto mudou. Reabra a recuperação.');
  };
  async function getKey(): Promise<LoreJournalGrant> {
    guard();
    if (!appCheck)
      throw Error('Confirme a verificação do aplicativo para abrir a cópia protegida.');
    const idToken = await currentActor.getIdToken();
    guard();
    const attestation = await getToken(appCheck);
    guard();
    if (!attestation.token) journalFail();
    const response = await fetch('/api/book-lore/recovery-key', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Authorization: 'Bearer ' + idToken,
        'X-Firebase-AppCheck': attestation.token,
      },
      body: JSON.stringify({
        writeId: i.writeId,
        requestHash: i.requestHash,
        jobToken: i.jobToken,
      }),
    });
    guard();
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
      journalFail();
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return journalFail();
    }
    guard();
    if (!response.ok)
      throw Error('Não foi possível autorizar a cópia protegida. Seus dados foram mantidos.');
    const envelope = readObject(raw, ['data']),
      v = readObject(envelope.data, [
        'schemaVersion',
        'writeId',
        'requestHash',
        'jobToken',
        'phase',
        'keyId',
        'bookId',
        'loreId',
        'sourceToken',
        'intentHash',
        'algorithm',
        'keyBase64',
      ]);
    for (const key of [
      'schemaVersion',
      'writeId',
      'requestHash',
      'jobToken',
      'keyId',
      'bookId',
      'loreId',
      'sourceToken',
      'intentHash',
    ] as const)
      if (v[key] !== i[key]) journalFail();
    if (
      v.phase !== 'reserved' ||
      v.algorithm !== 'AES-GCM' ||
      typeof v.keyBase64 !== 'string' ||
      v.keyBase64.length !== 44
    )
      journalFail();
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = Uint8Array.from(atob(v.keyBase64), (c) => c.charCodeAt(0));
      if (
        bytes.length !== 32 ||
        btoa(String.fromCharCode(...bytes)) !== v.keyBase64 ||
        bytesToHex(sha256(bytes)) !== i.keyId
      )
        journalFail();
    } catch {
      return journalFail();
    }
    try {
      const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      guard();
      return { identity: i, key };
    } finally {
      bytes.fill(0);
    }
  }
  return Object.freeze({ identity: i, guard, getKey });
}
