import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import { readLiteraryArchitectureTargetId } from './literaryArchitectureProtocol.mjs';
import {
  normalizeLiteraryImpactNode,
  normalizeLiteraryImpactLink,
  literaryImpactLinkKey,
  literaryImpactNodeKey,
  literaryImpactArcMilestoneId,
  literaryImpactPersonaBindingId,
} from './literaryImpactProtocol.mjs';
import { normalizeLiteraryWritingManifest } from './literaryWritingProtocol.mjs';
import { normalizeLiteraryGenerationDependencies } from './literaryGenerationDependencies.mjs';
import { normalizeLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';
import { digest } from './workProgressContracts.mjs';

// The caller supplies only metadata read after native authorization. These adapters
// do not read bodies, resolve deleted IDs, grant access, or certify source freshness.
export function createLiteraryImpactLinks({
  bookId,
  universeId = null,
  bookToken = null,
  ownerId = null,
}) {
  const node = (kind, id, scopeId = bookId) =>
    normalizeLiteraryImpactNode({
      kind,
      id,
      scopeKind: kind === 'globalLore' ? 'universe' : 'book',
      scopeId,
    });
  node('book', bookId);
  const observed = (value = {}) => {
    const result = {
      scheme: value.scheme ?? 'unknown',
      originToken: value.originToken ?? null,
      identityToken: value.identityToken ?? null,
      versionToken: value.versionToken ?? null,
      revision: value.revision ?? null,
    };
    return [result.originToken, result.identityToken, result.versionToken, result.revision].every(
      (item) => item === null,
    )
      ? null
      : result;
  };
  const reference = (ref) => {
    if (ref.kind === 'volumeUnit') {
      const origin = validateLiteraryVolumeReference({ ...ref, purpose: 'source' });
      if (origin.bookId === bookId) throw new TypeError('Uma fonte de volume exige outro livro.');
      return node(origin.kind, origin.id, origin.bookId);
    }
    const scopeId =
      ref.kind === 'globalLore' ? (ref.scopeId ?? universeId) : (ref.scopeId ?? bookId);
    if (ref.kind === 'globalLore' ? scopeId === null || scopeId !== universeId : scopeId !== bookId)
      throw new TypeError('Referência fora do escopo do mapa de impacto.');
    return node(ref.kind, ref.id, scopeId);
  };
  const build = (record) => {
    const links = new Map();
    return {
      add(from, to, relation, capture = null) {
        // A native self-reference contributes no additional affected unit.
        if (literaryImpactNodeKey(from) === literaryImpactNodeKey(to)) return;
        const link = normalizeLiteraryImpactLink({ from, to, relation, record, capture });
        links.set(literaryImpactLinkKey(link), link);
      },
      result() {
        return [...links.values()];
      },
    };
  };
  const architectureOwner = (out, target) => {
    if (target.kind !== 'architecture') return;
    const source = readLiteraryArchitectureTargetId(target.id);
    const owner =
      source.kind === 'arcMilestone'
        ? node('arcMilestone', literaryImpactArcMilestoneId(source.arcId, source.id))
        : ['act', 'chapter', 'scene', 'arc', 'event'].includes(source.kind)
          ? node(source.kind, source.id)
          : node('book', bookId);
    // A structural projection is part of its native resource, not a separate prose origin.
    // Link/control projections retain book containment until their own native topology is inventoried.
    out.add(owner, reference(target), 'composition');
  };
  const methods = {
    node,
    structural({ collection, id, data }) {
      const out = build({ collection, id });
      if (collection === 'chapters') {
        const chapter = node('chapter', id);
        if (!data.deleting) {
          out.add(chapter, node('book', bookId), 'composition');
          if (data.actId != null) out.add(chapter, node('act', data.actId), 'composition');
        }
      } else if (['acts', 'arcs', 'timelineEvents'].includes(collection)) {
        const kind = { acts: 'act', arcs: 'arc', timelineEvents: 'event' }[collection];
        if (!data.deleting) out.add(node(kind, id), node('book', bookId), 'composition');
      } else if (collection === 'scenes') {
        if (!data.deleting && !data.archived && data.parentId != null && data.parentActive === true)
          out.add(node('scene', id), node('chapter', data.parentId), 'composition');
        // parentActive is supplied only after checking the active parent and its
        // contentMode. An orphan/archived/legacy-parent scene is not manuscript.
      } else throw new TypeError('Inventário estrutural não suportado.');
      return out.result();
    },
    plan({ id, revision, plan }) {
      if (!plan || !Array.isArray(plan.references) || plan.references.length > 24)
        throw new TypeError('Referências do planejamento inválidas.');
      const out = build({ collection: 'literaryPlans', id }),
        consumer = node('plan', id);
      for (const ref of plan.references) {
        if (!['source', 'subject'].includes(ref.purpose))
          throw new TypeError('Finalidade da referência inválida.');
        const source = reference(ref);
        out.add(
          source,
          consumer,
          ref.purpose === 'subject' ? 'subject' : 'source',
          observed({ scheme: 'reference', originToken: ref.sourceToken, revision: ref.revision }),
        );
        // The plan guides its subject. This is an explicit association, never
        // proof that the subject prose consumed every field of the plan.
        if (ref.purpose === 'subject')
          out.add(
            consumer,
            source,
            'subject',
            observed({ scheme: 'editorial-revision', originToken: bookToken, revision }),
          );
      }
      return out.result();
    },
    manifest({ collection, id, consumer, manifest }) {
      const value = normalizeLiteraryWritingManifest(manifest),
        out = build({ collection, id });
      if (value.target.id !== bookId) throw new TypeError('Manifesto de outro livro.');
      const destination = normalizeLiteraryImpactNode(consumer);
      if (destination.scopeKind !== 'book' || destination.scopeId !== bookId)
        throw new TypeError('Artefato de outro escopo.');
      if (value.contractRevision)
        out.add(
          node('contract', 'current'),
          destination,
          'source',
          observed({
            scheme: 'editorial-revision',
            originToken: value.bookToken,
            revision: value.contractRevision,
          }),
        );
      for (const plan of value.plans)
        out.add(
          node('plan', plan.id),
          destination,
          'source',
          observed({ ...plan, scheme: 'writing-plan' }),
        );
      for (const item of value.references) {
        const ref = item.reference;
        out.add(
          reference(ref),
          destination,
          ref.purpose === 'subject' ? 'subject' : 'source',
          observed({
            scheme: 'reference',
            originToken: ref.sourceToken,
            identityToken: item.identityToken,
            versionToken: item.versionToken,
            revision: ref.revision,
          }),
        );
      }
      // Resource names the operation target. It is not automatically a read of
      // that unit's complete manuscript; actual source links are separate.
      out.add(node(value.resource.kind, value.resource.id), destination, 'subject');
      return out.result();
    },
    persona({ collection, id, consumer, dependencies }) {
      const value = normalizeLiteraryPersonaDependencies(dependencies),
        out = build({ collection, id });
      if (value.target.id !== bookId || value.ownerId !== ownerId)
        throw new TypeError('Dependência de persona de outro escopo.');
      const destination = normalizeLiteraryImpactNode(consumer);
      if (destination.scopeKind !== 'book' || destination.scopeId !== bookId)
        throw new TypeError('Consumidor de persona de outro livro.');
      for (const binding of value.bindings) {
        const origin = node(
          'personaBinding',
          literaryImpactPersonaBindingId(binding.scopeKind, binding.scopeId),
        );
        out.add(
          origin,
          destination,
          'source',
          observed({
            scheme: 'persona-binding',
            identityToken: binding.identityToken,
            versionToken: digest(binding),
            revision: binding.personaRevision,
          }),
        );
      }
      for (const profile of value.profiles)
        if (profile) {
          const origin = normalizeLiteraryImpactNode({
            kind: 'persona',
            id: profile.id,
            scopeKind: 'user',
            scopeId: ownerId,
          });
          out.add(
            origin,
            destination,
            'source',
            observed({
              scheme: 'persona-profile',
              identityToken: profile.identityToken,
              versionToken: digest(profile),
              revision: profile.revision,
            }),
          );
        }
      return out.result();
    },
    generation({ id, dependencies }) {
      const value = normalizeLiteraryGenerationDependencies(dependencies),
        out = build({ collection: 'literaryGenerations', id });
      const destination = node('generation', id);
      if (value.contractRevision)
        out.add(
          node('contract', 'current'),
          destination,
          'source',
          observed({
            scheme: 'editorial-revision',
            originToken: bookToken,
            revision: value.contractRevision,
          }),
        );
      for (const plan of value.plans)
        out.add(
          node('plan', plan.id),
          destination,
          'source',
          observed({ ...plan, scheme: 'writing-plan' }),
        );
      for (const item of value.references) {
        const ref = item.reference;
        out.add(
          reference(ref),
          destination,
          ref.purpose === 'subject' ? 'subject' : 'source',
          observed({
            scheme: 'reference',
            originToken: ref.sourceToken,
            identityToken: item.identityToken,
            versionToken: item.versionToken,
            revision: ref.revision,
          }),
        );
      }
      return out.result();
    },
    integrationSource({
      id,
      jobId,
      target,
      scheme = 'unknown',
      originToken = null,
      identityToken = null,
      revision = null,
      versionToken = null,
    }) {
      const out = build({ collection: 'literaryIntegrationSourceLinks', id });
      out.add(
        reference(target),
        node('integration', jobId),
        'source',
        observed({ scheme, originToken, identityToken, revision, versionToken }),
      );
      architectureOwner(out, target);
      return out.result();
    },
    integrationUnit({ id, jobId, resource }) {
      const out = build({ collection: 'literaryIntegrationUnitLinks', id });
      if (!['chapter', 'scene'].includes(resource.kind))
        throw new TypeError('Unidade de integração inválida.');
      out.add(node(resource.kind, resource.id), node('integration', jobId), 'source');
      return out.result();
    },
    preparation({ id, manifest }) {
      const consumer = node('preparation', id);
      return methods.manifest({ collection: 'literaryPreparationGates', id, consumer, manifest });
    },
    chapterArtifact({ collection, id, kind, chapterId, planIds = [] }) {
      if (
        !['draft', 'milestone', 'review'].includes(kind) ||
        !Array.isArray(planIds) ||
        planIds.length > 8
      )
        throw new TypeError('Artefato de capítulo inválido.');
      const out = build({ collection, id }),
        consumer = node(kind, id);
      out.add(node('chapter', chapterId), consumer, kind === 'milestone' ? 'preserves' : 'source');
      for (const planId of planIds) out.add(node('plan', planId), consumer, 'source');
      if (kind === 'draft') out.add(node('preparation', chapterId), consumer, 'source');
      return out.result();
    },
    finding({ id, source, target, baseline = null, correction = null }) {
      const out = build({ collection: 'literaryFindingDecisions', id }),
        consumer = node('finding', id);
      out.add(node('integration', source.jobId), consumer, 'source');
      if (target) {
        // A selected correction destination is an author association. A later
        // source edit is not proof that the intended correction was made.
        out.add(
          reference(target),
          consumer,
          'target',
          observed({
            scheme: 'finding-target',
            identityToken: baseline?.identityToken,
            versionToken: baseline?.versionToken,
            revision: baseline?.revision,
          }),
        );
      }
      if (target) architectureOwner(out, target);
      if (correction) out.add(node('integration', correction.successorJobId), consumer, 'source');
      return out.result();
    },
    narrative({ id, source, reference: ref }) {
      const out = build({ collection: 'narrativeLinks', id });
      let origin;
      if (source.kind === 'arc' || source.kind === 'event') origin = node(source.kind, source.id);
      else if (source.kind === 'milestone') {
        // A native narrative milestone has an arc-scoped identity.
        origin = node('arcMilestone', literaryImpactArcMilestoneId(source.arcId, source.id));
      } else throw new TypeError('Origem narrativa não suportada.');
      let destination;
      if (ref.kind === 'scene') destination = node('scene', ref.sceneId);
      else if (ref.kind === 'event') destination = node('event', ref.eventId);
      else if (ref.kind === 'lore') {
        const lore = ref.reference,
          kind =
            lore.kind === 'universe' ? 'globalLore' : lore.kind === 'book' ? 'localLore' : null;
        if (!kind) throw new TypeError('Origem de lore não suportada neste livro.');
        destination = reference({ kind, id: lore.entityId, scopeId: lore.scopeId });
      } else throw new TypeError('Vínculo narrativo não suportado.');
      // Native references assert association, not chronology, causality or reading.
      out.add(origin, destination, 'narrative');
      out.add(destination, origin, 'narrative');
      return out.result();
    },
    nativeLore({ id, sceneId, reference: ref }) {
      const out = build({ collection: 'sceneLoreLinks', id });
      const kind =
        ref.kind === 'universe' ? 'globalLore' : ref.kind === 'book' ? 'localLore' : null;
      if (!kind) throw new TypeError('Origem de lore não suportada neste livro.');
      out.add(
        reference({ kind, id: ref.entityId, scopeId: ref.scopeId }),
        node('scene', sceneId),
        'narrative',
      );
      return out.result();
    },
  };
  return methods;
}
