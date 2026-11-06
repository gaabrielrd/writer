import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import {
  workProject,
  workId,
  workFail,
  workRevision,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import {
  normalizeLiteraryImpactNode,
  normalizeLiteraryImpactLink,
  literaryImpactNodeKey,
  literaryImpactLinkKey,
  literaryImpactVisitKey,
  advanceLiteraryImpactVisit,
  literaryImpactCoverage,
} from './literaryImpactProtocol.mjs';

const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Versão do mapa inválida.');
  return value;
};
const summary = (job) => ({
  jobId: job.jobId,
  state: job.state,
  nodes: job.nodes,
  links: job.links,
  visits: job.visits,
  completedVisits: job.completedVisits,
  witnesses: job.witnesses,
  propagationComplete: job.state === 'traversed' || job.state === 'done',
  inventoryComplete: job.coverage?.complete === true,
  semanticCompleteness: false,
  publicationReady: false,
});
// Internal transaction engine. No callable accepts links, inventories or fence tokens.
// readFence MUST read the complete authorized source/topology fence in the same
// transaction. A manuscript-only fence is insufficient; orchestration supplies it.
export function createLiteraryImpactGraphStore({ db, readFence }) {
  if (typeof readFence !== 'function')
    throw new TypeError('A leitura autorizada da versão do inventário é obrigatória.');
  const ref = (c, kind, id) => db.doc(c.path + '/literaryImpact' + kind + '/' + id);
  const key = (jobId, value) => digest({ jobId, value });
  const scoped = (job, node) => {
    const normalized = normalizeLiteraryImpactNode(node);
    if (
      (normalized.scopeKind === 'book' && !job.bookIds.includes(normalized.scopeId)) ||
      (normalized.scopeKind === 'universe' &&
        !(job.universeIds ?? (job.universeId ? [job.universeId] : [])).includes(
          normalized.scopeId,
        )) ||
      (normalized.scopeKind === 'user' && normalized.scopeId !== job.uid)
    )
      workFail('permission-denied', 'A dependência está fora do escopo autorizado do mapa.');
    return normalized;
  };
  async function load(tx, c, jobId) {
    await workProject(tx, c);
    const jobRef = ref(c, 'Jobs', workId(jobId)),
      job = (await tx.get(jobRef)).data();
    if (!job || job.uid !== c.uid) workFail('not-found', 'Mapa de impacto indisponível.');
    if (['stale', 'canceled'].includes(job.state)) return { jobRef, job, current: false };
    // Books in a cross-volume map remain independently authorized on every step.
    for (const bookId of job.bookIds)
      if (bookId !== c.target.id) {
        const row = await readWorkMetadata(tx, db.doc('books/' + bookId), ['authorId', 'deleting']);
        if (!row.exists || row.data().authorId !== c.uid || row.data().deleting)
          workFail('permission-denied', 'Um livro do mapa não está mais disponível.');
      }
    for (const universeId of job.universeIds ?? (job.universeId ? [job.universeId] : [])) {
      const world = await readWorkMetadata(tx, db.doc('universes/' + universeId), [
        'authorId',
        'deleting',
      ]);
      if (!world.exists || world.data().authorId !== c.uid || world.data().deleting)
        workFail('permission-denied', 'O universo do mapa não está mais disponível.');
    }
    const current = hash(await readFence(tx, c, job)) === job.sourceFence;
    if (!current)
      writeLiteraryBackupProcess(tx, c, 'impact', 'update', jobRef, {
        state: 'stale',
        coverage: null,
      });
    return { jobRef, job: current ? job : { ...job, state: 'stale', coverage: null }, current };
  }
  return {
    async initialize(
      tx,
      c,
      { jobId, bookIds, universeId = null, sourceFence, inventories, sources },
    ) {
      const root = await workProject(tx, c);
      if (
        c.target.kind !== 'book' ||
        !Array.isArray(bookIds) ||
        !bookIds.length ||
        bookIds.length > 64 ||
        new Set(bookIds).size !== bookIds.length ||
        !bookIds.includes(c.target.id) ||
        !Array.isArray(sources) ||
        !sources.length ||
        sources.length > 16
      )
        workFail('invalid-argument', 'Escopo do mapa de impacto inválido.');
      bookIds.forEach(workId);
      if (universeId !== null) workId(universeId);
      if (universeId !== null && root.universeId !== universeId)
        workFail('permission-denied', 'O universo não pertence ao escopo atual.');
      const jobRef = ref(c, 'Jobs', workId(jobId)),
        old = (await tx.get(jobRef)).data();
      const job = {
        schemaVersion: 1,
        jobId,
        uid: c.uid,
        bookIds: [...bookIds].sort(),
        universeId,
        universeIds: [],
        sourceFence: hash(sourceFence),
        inventories,
        state: 'collecting',
        nodes: 0,
        links: 0,
        visits: 0,
        completedVisits: 0,
        witnesses: 0,
        activeVisitId: null,
        coverage: null,
      };
      const worlds = new Set(root.universeId ? [workId(root.universeId)] : []);
      for (const bookId of job.bookIds)
        if (bookId !== c.target.id) {
          const row = await readWorkMetadata(tx, db.doc('books/' + bookId), [
            'authorId',
            'deleting',
            'universeId',
          ]);
          if (!row.exists || row.data().authorId !== c.uid || row.data().deleting)
            workFail('permission-denied', 'Livro indisponível.');
          if (row.data().universeId) worlds.add(workId(row.data().universeId));
        }
      job.universeIds = [...worlds].sort();
      // Validate the expected census before persisting it. Empty observed census
      // is intentionally incomplete; the caller must supply every inventory later.
      literaryImpactCoverage(inventories, [], { before: job.sourceFence, after: job.sourceFence });
      for (const inventory of inventories) {
        if (
          (inventory.scopeKind === 'book' && !job.bookIds.includes(inventory.scopeId)) ||
          (inventory.scopeKind === 'universe' && !job.universeIds.includes(inventory.scopeId)) ||
          (inventory.scopeKind === 'user' && inventory.scopeId !== c.uid)
        )
          workFail('permission-denied', 'Inventário de outro escopo.');
      }
      const seeds = new Map();
      for (const raw of sources) {
        const node = scoped(job, raw),
          visit = { node, source: node, effect: 'changed', depth: 0 };
        seeds.set(literaryImpactVisitKey(visit), visit);
      }
      const fingerprint = digest({
        bookIds: job.bookIds,
        universeId,
        sourceFence: job.sourceFence,
        inventories,
        sources: [...seeds.values()].map((visit) => visit.node),
      });
      if (old) {
        if (old.uid !== c.uid || old.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Mapa já usado por outro pedido.');
        const result = await load(tx, c, jobId);
        return summary(result.job);
      }
      for (const bookId of job.bookIds)
        if (bookId !== c.target.id) {
          const row = await readWorkMetadata(tx, db.doc('books/' + bookId), [
            'authorId',
            'deleting',
          ]);
          if (!row.exists || row.data().authorId !== c.uid || row.data().deleting)
            workFail('permission-denied', 'Livro indisponível.');
        }
      for (const worldId of job.universeIds) {
        const row = await readWorkMetadata(tx, db.doc('universes/' + worldId), [
          'authorId',
          'deleting',
        ]);
        if (!row.exists || row.data().authorId !== c.uid || row.data().deleting)
          workFail('permission-denied', 'Universo indisponível.');
      }
      if (hash(await readFence(tx, c, job)) !== job.sourceFence)
        workFail('failed-precondition', 'As fontes mudaram antes de iniciar o mapa.');
      if (Buffer.byteLength(JSON.stringify(job)) > 100000)
        workFail('resource-exhausted', 'O escopo do inventário precisa de paginação adicional.');
      job.visits = seeds.size;
      job.nodes = seeds.size;
      job.fingerprint = fingerprint;
      writeLiteraryBackupProcess(tx, c, 'impact', 'create', jobRef, job);
      for (const [visitKey, visit] of seeds) {
        const nodeKey = literaryImpactNodeKey(visit.node);
        tx.create(ref(c, 'Nodes', key(jobId, nodeKey)), { jobId, nodeKey, node: visit.node });
        tx.create(ref(c, 'Visits', key(jobId, visitKey)), {
          jobId,
          visitKey,
          nodeKey,
          visit,
          state: 'pending',
          cursor: null,
        });
      }
      if (root.hasLiteraryResources !== true) tx.update(c.ref, { hasLiteraryResources: true });
      return summary(job);
    },
    async append(tx, c, { jobId, links }) {
      const loaded = await load(tx, c, jobId),
        { jobRef, job } = loaded;
      if (!loaded.current) return summary(job);
      if (job.state !== 'collecting')
        workFail('failed-precondition', 'O inventário deste mapa já foi fechado.');
      if (!Array.isArray(links) || links.length > 32)
        workFail('invalid-argument', 'Envie até 32 vínculos por página.');
      const unique = new Map(),
        nodes = new Map();
      for (const raw of links) {
        const link = normalizeLiteraryImpactLink(raw);
        scoped(job, link.from);
        scoped(job, link.to);
        unique.set(literaryImpactLinkKey(link), link);
        for (const node of [link.from, link.to]) nodes.set(literaryImpactNodeKey(node), node);
      }
      const writes = [];
      let addedLinks = 0,
        addedNodes = 0;
      for (const [linkKey, link] of unique) {
        const target = ref(c, 'Links', key(jobId, linkKey)),
          existing = (await tx.get(target)).data();
        if (existing && existing.linkKey !== linkKey)
          workFail('failed-precondition', 'Colisão na identidade do vínculo.');
        if (!existing) {
          writes.push({
            ref: target,
            value: { jobId, linkKey, fromKey: digest(literaryImpactNodeKey(link.from)), link },
          });
          addedLinks++;
        }
      }
      for (const [nodeKey, node] of nodes) {
        const target = ref(c, 'Nodes', key(jobId, nodeKey)),
          existing = (await tx.get(target)).data();
        if (existing && existing.nodeKey !== nodeKey)
          workFail('failed-precondition', 'Colisão na identidade da unidade.');
        if (!existing) {
          writes.push({ ref: target, value: { jobId, nodeKey, node } });
          addedNodes++;
        }
      }
      const next = {
        ...job,
        nodes: workRevision(job.nodes + addedNodes),
        links: workRevision(job.links + addedLinks),
      };
      writes.forEach((write) => tx.create(write.ref, write.value));
      writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
      return summary(next);
    },
    async seal(tx, c, { jobId, census, allowIncomplete = false }) {
      const loaded = await load(tx, c, jobId),
        { jobRef, job } = loaded;
      if (!loaded.current || job.state !== 'collecting') return summary(job);
      const coverage = literaryImpactCoverage(job.inventories, census, {
        before: job.sourceFence,
        after: job.sourceFence,
      });
      if (
        !coverage.complete &&
        (!allowIncomplete || coverage.missing.length || coverage.pending.length)
      )
        workFail(
          'failed-precondition',
          'O inventário ainda tem páginas, fontes ou verificações pendentes.',
        );
      const next = { ...job, state: 'traversing', coverage };
      writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
      return summary(next);
    },
    async advance(tx, c, { jobId }) {
      const loaded = await load(tx, c, jobId),
        { jobRef, job } = loaded;
      if (!loaded.current || ['traversed', 'done'].includes(job.state)) return summary(job);
      if (job.state !== 'traversing')
        workFail('failed-precondition', 'Conclua o inventário antes de percorrer os impactos.');
      let current;
      if (job.activeVisitId) {
        const target = ref(c, 'Visits', job.activeVisitId),
          value = (await tx.get(target)).data();
        if (!value || value.jobId !== jobId || value.state !== 'walking')
          workFail('failed-precondition', 'O checkpoint da busca precisa ser recuperado.');
        current = { ref: target, value };
      } else {
        const pending = await tx.get(
          db
            .collection(c.path + '/literaryImpactVisits')
            .where('jobId', '==', jobId)
            .where('state', '==', 'pending')
            .orderBy('__name__')
            .limit(1),
        );
        const row = pending.docs[0];
        if (!row) {
          if (job.visits !== job.completedVisits)
            workFail('failed-precondition', 'Há visitas não conferidas no mapa.');
          const next = { ...job, state: 'traversed' };
          writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
          return summary(next);
        }
        current = { ref: row.ref, value: row.data() };
      }
      let query = db
        .collection(c.path + '/literaryImpactLinks')
        .where('jobId', '==', jobId)
        .where('fromKey', '==', digest(current.value.nodeKey))
        .orderBy('__name__')
        .limit(32);
      if (current.value.cursor) query = query.startAfter(workId(current.value.cursor));
      const page = await tx.get(query),
        steps = advanceLiteraryImpactVisit(
          current.value.visit,
          page.docs.map((row) => row.data().link),
        );
      const visits = new Map(),
        witnesses = new Map();
      for (const step of steps) {
        scoped(job, step.visit.node);
        visits.set(step.visitKey, step.visit);
        const witnessKey = digest({ fromVisitKey: current.value.visitKey, linkKey: step.linkKey });
        witnesses.set(witnessKey, {
          jobId,
          fromVisitKey: current.value.visitKey,
          visitKey: step.visitKey,
          sourceKey: digest(literaryImpactNodeKey(step.visit.source)),
          linkKey: step.linkKey,
        });
      }
      const writes = [];
      let addedVisits = 0,
        addedWitnesses = 0;
      for (const [visitKey, visit] of visits) {
        const target = ref(c, 'Visits', key(jobId, visitKey)),
          existing = (await tx.get(target)).data();
        if (existing && existing.visitKey !== visitKey)
          workFail('failed-precondition', 'Colisão na identidade do impacto.');
        if (!existing) {
          writes.push({
            ref: target,
            value: {
              jobId,
              visitKey,
              nodeKey: literaryImpactNodeKey(visit.node),
              visit,
              state: 'pending',
              cursor: null,
            },
          });
          addedVisits++;
        }
      }
      for (const [witnessKey, witness] of witnesses) {
        const target = ref(c, 'Witnesses', key(jobId, witnessKey));
        if (!(await tx.get(target)).exists) {
          writes.push({ ref: target, value: witness });
          addedWitnesses++;
        }
      }
      const complete = page.docs.length < 32;
      const next = {
        ...job,
        visits: workRevision(job.visits + addedVisits),
        witnesses: workRevision(job.witnesses + addedWitnesses),
        completedVisits: workRevision(job.completedVisits + Number(complete)),
        activeVisitId: complete ? null : current.ref.id,
      };
      writes.forEach((write) => tx.create(write.ref, write.value));
      tx.set(current.ref, {
        ...current.value,
        state: complete ? 'done' : 'walking',
        cursor: complete ? null : page.docs.at(-1).id,
      });
      writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
      return summary(next);
    },
    async finish(tx, c, { jobId, census, allowIncomplete = false }) {
      const loaded = await load(tx, c, jobId),
        { jobRef, job } = loaded;
      if (!loaded.current || job.state === 'done') return summary(job);
      if (job.state !== 'traversed' || job.visits !== job.completedVisits)
        workFail('failed-precondition', 'A busca de dependências ainda não terminou.');
      // A second full census is required after traversal. Work in progress or an
      // unchanged manuscript clock alone cannot certify dependency coverage.
      const coverage = literaryImpactCoverage(job.inventories, census, {
        before: job.sourceFence,
        after: job.sourceFence,
      });
      if (
        !coverage.complete &&
        (!allowIncomplete || coverage.missing.length || coverage.pending.length)
      )
        workFail('failed-precondition', 'Reconfera todos os inventários antes de concluir.');
      const next = { ...job, state: 'done', coverage };
      writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
      return summary(next);
    },
    async cancel(tx, c, { jobId }) {
      const loaded = await load(tx, c, jobId),
        { jobRef, job } = loaded;
      if (!loaded.current || job.state === 'done') return summary(job);
      const next = { ...job, state: 'canceled', coverage: null };
      writeLiteraryBackupProcess(tx, c, 'impact', 'set', jobRef, next);
      return summary(next);
    },
  };
}
