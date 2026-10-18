import { randomBytes, createDecipheriv } from 'node:crypto';
import { workConflict } from './workProgressContracts.mjs';
import { assertLoreAdmission } from './campaignLoreStorage.mjs';
import {
  closed,
  fail,
  headerFields,
  operationDescriptor,
  operationRef,
  verifyOperation,
  operationMetadata,
  recoveryIdentity,
  loreContext,
  loreEnvelope,
  loreRecord,
  requireTargets,
  LORE_BYTES,
  inconsistent,
} from './campaignLoreContracts.mjs';

export const variantAAD = (descriptor) =>
  Buffer.from(
    JSON.stringify([
      1,
      descriptor.ownerId,
      descriptor.campaignId,
      descriptor.campaignToken,
      descriptor.baseId,
      descriptor.sourceKey,
      descriptor.operationId,
      descriptor.expectedRevision,
      'save',
      descriptor.relatedSourceKeys,
    ]),
  );
export function base64Bytes(value, maximum, exact) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(maximum / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail('invalid-argument', 'Dados cifrados inválidos.');
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.toString('base64') !== value ||
    bytes.length > maximum ||
    (exact !== undefined && bytes.length !== exact)
  )
    fail('invalid-argument', 'Dados cifrados inválidos.');
  return bytes;
}
export function sealedRequest(value) {
  closed(value, ['version', 'algorithm', 'nonce', 'ciphertext']);
  if (value.version !== 1 || value.algorithm !== 'AES-GCM')
    fail('invalid-argument', 'Formato cifrado não suportado.');
  base64Bytes(value.nonce, 12, 12);
  if (base64Bytes(value.ciphertext, LORE_BYTES + 16).length < 16)
    fail('invalid-argument', 'Dados cifrados inválidos.');
  return { version: 1, algorithm: 'AES-GCM', nonce: value.nonce, ciphertext: value.ciphertext };
}
export function decryptEntity(operation, descriptor, sealed) {
  let content;
  try {
    const key = base64Bytes(operation.key, 32, 32),
      ciphertext = base64Bytes(sealed.ciphertext, LORE_BYTES + 16),
      decipher = createDecipheriv('aes-256-gcm', key, base64Bytes(sealed.nonce, 12, 12));
    decipher.setAAD(variantAAD(descriptor));
    decipher.setAuthTag(ciphertext.subarray(-16));
    const bytes = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    content = bytes.toString('utf8');
    if (!bytes.equals(Buffer.from(content))) throw new Error();
    return JSON.parse(content);
  } catch {
    fail('invalid-argument', 'Não foi possível autenticar o pedido cifrado.');
  }
}
export function activeOperation(operation) {
  if (operation?.state === 'canceled' || operation?.closed)
    fail('failed-precondition', 'O pedido já foi encerrado.', 'operation-canceled');
}
export function createCampaignVariantRecoveryService({ db }) {
  return {
    async prepareCampaignLoreVariant(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      closed(data, [...headerFields, 'relatedSourceKeys']);
      const descriptor = operationDescriptor(uid, data, 'save'),
        ref = operationRef(db, uid, descriptor.operationId);
      return db.runTransaction(async (tx) => {
        const context = await loreContext(tx, db, uid, data),
          record = await loreRecord(tx, db, context, descriptor.sourceKey);
        assertLoreAdmission(context);
        if (!record) fail('not-found', 'Ficha indisponível.');
        await requireTargets(tx, db, context, descriptor.relatedSourceKeys);
        const previous = verifyOperation((await tx.get(ref)).data(), descriptor);
        activeOperation(previous);
        if (
          !previous &&
          (record.revision !== descriptor.expectedRevision || record.mode === 'removed')
        )
          workConflict();
        const key = previous?.key ?? randomBytes(32).toString('base64');
        if (previous && typeof previous.key !== 'string') inconsistent();
        base64Bytes(key, 32, 32);
        if (!previous) tx.create(ref, { ...operationMetadata(descriptor), key });
        return {
          ...loreEnvelope(context),
          ...recoveryIdentity(descriptor),
          key,
          algorithm: 'AES-GCM',
        };
      });
    },
    async resolveCampaignLoreOperation(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      closed(data, [...headerFields, 'action', 'relatedSourceKeys', 'intent']);
      const descriptor = operationDescriptor(uid, data, data.action);
      if (data.action !== 'save' && 'relatedSourceKeys' in data)
        fail('invalid-argument', 'Pedido sem corpo não recebe alvos de recuperação.');
      if (!['confirm', 'cancel'].includes(data.intent))
        fail('invalid-argument', 'Intenção de encerramento inválida.');
      const ref = operationRef(db, uid, descriptor.operationId);
      return db.runTransaction(async (tx) => {
        const previous = verifyOperation((await tx.get(ref)).data(), descriptor);
        if (data.intent === 'confirm' && (!previous || previous.state === 'prepared'))
          fail(
            'failed-precondition',
            'O pedido ainda não está confirmado. Preserve-o ou cancele explicitamente.',
            'operation-unconfirmed',
          );
        const state = previous?.state === 'committed' ? 'committed' : 'canceled';
        if (
          state === 'committed' &&
          (!Number.isSafeInteger(previous.revision) || previous.revision < 1)
        )
          inconsistent();
        const next = { ...(previous ?? operationMetadata(descriptor)), state, closed: true };
        delete next.key;
        if (!previous || !previous.closed || previous.key !== undefined) tx.set(ref, next);
        return {
          ...recoveryIdentity(descriptor),
          state,
          revision: state === 'committed' ? previous.revision : null,
        };
      });
    },
  };
}
