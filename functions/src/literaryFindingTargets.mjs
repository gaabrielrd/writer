import { readCurrentLiteraryArchitectureSource } from './literaryArchitectureSources.mjs';
import { readLiteraryArchitectureTargetId } from './literaryArchitectureProtocol.mjs';
import {
  workClosed,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { editorialStored } from './literaryContracts.mjs';
import { literaryFindingEditorialIdentity } from './literarySourceOrigins.mjs';
const kinds = [
  'chapter',
  'scene',
  'act',
  'arc',
  'event',
  'localLore',
  'globalLore',
  'plan',
  'contract',
  'architecture',
];
export function literaryFindingTarget(value) {
  if (value === null) return null;
  workClosed(value, ['kind', 'id', 'scopeId']);
  if (!kinds.includes(value.kind)) workFail('invalid-argument', 'Destino editorial inválido.');
  if (value.kind === 'architecture') {
    try {
      readLiteraryArchitectureTargetId(value.id);
    } catch {
      workFail('invalid-argument', 'Origem arquitetural inválida.');
    }
  }
  return {
    kind: value.kind,
    id: value.kind === 'architecture' ? value.id : workId(value.id),
    scopeId: value.scopeId == null ? null : workId(value.scopeId),
  };
}
export async function readLiteraryFindingTarget(tx, c, input) {
  const target = literaryFindingTarget(input),
    root = await workProject(tx, c);
  if (!target) workFail('invalid-argument', 'Escolha o destino da alteração.');
  if (target.kind === 'architecture') {
    if (target.scopeId !== c.target.id) workFail('permission-denied', 'Destino de outro livro.');
    const current = await readCurrentLiteraryArchitectureSource(
      tx,
      c,
      readLiteraryArchitectureTargetId(target.id),
    );
    return {
      target,
      label: literaryFindingArchitectureLabel(current),
      identityToken: current.identityToken,
      versionToken: current.token,
      contentHash: digest(current.text),
      revision: 0,
      proofKind: 'architecture',
      source: null,
      mode: null,
    };
  }
  if (target.kind === 'contract' || target.kind === 'plan') {
    if (target.scopeId !== null && target.scopeId !== c.target.id)
      workFail('permission-denied', 'Destino de outro livro.');
    if (target.kind === 'contract' && target.id !== 'current')
      workFail('invalid-argument', 'Guia editorial inválido.');
    const ref = c.db.doc(
      c.path +
        (target.kind === 'contract'
          ? '/literaryProduction/current'
          : '/literaryPlans/' + target.id),
    );
    const row = await tx.get(ref),
      value = row.data(),
      book = await readWorkMetadata(tx, c.ref, []);
    if (!value) workFail('not-found', 'Documento editorial indisponível.');
    const revision = value.revision,
      content = target.kind === 'contract' ? editorialStored(value).contract : value.plan;
    if (!Number.isSafeInteger(revision) || revision < 1)
      workFail('failed-precondition', 'Revisão editorial inválida.');
    const identityToken = literaryFindingEditorialIdentity(c, {
      book,
      kind: target.kind,
      id: target.id,
      row,
    });
    return {
      target: { ...target, scopeId: c.target.id },
      label: target.kind === 'contract' ? 'Guia editorial' : value.plan.title,
      identityToken,
      versionToken: digest({ identityToken, revision, content }),
      contentHash: digest(content),
      revision,
      proofKind: 'editorial',
      source: null,
      mode: null,
    };
  }
  const read = await createLiteraryReferenceReader(tx, c, root);
  const current = await read({ ...target, purpose: 'source' }, true);
  if (!current) workFail('permission-denied', 'O destino da alteração não está disponível.');
  if (['chapter', 'scene'].includes(target.kind)) {
    const native = await readHistorySource(tx, c.db, c, { kind: target.kind, id: target.id });
    if (!native)
      workFail(
        'failed-precondition',
        'Escolha uma cena para confirmar alterações de um capítulo composto.',
      );
    return {
      target: { kind: target.kind, id: target.id, scopeId: c.target.id },
      label: current.label,
      identityToken: current.identityToken,
      versionToken: current.versionToken,
      contentHash: native.source.contentHash,
      revision: current.reference.revision,
      proofKind: 'text',
      source: native.source,
      mode: 'text',
    };
  }
  // For nontext native sources, this certifies a saved native revision, not
  // an automatic literary judgement about which fields the author corrected.
  return {
    target: { kind: target.kind, id: target.id, scopeId: current.reference.scopeId },
    label: current.label,
    identityToken: current.identityToken,
    versionToken: current.versionToken,
    contentHash: current.versionToken,
    revision: current.reference.revision,
    proofKind: 'reference',
    source: null,
    mode: null,
  };
}
export function literaryFindingTargetLink(jobId, target) {
  return digest({ jobId, kind: target.kind, id: target.id, scopeId: target.scopeId });
}

export function literaryFindingArchitectureLabel(value) {
  const names = {
    act: 'Ato',
    chapter: 'Estrutura do capítulo',
    scene: 'Planejamento da cena',
    arc: 'Arco',
    event: 'Evento',
    arcMilestone: 'Marco de arco',
    sceneLink: 'Vínculo de cena',
    narrativeLink: 'Vínculo narrativo',
    narrativeControl: 'Ordem narrativa',
  };
  return (
    (names[value.source.kind] ?? 'Arquitetura') +
    ' · ' +
    value.label +
    (value.source.arcId ? ' · arco ' + value.source.arcId : '')
  );
}
