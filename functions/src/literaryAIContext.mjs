import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import { parseFragment } from 'parse5';
import { workProject, workScope, workFail, workId, digest } from './workProgressContracts.mjs';
import { editorialStored } from './literaryContracts.mjs';
import { createLiteraryReferenceReader, mergeLiteraryReferences } from './literaryReferences.mjs';
import { createBookLoreContextReader } from './bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from './bookLoreTextProjection.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { literaryPlan } from './literaryPlanningSchema.mjs';

export function literaryProseText(html) {
  const dropped = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'template',
    'noscript',
    'head',
  ]);
  const blocks = new Set([
    'p',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
    'br',
    'hr',
    'pre',
    'tr',
  ]);
  function walk(node) {
    if (dropped.has(node.tagName)) return '';
    if (node.nodeName === '#text') return node.value;
    const value = (node.childNodes ?? []).map(walk).join('');
    return blocks.has(node.tagName) ? value + '\n' : value;
  }
  return walk(parseFragment(html)).replace(/\r\n/g, '\n');
}
export async function captureLiteraryAIContext(tx, context, request) {
  const { db, uid } = context;
  const root = await workProject(tx, context);
  const bookSnapshot = await tx.get(context.ref);
  const birth = bookSnapshot.createTime;
  if (!Number.isSafeInteger(birth?.seconds) || !Number.isSafeInteger(birth?.nanoseconds))
    workFail('failed-precondition', 'Identidade do livro indisponível.');
  const editorial = editorialStored(
    (await tx.get(db.doc(context.path + '/literaryProduction/current'))).data(),
  );
  const documents = [
    {
      id: 'contract',
      label: 'Contrato editorial',
      revision: editorial.revision,
      text: JSON.stringify(editorial.contract),
    },
    {
      id: 'draft',
      label: 'Planejamento em revisão',
      revision: request.expectedRevision,
      text: JSON.stringify(request.plan),
    },
  ];
  const proof = {
    bookBirth: [birth.seconds, birth.nanoseconds],
    contractRevision: editorial.revision,
    plans: [],
    references: [],
  };
  const linkedReferences = [...request.plan.references];
  for (const id of request.sourcePlanIds) {
    const planSnapshot = await tx.get(db.doc(context.path + '/literaryPlans/' + workId(id)));
    const value = planSnapshot.data();
    if (!value) workFail('failed-precondition', 'Um planejamento escolhido não está disponível.');
    const sourcePlan = literaryPlan(value.plan);
    linkedReferences.push(...sourcePlan.references);
    const planBirth = planSnapshot.createTime;
    if (!Number.isSafeInteger(planBirth?.seconds) || !Number.isSafeInteger(planBirth?.nanoseconds))
      workFail('failed-precondition', 'Identidade nativa do planejamento indisponível.');
    const bookToken = digest({
      domain: 'literary-writing-book-v1',
      uid: context.uid,
      target: context.target,
      birth: proof.bookBirth,
    });
    const identityToken = digest({
      domain: 'literary-plan-identity-v1',
      uid: context.uid,
      bookToken,
      id,
      birth: [planBirth.seconds, planBirth.nanoseconds],
    });
    proof.plans.push({ id, identityToken, revision: value.revision });
    documents.push({
      id: 'plan:' + id,
      label: value.plan.title,
      revision: value.revision,
      text: JSON.stringify(value.plan),
    });
  }
  const read = await createLiteraryReferenceReader(tx, context, root);
  let localReader;
  const loreBudget = createBookLoreProjectionBudget({
    bytes: 32 * 1024 * 1024,
    parts: 512,
    retainedBytes: 300000,
  });
  const distinctReferences = mergeLiteraryReferences(context, root, linkedReferences);
  if (distinctReferences.length > 24)
    workFail(
      'resource-exhausted',
      'Escolha menos fontes de apoio: o contexto admite até 24 vínculos distintos.',
    );
  for (const reference of distinctReferences) {
    const actual = await read(reference, true);
    if (
      !actual ||
      actual.reference.sourceToken !== reference.sourceToken ||
      (reference.purpose !== 'subject' && actual.reference.revision !== reference.revision)
    )
      workFail('failed-precondition', 'Uma referência mudou; confira as fontes antes de gerar.');
    const stamp = {
      reference: { ...reference, scopeId: actual.reference.scopeId },
      identityToken: actual.identityToken,
      versionToken:
        reference.purpose === 'subject' && ['act', 'chapter', 'scene'].includes(reference.kind)
          ? actual.identityToken
          : actual.versionToken,
      bodyToken: null,
      label: actual.label,
    };
    let text;
    if (reference.purpose === 'subject') {
      text = JSON.stringify({
        kind: reference.kind,
        id: reference.id,
        label: actual.label,
        purpose: 'Unidade planejada; conteúdo não incluído como fonte',
      });
    } else if (reference.kind === 'volumeUnit') {
      const origin = validateLiteraryVolumeReference(reference);
      const foreign = workScope(db, uid, { target: { kind: 'book', id: origin.bookId } }, []);
      // The reference reader has authorized both the source book and the native unit.
      // Reuse the native body reader; a composed chapter requires selecting its scenes.
      if (['chapter', 'scene'].includes(origin.kind)) {
        const source = await readHistorySource(tx, db, foreign, {
          kind: origin.kind,
          id: origin.id,
        });
        if (!source)
          workFail(
            'failed-precondition',
            'Escolha as cenas ativas do capítulo composto no volume de origem.',
          );
        text = literaryProseText(source.source.content);
        stamp.bodyToken = source.source.sourceToken;
      } else {
        const value = (
          await tx.get(
            db.doc(
              foreign.path +
                '/' +
                { act: 'acts', arc: 'arcs', event: 'timelineEvents' }[origin.kind] +
                '/' +
                origin.id,
            ),
          )
        ).data();
        const keys = [
          'name',
          'title',
          'initialState',
          'objective',
          'plannedOutcome',
          'description',
          'dateLabel',
        ];
        text = JSON.stringify(
          Object.fromEntries(
            keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
          ),
        );
      }
    } else if (['chapter', 'scene'].includes(reference.kind)) {
      const source = await readHistorySource(tx, db, context, {
        kind: reference.kind,
        id: reference.id,
      });
      if (!source)
        workFail(
          'failed-precondition',
          'Selecione as cenas ativas para um capítulo composto ou confira a fonte.',
        );
      text = literaryProseText(source.source.content);
      stamp.bodyToken = source.source.sourceToken;
    } else if (reference.kind === 'localLore') {
      localReader ??= await createBookLoreContextReader(tx, db, uid, context.target.id);
      const source = await localReader.read(
        reference.id,
        { name: null, summary: null, details: null },
        loreBudget,
      );
      text = JSON.stringify(
        Object.fromEntries(Object.entries(source.fields).map(([key, value]) => [key, value.value])),
      );
    } else {
      const path =
        reference.kind === 'globalLore'
          ? 'universes/' + root.universeId + '/lore/' + reference.id
          : context.path +
            '/' +
            { act: 'acts', arc: 'arcs', event: 'timelineEvents' }[reference.kind] +
            '/' +
            reference.id;
      const value = (await tx.get(db.doc(path))).data();
      const keys =
        reference.kind === 'globalLore'
          ? ['name', 'category', 'summary', 'details']
          : [
              'name',
              'title',
              'initialState',
              'objective',
              'plannedOutcome',
              'description',
              'dateLabel',
            ];
      text = JSON.stringify(
        Object.fromEntries(
          keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
        ),
      );
    }
    if (text.length > 120000)
      workFail(
        'resource-exhausted',
        'Uma fonte excede o limite desta análise. Escolha cenas menores; não foi feita leitura parcial.',
      );
    documents.push({
      id:
        reference.kind === 'volumeUnit'
          ? 'volume-unit:' + digest({ id: reference.id, scopeId: reference.scopeId })
          : reference.kind + ':' + reference.id + ':' + (reference.purpose ?? 'source'),
      label: actual.label,
      revision: reference.revision,
      text,
    });
    proof.references.push(stamp);
  }
  if (Buffer.byteLength(JSON.stringify(documents)) > 500000)
    workFail(
      'resource-exhausted',
      'As fontes excedem o orçamento. Escolha um conjunto menor; nenhuma fonte foi truncada.',
    );
  return {
    proofToken: digest(proof),
    proof,
    documents,
    coverage: {
      scope: 'selected-sources',
      completeForSelection: true,
      wholeBook: false,
      documentCount: documents.length,
    },
  };
}
