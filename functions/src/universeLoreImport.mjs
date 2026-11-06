import { createHash, randomUUID } from 'node:crypto';
import { GenerationError, platformTextGeneration } from './generation.mjs';
import { validateDetectedLore } from './loreAnalysis.mjs';
import { prepareCampaignAuthorization } from './campaignAuthorization.mjs';
import { selectImportContext, locateImportEvidence } from './universeLoreImportAnalysis.mjs';

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hashText = (v) => createHash('sha256').update(v).digest('hex');
const ANALYSIS_CONCURRENCY = 3;
const fail = (code, message) => {
  throw new GenerationError(code, message);
};
const id = (v) => {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(v))
    fail('invalid-argument', 'Identificador inválido.');
  return v;
};
const text = (v, max, required = true) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    fail('invalid-argument', 'Texto inválido.');
  return v;
};
const norm = (v) => v.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
const fields = (v) => {
  if (
    !v ||
    Object.keys(v).some((k) => !['name', 'category', 'summary', 'details', 'aliases'].includes(k))
  )
    fail('invalid-argument', 'Campos inválidos.');
  if (
    !['character', 'location', 'concept', 'other'].includes(v.category) ||
    !Array.isArray(v.aliases) ||
    v.aliases.length > 20
  )
    fail('invalid-argument', 'Ficha inválida.');
  return {
    name: text(v.name, 200),
    category: v.category,
    summary: text(v.summary, 140),
    details: text(v.details, 150000, false),
    aliases: v.aliases.map((v) => text(v, 200)),
  };
};
const owned = (world, uid) => {
  if (!world || world.authorId !== uid || world.deleting)
    fail('permission-denied', 'Universo indisponível.');
};
const stamp = (snap) =>
  hash([snap.updateTime?.seconds ?? null, snap.updateTime?.nanoseconds ?? null, snap.data()]);
const manifest = (files, version) => {
  if (!Array.isArray(files) || !files.length || files.length > 50)
    fail('invalid-argument', 'Selecione de 1 a 50 arquivos.');
  let size = 0;
  let sourceBytes = 0;
  const result = files.map((file) => {
    const name = text(file.name, 255);
    if (
      !/\.(pdf|txt|text|md|markdown)$/i.test(name) ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      !Number.isSafeInteger(file.parts) ||
      file.parts < 1 ||
      file.parts > 10000
    )
      fail('invalid-argument', 'Arquivo inválido.');
    size += file.size;
    const result = { name, size: file.size, parts: file.parts };
    if (version === 2) {
      if (
        !Number.isSafeInteger(file.sourceBytes) ||
        file.sourceBytes < 1 ||
        typeof file.sourceHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sourceHash)
      )
        fail('invalid-argument', 'Manifesto de texto preparado inválido.');
      sourceBytes += file.sourceBytes;
      Object.assign(result, { sourceBytes: file.sourceBytes, sourceHash: file.sourceHash });
    }
    return result;
  });
  if (size > 10000000) fail('invalid-argument', 'O total dos arquivos deve ser de até 10 MB.');
  if (sourceBytes > 20000000) fail('invalid-argument', 'O texto preparado deve ser de até 20 MB.');
  return result;
};

/** Closed metadata retained after all private source/candidate families are collected. */
export function projectUniverseLoreImportTerminal(record) {
  return {
    state: record.state,
    version: record.version ?? 1,
    fingerprint: record.fingerprint,
    ...(record.result ? { result: record.result } : {}),
    expiresAt: Number.MAX_SAFE_INTEGER,
    cursor: record.cursor ?? 0,
    total: record.total ?? 0,
  };
}

