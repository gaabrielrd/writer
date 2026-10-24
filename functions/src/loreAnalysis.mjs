import { digest } from './workProgressContracts.mjs';
import { applicationPaths, applicationConflict } from './loreAnalysisApplicationContracts.mjs';
import { loadApplication } from './loreAnalysisApplicationStore.mjs';
import { applyPreparedAnalysisInTransaction } from './loreAnalysisApplicationApply.mjs';
import { nextBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { createHash } from 'node:crypto';
import { GenerationError, validateId } from './generation.mjs';
import { prepareCampaignAuthorization } from './campaignAuthorization.mjs';
import { readLoreAnalysisContext } from './loreAnalysisContext.mjs';
import { text, aliases, patch, categories } from './loreAnalysisFields.mjs';
import { createLoreAnalysisApplicationService } from './loreAnalysisApplication.mjs';

const fail = (code, message) => {
  throw new GenerationError(code, message);
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateDetectedLore(items, source) {
  if (!Array.isArray(items) || items.length > 50)
    fail('invalid-argument', 'Analise no máximo 50 entidades por capítulo.');
  return items.map((item) => {
    if (!item || !categories.includes(item.category))
      fail('invalid-argument', 'Categoria inválida.');
    const quote = text(item.evidence, 1000).trim();
    const pattern = quote
      .split(/\s+/u)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const evidence = source.includes(quote) ? quote : source.match(new RegExp(pattern, 'u'))?.[0];
    if (!evidence || evidence.length > 1000)
      fail('invalid-argument', 'Evidência ausente no capítulo.');
    return {
      name: text(item.name, 200),
      category: item.category,
      summary: text(item.summary, 140),
      details: text(item.details, 8000, false),
      aliases: aliases(item.aliases),
      evidence,
    };
  });
}
export function createLoreAnalysisService({ db, generator, now = Date.now }) {
  const ticketRef = (uid, id) => db.doc(`users/${uid}/loreAnalyses/${validateId(id)}`);
  const snapshot = (tx, uid, bookId, chapterId) =>
    readLoreAnalysisContext(tx, db, uid, bookId, chapterId);
  async function verifyAnalysisContext(tx, uid, record) {
    const current = await snapshot(tx, uid, record.bookId, record.chapterId);
    if (
      current.revision !== record.revision ||
      (current.chapterHash !== record.chapterHash && current.chapterHash !== record.contentHash)
    )
      fail(
        'failed-precondition',
        'O contexto mudou. Analise novamente antes de reutilizar a resposta.',
      );
  }
  async function prepare(uid, data, provider) {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!data) fail('invalid-argument', 'Solicitação inválida.');
    const source = text(data.text, 120000);
    const content = text(data.content, 900000);
    const ref = ticketRef(uid, data.requestId);
    const fingerprint = hash([
      data.bookId,
      data.chapterId,
      source,
      content,
      data.loreVersions,
      provider,
      provider === 'byok' ? data.entities : null,
    ]);
    const record = await db.runTransaction(async (tx) => {
      const previous = (await tx.get(ref)).data();
      if (previous) {
        if (previous.fingerprint !== fingerprint || previous.expiresAt <= now())
          fail('failed-precondition', 'Solicitação expirada ou reutilizada. Analise novamente.');
        if (previous.state === 'ready' || previous.state === 'applied') {
          await verifyAnalysisContext(tx, uid, previous);
          return previous;
        }
        fail('failed-precondition', 'Análise em andamento.');
      }
      const context = await snapshot(tx, uid, data.bookId, data.chapterId);
      const versions = context.entities.map((entity) => [entity.id, entity.data.updatedAt ?? 0]);
      if (
        !Array.isArray(data.loreVersions) ||
        hash([...data.loreVersions].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) !==
          hash(versions)
      )
        fail('failed-precondition', 'O compêndio mudou. Recarregue antes de analisar.');
      const quotaRef = db.doc(`users/${uid}/loreAnalysisLimits/current`);
      const quota = (await tx.get(quotaRef)).data();
      const windowStart = Math.floor(now() / 3600000) * 3600000;
      const count = quota?.windowStart === windowStart ? quota.count : 0;
      if (count >= 10) fail('resource-exhausted', 'Limite de 10 análises por hora atingido.');
      const value = {
        bookId: data.bookId,
        chapterId: data.chapterId,
        provider,
        fingerprint,
        textHash: hash(source),
        contentHash: hash(content),
        chapterHash: context.chapterHash,
        revision: context.revision,
        state: 'analyzing',
        expiresAt: now() + 3600000,
      };
      tx.set(quotaRef, { windowStart, count: count + 1 });
      tx.create(ref, value);
      return {
        ...value,
        context: context.entities.map(({ id, data: entity }) => ({
          id,
          name: entity.name,
          category: entity.category,
          aliases: entity.aliases ?? [],
          summary: entity.summary,
          details: entity.details ?? '',
        })),
      };
    });
    if (record.state === 'ready' || record.state === 'applied')
      return { id: data.requestId, provider, entities: record.entities };
    try {
      let results = [];
      if (provider === 'byok') results = validateDetectedLore(data.entities, source);
      else {
        for (let start = 0; start < source.length; start += 12000) {
          const part = source.slice(Math.max(0, start - 300), start + 12000);
          let found;
          for (let attempt = 0; attempt < 2; attempt++) {
            const response = await generator({
              text: part,
              lore: record.context,
              alreadyDetected: results,
              ...(attempt
                ? {
                    validationFeedback:
                      'A resposta anterior não passou na validação. Confira os limites dos campos e copie evidências literais de text.',
                  }
                : {}),
            });
            await db.runTransaction((tx) => verifyAnalysisContext(tx, uid, record));
            try {
              found = validateDetectedLore(JSON.parse(response)?.entities, source);
              break;
            } catch (cause) {
              if (!(cause instanceof SyntaxError || cause instanceof GenerationError)) throw cause;
              if (attempt === 1)
                fail(
                  'unavailable',
                  'A IA retornou sugestões sem evidências válidas ou fora do formato esperado. Nenhuma alteração ou cobrança ocorreu. Tente novamente.',
                );
            }
          }
          for (const item of found) {
            const index = results.findIndex(
              (old) => old.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR'),
            );
            if (index < 0) results.push(item);
            else results[index] = item;
          }
          if (results.length > 50)
            fail(
              'resource-exhausted',
              'Mais de 50 entidades encontradas. Divida o capítulo para revisar todas.',
            );
        }
      }
      if (JSON.stringify(results).length > 500000)
        fail('resource-exhausted', 'Resultado grande demais. Divida o capítulo.');
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (
          !current ||
          current.state !== 'analyzing' ||
          current.fingerprint !== record.fingerprint ||
          current.expiresAt <= now()
        )
          fail('failed-precondition', 'A análise mudou ou expirou. Analise novamente.');
        await verifyAnalysisContext(tx, uid, record);
        tx.update(ref, { state: 'ready', entities: results });
      });
      return { id: data.requestId, provider, entities: results };
    } catch (cause) {
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.state === 'analyzing' && current.fingerprint === record.fingerprint)
          tx.update(ref, { state: 'failed' });
      });
      if (cause instanceof GenerationError) throw cause;
      fail(
        'unavailable',
        'A análise não foi concluída. Nenhuma alteração ou cobrança ocorreu. Tente novamente.',
      );
    }
  }
  return {
    ...createLoreAnalysisApplicationService({ db, now }),
    analyzeChapterLore: (uid, data) => prepare(uid, data, 'platform'),
    prepareBYOKLore: (uid, data) => prepare(uid, data, 'byok'),
    async applyLoreAnalysis(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      const ref = ticketRef(uid, data?.id);
      const source = text(data.text, 120000);
      if (!Array.isArray(data.changes) || data.changes.length < 1 || data.changes.length > 50)
        fail('invalid-argument', 'Selecione de 1 a 50 alterações.');
      const requestHash = hash([source, data.changes]);
      return db.runTransaction(async (tx) => {
        const record = (await tx.get(ref)).data();
        // Legacy receipts remain confirmable even when a cancellation fence was created later.
        if (record?.state === 'applied' && !Object.hasOwn(record, 'application')) {
          if (record.requestHash !== requestHash)
            fail('failed-precondition', 'Este lote já foi aplicado com outras alterações.');
          return record.result;
        }
        const application = await loadApplication(tx, applicationPaths(db, uid, data.id), {
          requestHash: digest([source, data.changes]),
        });
        if (application?.state.phase === 'applied') return application.success.record.result;
        if (record && Object.hasOwn(record, 'application')) applicationConflict();
        if (application)
          return applyPreparedAnalysisInTransaction(tx, { db, now }, application, data);
        if (!record) fail('not-found', 'Análise não encontrada.');
        if (
          record.state !== 'ready' ||
          record.expiresAt <= now() ||
          record.textHash !== hash(source)
        )
          fail('failed-precondition', 'A análise expirou ou o texto mudou. Analise novamente.');
        const context = await snapshot(tx, uid, record.bookId, record.chapterId);
        if (record.revision !== context.revision)
          fail(
            'failed-precondition',
            'O lore ou universo mudou. Analise novamente antes de aplicar.',
          );
        if (
          context.chapterHash !== record.chapterHash &&
          context.chapterHash !== record.contentHash
        )
          fail('failed-precondition', 'O capítulo salvo mudou. Recarregue e analise novamente.');
        if (
          data.changes.some((change) => change?.scope === 'local') &&
          Object.hasOwn(context.book, 'hasLoreResources') &&
          context.book.hasLoreResources !== false
        )
          fail(
            'failed-precondition',
            'Este livro exige escrita preparada. Nenhuma alteração ou cobrança ocorreu.',
          );
        const userRef = db.doc(`users/${uid}`);
        const user = (await tx.get(userRef)).data();
        const cost = record.provider === 'platform' ? 1 : 0;
        if (!user || !Number.isSafeInteger(user.credits) || user.credits < cost)
          fail('resource-exhausted', 'Saldo insuficiente para aplicar o lote.');
        const seen = new Set();
        const writes = [];
        for (const [index, change] of data.changes.entries()) {
          if (
            !['local', 'global'].includes(change?.scope) ||
            (change.scope === 'global' && !context.worldRef)
          )
            fail('invalid-argument', 'Destino inválido.');
          const input = patch(change.input);
          const existing = change.entityId
            ? context.entities.find(
                (entity) => entity.id === change.entityId && entity.scope === change.scope,
              )
            : null;
          if (change.entityId && !existing)
            fail('invalid-argument', 'Entidade não pertence ao destino.');
          if (existing && change.scope === 'local' && context.localPayloadIds.has(existing.id))
            fail(
              'failed-precondition',
              'Esta ficha exige escrita preparada. Nenhuma alteração ou cobrança ocorreu.',
            );

          const root = change.scope === 'global' ? context.worldRef : context.bookRef;
          const target = existing
            ? db.doc(existing.path)
            : db.doc(`${root.path}/lore/${data.id}-${index}`);
          if (seen.has(target.path)) fail('invalid-argument', 'Entidade repetida no lote.');
          seen.add(target.path);
          if (
            change.scope === 'local' &&
            (
              await Promise.all(
                ['bookLoreTombstones', 'bookLoreReservations'].map((name) =>
                  tx.get(db.doc(context.bookRef.path + '/' + name + '/' + target.id)),
                ),
              )
            ).some((s) => s.exists)
          )
            fail(
              'failed-precondition',
              'Esta ficha foi retirada ou reservada. Use outro identificador.',
            );
          if (!existing && (!input.name || !input.summary || !input.category))
            fail('invalid-argument', 'Preencha nome, categoria e resumo da entidade nova.');
          if (
            existing &&
            Object.entries(input).every(
              ([key, value]) =>
                JSON.stringify(value) ===
                JSON.stringify(existing.data[key] ?? (key === 'aliases' ? [] : '')),
            )
          )
            fail('invalid-argument', 'A entidade selecionada não possui alterações.');
          const merged = { ...existing?.data, ...input };
          const normalize = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
          if (
            context.entities.some(
              (entity) =>
                entity.scope === change.scope &&
                entity.id !== existing?.id &&
                normalize(entity.data.name) === normalize(merged.name),
            ) ||
            writes.some(
              (write) =>
                write.scope === change.scope && normalize(write.name) === normalize(merged.name),
            )
          )
            fail('failed-precondition', 'Nome duplicado no destino. Revise as correspondências.');
          const value = existing
            ? { ...input, updatedAt: now() }
            : {
                ...input,
                ...(change.scope === 'local' ? { bookId: record.bookId } : {}),
                aliases: input.aliases ?? [],
                details: input.details ?? '',
                relations: [],
                isPublic: false,
                createdAt: now(),
                updatedAt: now(),
              };
          writes.push({ target, value, existing, scope: change.scope, name: merged.name });
        }
        // All reads and validation finish before writes. Visibility and relations cannot change here.
        const localVersion = writes.some((write) => write.scope === 'local')
          ? nextBookLocalLoreVersion(context.book)
          : null;
        const authorization = writes.some((write) => write.scope === 'global')
          ? await prepareCampaignAuthorization(tx, db, uid, { bump: true })
          : null;
        authorization?.commit();
        if (localVersion !== null)
          tx.update(context.bookRef, { localLoreVersion: localVersion, updatedAt: now() });
        for (const write of writes) {
          if (write.existing) tx.update(write.target, write.value);
          else tx.create(write.target, write.value);
        }
        if (writes.some((write) => write.scope === 'global'))
          tx.update(context.worldRef, {
            loreVersion: (context.world.loreVersion ?? 0) + 1,
            updatedAt: now(),
          });
        if (cost) tx.update(userRef, { credits: user.credits - cost, updatedAt: now() });
        const result = { applied: writes.length, credits: user.credits - cost };
        tx.update(ref, { state: 'applied', requestHash, result });
        return result;
      });
    },
  };
}
