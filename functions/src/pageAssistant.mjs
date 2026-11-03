import {
  normalizePageCapabilities,
  pageProviderCapabilities,
  normalizePageAction,
} from './pageAssistantCapabilities.mjs';
import { createHash } from 'node:crypto';
import { GenerationError, platformTextGeneration } from './generation.mjs';
import { universeDocumentId } from './universes.mjs';
import { readCreationContext } from './projectCreationContext.mjs';
import { assertAdventureNotDeleted } from './adventureDeletionGuard.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';

const fail = (code, message) => {
  throw new GenerationError(code, message);
};
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('invalid-argument', 'Pedido inválido.');
  return value;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** This service proposes UI capabilities. The original UI handlers retain all mutation protocols. */
export function createPageAssistantService({ db, generator, now = Date.now }) {
  async function read(tx, uid, target) {
    if (!target) return { proof: null, content: null };
    const kind = target.kind,
      id = universeDocumentId(target.id);
    if (!['book', 'adventure', 'campaign', 'universe'].includes(kind))
      fail('invalid-argument', 'Contexto inválido.');
    if (kind === 'adventure') await assertAdventureNotDeleted(tx, db, uid, id);
    if (kind === 'campaign') await assertCampaignNotDeleted(tx, db, uid, id);
    const collection = {
      book: 'books',
      adventure: 'adventures',
      campaign: 'campaigns',
      universe: 'universes',
    }[kind];
    const snap = await tx.get(db.doc(`${collection}/${id}`)),
      root = snap.data();
    if (
      !root ||
      root.deleting ||
      (['book', 'universe'].includes(kind) ? root.authorId : root.ownerId) !== uid
    )
      fail('permission-denied', 'Contexto indisponível.');
    const birth = snap.createTime;
    if (!Number.isSafeInteger(birth?.seconds) || !Number.isSafeInteger(birth?.nanoseconds))
      fail('failed-precondition', 'Não foi possível conferir a identidade do projeto.');
    const context = await readCreationContext(tx, db, uid, {
      universeId: kind === 'universe' ? id : root.universeId,
      personaId: root.personaId,
    });
    let conception = null;
    if (kind !== 'universe') {
      const session = (await tx.get(db.doc(`users/${uid}/assistedSessions/${id}`))).data();
      if (session?.committed && session.kind === kind && session.expiresAt > now()) {
        try {
          await readCreationContext(tx, db, uid, session, session.contextProof);
          conception = session.brief;
        } catch {
          conception = session.idea;
        }
      }
    }
    return {
      proof: hash({
        kind,
        id,
        birth: { seconds: birth.seconds, nanoseconds: birth.nanoseconds },
        context: context.proof,
        revision: root.revision ?? 0,
        updatedAt: root.updatedAt,
      }),
      content: {
        kind,
        title: root.title ?? root.name,
        synopsis: root.synopsis ?? root.description ?? '',
        conception,
        ...context.content,
      },
    };
  }
  return {
    async pageAssistant(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      // Metadata-only reauthorization for RAM conversations when returning to a page.
      // This never calls a provider or grants a content mutation capability.
      if (data?.action === 'inspect') {
        const source = await db.runTransaction((tx) => read(tx, uid, data.target));
        return { contextProof: source.proof };
      }

      const prompt = text(data?.prompt, 4000);
      const page = text(data.page, 500);
      const capabilities = normalizePageCapabilities(data.capabilities);
      const generation = platformTextGeneration(data.generation, 8000);
      const captured = await db.runTransaction(async (tx) => {
        const source = await read(tx, uid, data.target);
        const quotaRef = db.doc(`users/${uid}/assistedLimits/current`),
          quota = (await tx.get(quotaRef)).data();
        const windowStart = Math.floor(now() / 3600000) * 3600000,
          count = quota?.windowStart === windowStart ? quota.count : 0;
        if (count >= 60) fail('resource-exhausted', 'Limite de assistência por hora atingido.');
        tx.set(quotaRef, { windowStart, count: count + 1 });
        return source;
      });
      // Dynamic labels can contain derived names. Send static UI vocabulary only;
      // exact labels stay in the browser for the user's action preview.
      const providerCapabilities = pageProviderCapabilities(capabilities);
      const result = await generator({
        mode: 'page-assistant',
        generation,
        prompt,
        page,
        capabilities: providerCapabilities,
        context: captured.content,
      });
      await db.runTransaction(async (tx) => {
        if ((await read(tx, uid, data.target)).proof !== captured.proof)
          fail('failed-precondition', 'O contexto mudou. Confira a página antes de continuar.');
      });
      const reply = text(result?.reply, 6000);
      const action = normalizePageAction(result.action, capabilities);
      return { reply, action, contextProof: captured.proof };
    },
  };
}