function sourceSpans(value, source) {
  if (!Array.isArray(value) || !value.length || value.length > 200)
    fail('invalid-argument', 'Origem do texto inválida.');
  let end = 0;
  let page = value[0]?.page;
  const spans = value.map((span) => {
    if (
      !span ||
      Object.keys(span).some((key) => !['start', 'end', 'page'].includes(key)) ||
      !Number.isSafeInteger(span.start) ||
      !Number.isSafeInteger(span.end) ||
      span.start !== end ||
      span.end <= end ||
      span.end > source.length ||
      /[\uD800-\uDBFF]/.test(source[span.end - 1]) ||
      (span.page !== null && (!Number.isSafeInteger(span.page) || span.page < 1)) ||
      (page === null ? span.page !== null : span.page === null || span.page < page)
    )
      fail('invalid-argument', 'Faixas de origem inválidas.');
    end = span.end;
    page = span.page;
    return { start: span.start, end, page };
  });
  if (end !== source.length) fail('invalid-argument', 'Origem incompleta.');
  return spans;
}
export function createUniverseLoreImportService({ db, generator, now = Date.now }) {
  const root = (uid, value) => {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    return db.doc(`users/${id(uid)}/universeLoreImports/${id(value)}`);
  };
  async function load(tx, uid, request, terminal = false) {
    const ref = root(uid, request.id);
    const record = (await tx.get(ref)).data();
    if (!record) fail('not-found', 'Importação indisponível.');
    if (!terminal && (record.expiresAt <= now() || ['cancelled', 'applied'].includes(record.state)))
      fail('failed-precondition', 'Importação encerrada ou expirada.');
    if (record.universeId && record.state !== 'applied' && record.state !== 'cancelled') {
      const snapshot = await tx.get(db.doc(`universes/${record.universeId}`));
      owned(snapshot.data(), uid);
      if (stamp(snapshot) !== record.worldStamp)
        fail(
          'failed-precondition',
          'O universo mudou. Inicie outra importação para comparar a versão atual.',
        );
    }
    return { ref, record };
  }
  async function view(uid, request) {
    return db.runTransaction(async (tx) => {
      const { ref, record } = await load(tx, uid, request, true);
      if (record.state === 'cancelled' || record.expiresAt <= now())
        fail('failed-precondition', 'Importação encerrada ou expirada.');
      if (record.state === 'applied')
        return {
          id: request.id,
          version: record.version ?? 1,
          state: 'applied',
          universeId: record.result.universeId,
          cursor: record.cursor,
          total: record.total,
          cost: 1,
          existing: [],
          candidates: [],
          result: record.result,
        };
      const candidates = await tx.get(db.collection(`${ref.path}/importCandidates`).limit(201));
      const review = record.review
        ? await tx.get(db.collection(`${ref.path}/importReview`).limit(201))
        : null;
      return {
        id: ref.id ?? request.id,
        version: record.version ?? 1,
        state: record.state,
        universeId: record.universeId,
        cursor: record.cursor,
        total: record.total,
        cost: 1,
        ...(record.review
          ? {
              pendingReview: {
                ...record.review,
                id: request.id,
                changes: review.docs
                  .map((doc) => doc.data())
                  .sort((a, b) => a.ordinal - b.ordinal)
                  .map(({ candidateId, targetId, input }) => ({ candidateId, targetId, input })),
              },
            }
          : {}),
        existing: record.existing,
        candidates: candidates.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
        ...(record.result ? { result: record.result } : {}),
      };
    });
  }
  return {
    async startUniverseLoreImport(uid, request) {
      const ref = root(uid, request.id);
      if (request.id.length > 100)
        fail('invalid-argument', 'Identificador de importação longo demais.');
      const version = request.version ?? 1;
      if (![1, 2].includes(version)) fail('invalid-argument', 'Versão de importação inválida.');
      const files = manifest(request.files, version);
      const universeId = request.universeId == null ? null : id(request.universeId);
      const fingerprint = hash(version === 1 ? [files, universeId] : [files, universeId, version]);
      await db.runTransaction(async (tx) => {
        const old = (await tx.get(ref)).data();
        if (old) {
          if (old.fingerprint !== fingerprint)
            fail('failed-precondition', 'Identificador já utilizado.');
          return;
        }
        const worldSnapshot = universeId ? await tx.get(db.doc(`universes/${universeId}`)) : null;
        if (worldSnapshot) owned(worldSnapshot.data(), uid);
        const entities = universeId
          ? await tx.get(
              db
                .collection(`universes/${universeId}/lore`)
                .select('name', 'category', 'aliases', 'summary')
                .limit(501),
            )
          : { docs: [] };
        const existing = entities.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          category: doc.data().category,
          aliases: doc.data().aliases ?? [],
          summary: doc.data().summary,
        }));
        if (existing.length > 500 || Buffer.byteLength(JSON.stringify(existing)) > 400000)
          fail('resource-exhausted', 'O contexto deste universo excede o limite de análise.');
        const quotaRef = db.doc(`users/${uid}/universeLoreImportLimits/current`);
        const quota = (await tx.get(quotaRef)).data();
        const window = Math.floor(now() / 3600000);
        const count = quota?.window === window ? quota.count : 0;
        if (count >= 10) fail('resource-exhausted', 'Limite de 10 importações por hora atingido.');
        tx.set(quotaRef, { window, count: count + 1 });
        tx.create(ref, {
          fingerprint,
          version,
          files,
          universeId,
          worldStamp: worldSnapshot ? stamp(worldSnapshot) : null,
          existing,
          generation: platformTextGeneration(undefined, 12000),
          state: 'uploading',
          uploaded: files.map(() => 0),
          sourceCounts: files.map(() => 0),
          sourceChars: 0,
          sourceBytes: files.map(() => 0),
          sourceHashes: files.map(() => ''),
          cursor: 0,
          total: 0,
          expiresAt: now() + 86400000,
        });
      });
      return view(uid, request);
    },
    async appendUniverseLoreImport(uid, request) {
      return db.runTransaction(async (tx) => {
        const { ref, record } = await load(tx, uid, request);
        if (record.state !== 'uploading') fail('failed-precondition', 'Envio encerrado.');
        const file = request.file;
        if (
          !Number.isInteger(file) ||
          !record.files[file] ||
          !Number.isSafeInteger(request.index) ||
          request.index < 0
        )
          fail('invalid-argument', 'Parte inválida.');
        if (
          !['bytes', 'source'].includes(request.kind) ||
          (record.version === 2 && request.kind !== 'source')
        )
          fail('invalid-argument', 'Tipo de parte inválido.');
        const child = db.doc(`${ref.path}/importUploads/${request.kind}-${file}-${request.index}`);
        const previous = (await tx.get(child)).data();
        let spans;
        if (record.version === 2) {
          text(request.payload, 12000, false);
          if (!request.payload.length || Buffer.byteLength(request.payload) > 32000)
            fail('invalid-argument', 'Trecho preparado grande demais ou vazio.');
          spans = sourceSpans(request.spans, request.payload);
        }
        const fingerprint =
          record.version === 2
            ? hash({ text: request.payload, spans })
            : hash([request.payload, request.page ?? null]);
        if (record.version === 2 && request.sha256 !== fingerprint)
          fail('invalid-argument', 'Hash do trecho preparado inválido.');
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            fail('failed-precondition', 'Parte alterada no reenvio.');
          return { accepted: true };
        }
        if (request.kind === 'bytes') {
          text(request.payload, 700000);
          const bytes = Buffer.from(request.payload, 'base64');
          if (
            !bytes.length ||
            bytes.length > 500000 ||
            bytes.toString('base64') !== request.payload ||
            request.index !== record.uploaded[file]
          )
            fail('invalid-argument', 'Bytes inválidos ou fora de ordem.');
          const remaining = record.files[file].size - record.uploaded[file] * 500000;
          if (bytes.length !== Math.min(500000, remaining))
            fail('invalid-argument', 'O tamanho real do arquivo difere do declarado.');
          const uploaded = [...record.uploaded];
          uploaded[file]++;
          tx.create(child, { fingerprint, payload: request.payload });
          tx.update(ref, { uploaded });
        } else {
          const source = text(request.payload, 12000, record.version !== 2);
          if (
            request.index !== record.sourceCounts[file] ||
            request.index >= record.files[file].parts ||
            record.sourceChars + source.length > 20000000 ||
            (request.page != null && (!Number.isInteger(request.page) || request.page < 1))
          )
            fail('invalid-argument', 'Texto extraído inválido ou grande demais.');
          const sourceCounts = [...record.sourceCounts];
          sourceCounts[file]++;
          let prepared = {};
          if (record.version === 2) {
            const sourceBytes = [...record.sourceBytes];
            sourceBytes[file] += Buffer.byteLength(source);
            if (
              sourceBytes[file] > record.files[file].sourceBytes ||
              sourceBytes.reduce((sum, value) => sum + value, 0) > 20000000
            )
              fail('invalid-argument', 'Bytes preparados excedem o manifesto.');
            const sourceHashes = [...record.sourceHashes];
            sourceHashes[file] = hashText(`${sourceHashes[file]}:${fingerprint}`);
            prepared = { sourceBytes, sourceHashes };
          }
          // V2 keeps the text once, in importSources; upload receipts contain metadata only.
          tx.create(
            child,
            record.version === 2
              ? { fingerprint, file }
              : { fingerprint, text: source, page: request.page ?? null, file },
          );
          tx.create(db.doc(`${ref.path}/importSources/${String(record.total).padStart(6, '0')}`), {
            text: source,
            page: spans?.[0].page ?? request.page ?? null,
            ...(spans ? { spans } : {}),
            fileName: record.files[file].name,
          });
          tx.update(ref, {
            sourceCounts,
            sourceChars: record.sourceChars + source.length,
            total: record.total + 1,
            ...prepared,
          });
        }
        return { accepted: true };
      });
    },
    async sealUniverseLoreImport(uid, request) {
      await db.runTransaction(async (tx) => {
        const { ref, record } = await load(tx, uid, request);
        if (record.state !== 'uploading') return;
        if (
          record.files.some(
            (file, i) =>
              record.sourceCounts[i] !== file.parts ||
              (record.version === 2
                ? record.sourceBytes[i] !== file.sourceBytes ||
                  record.sourceHashes[i] !== file.sourceHash
                : record.uploaded[i] !== Math.ceil(file.size / 500000)),
          )
        )
          fail('failed-precondition', 'Envie todos os arquivos e textos antes de analisar.');
        tx.update(ref, { state: 'analyzing' });
      });
      return view(uid, request);
    },
    async advanceUniverseLoreImport(uid, request) {
      const leaseId = randomUUID();
      const captured = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request);
        const { ref, record } = loaded;
        if (record.state === 'ready') return null;
        if (record.state !== 'analyzing' || request.cursor !== record.cursor)
          fail('failed-precondition', 'Progresso alterado. Atualize a importação.');
        if (record.analysisLease?.expiresAt > now())
          fail(
            'failed-precondition',
            'Este lote já está sendo analisado. Aguarde antes de retomar.',
          );
        const sources = await Promise.all(
          Array.from(
            { length: Math.min(ANALYSIS_CONCURRENCY, record.total - record.cursor) },
            async (_, offset) => {
              const ordinal = record.cursor + offset;
              const source = (
                await tx.get(
                  db.doc(`${ref.path}/importSources/${String(ordinal).padStart(6, '0')}`),
                )
              ).data();
              if (!source || typeof source.text !== 'string')
                fail('failed-precondition', 'Trecho da importação indisponível.');
              return { ...source, ordinal };
            },
          ),
        );
        const previous = await tx.get(db.collection(`${ref.path}/importCandidates`).limit(201));
        tx.update(ref, {
          analysisLease: { id: leaseId, cursor: record.cursor, expiresAt: now() + 240000 },
        });
        return {
          ...loaded,
          sources,
          previous: previous.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
        };
      });
      if (!captured) return view(uid, request);
      const { record, sources, previous } = captured;
      try {
        const detected = await Promise.allSettled(
          sources.map(async (source) => {
            const context = {
              analysisVersion: 2,
              generation: record.generation,
              text: source.text,
              lore: selectImportContext(source.text, record.existing),
              alreadyDetected: selectImportContext(source.text, previous).map(
                ({ name, aliases, category, summary }) => ({ name, aliases, category, summary }),
              ),
            };
            const fingerprint = hash([context, source.spans ?? null]);
            if (source.analysis?.fingerprint === fingerprint)
              return {
                source,
                entities: validateDetectedLore(source.analysis.entities, source.text),
              };
            let entities;
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const response = await generator({
                  ...context,
                  ...(attempt
                    ? {
                        validationFeedback:
                          'Use o formato obrigatório e evidência literal deste trecho.',
                      }
                    : {}),
                });
                const parsed =
                  typeof response === 'string'
                    ? JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, ''))
                    : response;
                entities = validateDetectedLore(parsed.entities, source.text);
                break;
              } catch (error) {
                if (attempt || !(error instanceof SyntaxError || error instanceof GenerationError))
                  fail(
                    'unavailable',
                    'A análise não foi concluída. Tente novamente; nenhum crédito foi debitado.',
                  );
              }
            }
            if (Buffer.byteLength(JSON.stringify({ text: source.text, entities })) > 900000)
              fail(
                'resource-exhausted',
                'A análise deste trecho excede o limite. Divida o documento.',
              );
            await db.runTransaction(async (tx) => {
              const { ref, record: current } = await load(tx, uid, request);
              const sourceRef = db.doc(
                `${ref.path}/importSources/${String(source.ordinal).padStart(6, '0')}`,
              );
              const currentSource = (await tx.get(sourceRef)).data();
              if (
                current.state !== 'analyzing' ||
                current.cursor !== record.cursor ||
                current.analysisLease?.id !== leaseId ||
                current.analysisLease.expiresAt <= now() ||
                !currentSource ||
                hash([currentSource.text, currentSource.spans ?? null]) !==
                  hash([source.text, source.spans ?? null])
              )
                fail('failed-precondition', 'O lote ou a origem da análise mudou.');
              tx.update(sourceRef, { analysis: { fingerprint, entities } });
            });
            return { source, entities };
          }),
        );
        // Drain the bounded batch before returning an error; no partial batch is committed.
        const failed = detected.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
        await db.runTransaction(async (tx) => {
          const { ref, record: current } = await load(tx, uid, request);
          if (current.cursor > record.cursor) return;
          if (
            current.state !== 'analyzing' ||
            current.cursor !== record.cursor ||
            current.analysisLease?.id !== leaseId ||
            current.analysisLease.expiresAt <= now()
          )
            fail('failed-precondition', 'Progresso alterado.');
          const consolidated = [...previous];
          const changed = new Set();
          // allSettled preserves source order, regardless of model completion order.
          for (const result of detected) {
            const { source, entities } = result.value;
            for (const item of entities) {
              const terms = [item.name, ...item.aliases].map(norm);
              const matches = consolidated.filter(
                (v) =>
                  v.category === item.category &&
                  [v.name, ...v.aliases].some((v) => terms.includes(norm(v))),
              );
              const before = matches.length === 1 ? matches[0] : null;
              const candidateId =
                before?.id ?? hash([source.ordinal, consolidated.length, item.name]).slice(0, 32);
              const candidate = {
                ...item,
                fileName: source.fileName,
                ...locateImportEvidence(source, item.evidence),
                ...(before
                  ? {
                      details: [...new Set([before.details, item.details].filter(Boolean))].join(
                        '\n\n',
                      ),
                      aliases: [...new Set([...before.aliases, ...item.aliases])],
                    }
                  : {}),
                id: candidateId,
              };
              if (candidate.aliases.length > 20)
                fail(
                  'resource-exhausted',
                  'Mais de 20 apelidos consolidados. Divida os documentos em importações menores.',
                );
              if (candidate.details.length > 150000)
                fail('resource-exhausted', 'Detalhes consolidados excedem o limite da ficha.');
              if (before) consolidated[consolidated.indexOf(before)] = candidate;
              else consolidated.push(candidate);
              changed.add(candidateId);
            }
          }
          if (
            consolidated.length > 200 ||
            Buffer.byteLength(JSON.stringify(consolidated)) > 4000000
          )
            fail(
              'resource-exhausted',
              'Mais de 200 sugestões ou resultado acima de 4 MB. Divida os documentos em importações menores.',
            );
          for (const candidate of consolidated)
            if (changed.has(candidate.id))
              tx.set(db.doc(`${ref.path}/importCandidates/${candidate.id}`), candidate);
          tx.update(ref, {
            cursor: current.cursor + sources.length,
            state: current.cursor + sources.length === current.total ? 'ready' : 'analyzing',
            analysisLease: null,
          });
        });
        return view(uid, request);
      } finally {
        // Metadata-only release also works after cancellation/revocation. A stale
        // invocation must never clear a successor's lease or recreate cleaned data.
        await db.runTransaction(async (tx) => {
          const ref = root(uid, request.id);
          const current = (await tx.get(ref)).data();
          if (current?.analysisLease?.id === leaseId) tx.update(ref, { analysisLease: null });
        });
      }
    },
    getUniverseLoreImport: view,
    async getUniverseLoreImportTarget(uid, request) {
      return db.runTransaction(async (tx) => {
        const { record } = await load(tx, uid, request);
        if (!record.universeId || !record.existing.some((v) => v.id === request.targetId))
          fail('invalid-argument', 'Ficha inválida.');
        const value = (
          await tx.get(db.doc(`universes/${record.universeId}/lore/${id(request.targetId)}`))
        ).data();
        if (!value) fail('failed-precondition', 'A ficha mudou.');
        return {
          id: request.targetId,
          ...Object.fromEntries(
            ['name', 'category', 'aliases', 'summary', 'details'].map((key) => [
              key,
              value[key] ?? (key === 'aliases' ? [] : ''),
            ]),
          ),
        };
      });
    },
    async saveUniverseLoreImportReview(uid, request) {
      root(uid, request.id);
      id(request.operationId);
      const name = text(request.name ?? '', 200, false);
      const description = text(request.description ?? '', 4000, false);
      if (
        !Array.isArray(request.changes) ||
        !request.changes.length ||
        request.changes.length > 200
      )
        fail('invalid-argument', 'Revisão inválida.');
      const changes = request.changes.map((v) => ({
        candidateId: id(v.candidateId),
        targetId: v.targetId == null ? null : id(v.targetId),
        input: fields(v.input),
      }));
      if (Buffer.byteLength(JSON.stringify(changes)) > 4000000)
        fail('invalid-argument', 'Revisão grande demais.');
      const fingerprint = hash([request.id, changes, name, description]);
      await db.runTransaction(async (tx) => {
        const receipt = (
          await tx.get(db.doc(`users/${uid}/universeLoreImportReceipts/${request.operationId}`))
        ).data();
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            fail('failed-precondition', 'Confirmação alterada no reenvio.');
          return;
        }
        const { ref, record } = await load(tx, uid, request);
        if (record.state !== 'ready')
          fail('failed-precondition', 'Conclua a análise antes de revisar.');
        if (record.review) {
          if (
            record.review.fingerprint !== fingerprint ||
            record.review.operationId !== request.operationId
          )
            fail('failed-precondition', 'Confirmação anterior pendente. Retome-a antes de editar.');
          return;
        }
        changes.forEach((change, ordinal) =>
          tx.create(db.doc(`${ref.path}/importReview/${String(ordinal).padStart(4, '0')}`), {
            ...change,
            ordinal,
          }),
        );
        tx.update(ref, {
          review: { operationId: request.operationId, name, description, fingerprint },
        });
      });
      return { saved: true };
    },
    async applyUniverseLoreImport(uid, request) {
      const ref = root(uid, request.id);
      const receiptRef = db.doc(
        `users/${uid}/universeLoreImportReceipts/${id(request.operationId)}`,
      );
      if (
        !Array.isArray(request.changes) ||
        !request.changes.length ||
        request.changes.length > 200
      )
        fail('invalid-argument', 'Selecione de 1 a 200 entradas.');
      const changes = request.changes.map((v) => ({
        candidateId: id(v.candidateId),
        targetId: v.targetId == null ? null : id(v.targetId),
        input: fields(v.input),
      }));
      const name = text(request.name ?? '', 200, false);
      const description = text(request.description ?? '', 4000, false);
      if (Buffer.byteLength(JSON.stringify(changes)) > 4000000)
        fail('invalid-argument', 'Revisão grande demais.');
      const fingerprint = hash([request.id, changes, name, description]);
      return db.runTransaction(async (tx) => {
        const receipt = (await tx.get(receiptRef)).data();
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            fail('failed-precondition', 'Confirmação alterada no reenvio.');
          return receipt.result;
        }
        const { record } = await load(tx, uid, request);
        if (record.state !== 'ready')
          fail('failed-precondition', 'Conclua a análise antes de confirmar.');
        if (
          !record.review ||
          record.review.operationId !== request.operationId ||
          record.review.fingerprint !== fingerprint
        )
          fail('failed-precondition', 'Salve a revisão exata antes de confirmar.');
        if (!record.universeId && !name.trim())
          fail('invalid-argument', 'Informe o nome do universo.');
        const universeId = record.universeId ?? `import-${request.id}`;
        const worldRef = db.doc(`universes/${universeId}`);
        const markerRef = db.doc(`publicUniversePrivacy/${universeId}`);
        const world = (await tx.get(worldRef)).data();
        const marker = (await tx.get(markerRef)).data();
        if (!record.universeId && (world || marker))
          fail('failed-precondition', 'O identificador do universo já foi utilizado.');
        const userRef = db.doc(`users/${uid}`);
        const user = (await tx.get(userRef)).data();
        if (!Number.isSafeInteger(user?.credits) || user.credits < 1)
          fail('resource-exhausted', 'Saldo insuficiente: o lote custa 1 crédito.');
        const seen = new Set();
        const seenCandidates = new Set();
        const writes = [];
        let writeBytes = 0;
        for (const change of changes) {
          if (seenCandidates.has(change.candidateId))
            fail('invalid-argument', 'Sugestão repetida.');
          seenCandidates.add(change.candidateId);
          if (!(await tx.get(db.doc(`${ref.path}/importCandidates/${change.candidateId}`))).exists)
            fail('invalid-argument', 'Sugestão indisponível.');
          const entityId =
            change.targetId ?? `import-${hash([request.id, change.candidateId]).slice(0, 32)}`;
          if (seen.has(entityId))
            fail('invalid-argument', 'Escolha cada ficha de destino somente uma vez.');
          seen.add(entityId);
          const entityRef = db.doc(`${worldRef.path}/lore/${entityId}`);
          const before = (await tx.get(entityRef)).data();
          if (
            change.targetId &&
            (!record.existing.some((v) => v.id === change.targetId) || !before)
          )
            fail('failed-precondition', 'Ficha de destino indisponível.');
          if (!change.targetId && before) fail('failed-precondition', 'Entrada já existente.');
          const value = before
            ? { ...before, ...change.input, updatedAt: now() }
            : {
                ...change.input,
                isPublic: false,
                relations: [],
                structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
                createdAt: now(),
                updatedAt: now(),
              };
          writeBytes += Buffer.byteLength(JSON.stringify(value));
          if (writeBytes > 4000000)
            fail('resource-exhausted', 'As fichas resultantes excedem 4 MB. Divida a importação.');
          if (Buffer.byteLength(JSON.stringify(value)) > 900000)
            fail('invalid-argument', 'Ficha global grande demais.');
          writes.push({ ref: entityRef, value, update: !!before });
        }
        const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
        const result = {
          universeId,
          created: writes.filter((v) => !v.update).length,
          updated: writes.filter((v) => v.update).length,
        };
        authorization.commit();
        for (const write of writes) tx.set(write.ref, write.value);
        if (world) tx.update(worldRef, { loreVersion: world.loreVersion + 1, updatedAt: now() });
        else {
          tx.create(worldRef, {
            authorId: uid,
            name,
            description,
            bookCount: 0,
            adventureCount: 0,
            campaignCount: 0,
            privacyVersion: 0,
            loreVersion: 1,
            createdAt: now(),
            updatedAt: now(),
          });
          tx.create(markerRef, { active: true, version: 0 });
        }
        tx.update(userRef, { credits: user.credits - 1, updatedAt: now() });
        tx.create(receiptRef, { fingerprint, result });
        tx.update(ref, { state: 'applied', result });
        return result;
      });
    },
    async cancelUniverseLoreImport(uid, request) {
      await db.runTransaction(async (tx) => {
        const ref = root(uid, request.id);
        const record = (await tx.get(ref)).data();
        if (!record) {
          tx.create(ref, { state: 'cancelled', expiresAt: now(), fingerprint: null });
          return;
        }
        if (record.state === 'applied')
          fail(
            'failed-precondition',
            'A importação já foi confirmada. Retome para abrir o resultado.',
          );
        tx.update(ref, { state: 'cancelled', expiresAt: now() });
      });
      return { cancelled: true };
    },
  };
}
