import { digest, workFail } from './workProgressContracts.mjs';
import { bookBackupScope, bookBackupToken, readBookBackupSource } from './bookBackupContext.mjs';
import { readBookBackupPersonaIdentity } from './bookBackupPersonaRead.mjs';
import { encodeBookBackupDraftPersona } from './bookBackupDraft.mjs';
export function createBookBackupDraftService({ db }) {
  return {
    async getBookBackupDraftPersona(uid, data) {
      const context = bookBackupScope(db, uid, data, [
          'sourceToken',
          'personaId',
          'expectedPersonaToken',
        ]),
        sourceToken = bookBackupToken(data.sourceToken),
        expected = Object.hasOwn(data, 'expectedPersonaToken')
          ? bookBackupToken(data.expectedPersonaToken)
          : undefined,
        id = data.personaId;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
        workFail('invalid-argument', 'Persona declarada inválida.');
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, sourceToken),
          identity = await readBookBackupPersonaIdentity(tx, context, id),
          personaToken = digest({
            version: 1,
            uid,
            bookId: context.target.id,
            sourceToken,
            personaId: id,
            identity: identity.identity,
          });
        if (expected !== undefined && personaToken !== expected)
          workFail(
            'failed-precondition',
            'A persona do rascunho mudou. Faça um novo backup.',
            'book-backup-draft-persona-changed',
          );
        const raw = identity.preset ?? (await tx.get(identity.snapshot.ref)).data();
        let encoded;
        try {
          if (raw.id !== id) throw new TypeError('Identidade inválida.');
          encoded = encodeBookBackupDraftPersona(raw);
        } catch {
          workFail('failed-precondition', 'O perfil usado pelo rascunho está inconsistente.');
        }
        return {
          ...current.result,
          personaId: id,
          personaToken,
          profileHash: digest(encoded.json),
          profile: encoded.profile,
        };
      });
    },
  };
}
