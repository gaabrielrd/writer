import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { inspectLiteraryImpactCurrent } from './literaryImpactRead.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReference,
} from './bookEditorialProtocol.mjs';
import {
  normalizeLiteraryImpactNode,
  normalizeLiteraryImpactLink,
  normalizeLiteraryImpactVisit,
  literaryImpactNodeKey,
  literaryImpactLinkKey,
  literaryImpactVisitKey,
} from './literaryImpactProtocol.mjs';
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const stable = (value) => digest(canonical(value ?? null));
const fail = () =>
  workFail(
    'failed-precondition',
    'O histórico do mapa de impacto está inconsistente. Preserve a origem.',
  );
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const text = (value, max = 1000) => {
  if (typeof value !== 'string' || value.length > max || !value.isWellFormed()) fail();
  return value;
};
const born = (value) => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isSafeInteger(value[0]) ||
    value[0] < 0 ||
    !Number.isInteger(value[1]) ||
    value[1] < 0 ||
    value[1] >= 1e9
  )
    fail();
  return value;
};
const initial = ['version', 'uid', 'jobId', 'bookBirth', 'controlBirth', 'phase'];
const controlFields = [
  ...initial,
  'intent',
  'bookIds',
  'registryToken',
  'scopeToken',
  'sourceFence',
  'graphBirth',
  'steps',
  'census',
  'graph',
  'coverage',
  'createdAt',
];
const definitions = {
  control: { collection: 'literaryImpactControls', fields: controlFields },
  graph: {
    collection: 'literaryImpactJobs',
    fields: [
      'schemaVersion',
      'jobId',
      'uid',
      'state',
      'nodes',
      'links',
      'visits',
      'completedVisits',
      'witnesses',
      'coverage',
    ],
  },
  node: { collection: 'literaryImpactNodes', fields: ['jobId', 'nodeKey', 'node'] },
  link: { collection: 'literaryImpactLinks', fields: ['jobId', 'linkKey', 'link'] },
  visit: {
    collection: 'literaryImpactVisits',
    fields: ['jobId', 'visitKey', 'nodeKey', 'visit', 'state'],
  },
  witness: {
    collection: 'literaryImpactWitnesses',
    fields: ['jobId', 'fromVisitKey', 'visitKey', 'sourceKey', 'linkKey'],
  },
  check: {
    collection: 'literaryImpactChecks',
    fields: ['jobId', 'controlBirth', 'from', 'to', 'relation', 'linkId', 'facts'],
  },
};
const facts = [
  'status',
  'sourceAvailable',
  'identityMatches',
  'versionMatches',
  'capturedGrantMatches',
  'sourceIdentityVerified',
  'dependencyRecordVerified',
  'identityEvidence',
  'sourceRepresentation',
  'reason',
  'manuscriptRead',
  'wholeUnitRead',
  'editorialReview',
  'byteIntegrityChecked',
];
const reference = (bookId, id, state = 'recorded', purpose = 'source') => ({
  kind: 'artifact',
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose,
});
/** Pure descriptors only. A historical locator is never a source grant. */
function sourceReference(bookId, raw, opaque) {
  const value = normalizeLiteraryImpactNode(raw);
  let kind = value.kind,
    id = value.id,
    parentId = null;
  if (kind === 'arcMilestone') {
    [parentId, id] = JSON.parse(id);
  }
  if (kind === 'localLore' || kind === 'globalLore') kind = 'lore';
  if (
    ![
      'book',
      'act',
      'chapter',
      'scene',
      'arc',
      'arcMilestone',
      'event',
      'lore',
      'persona',
    ].includes(kind)
  )
    return reference(bookId, opaque, 'unavailable');
  return normalizeBookEditorialReference({
    kind,
    id,
    parentId,
    scope: {
      kind:
        value.scopeKind === 'universe'
          ? 'universe'
          : value.scopeKind === 'user'
            ? 'library'
            : 'book',
      id: value.scopeId,
    },
    revision: null,
    contentHash: null,
    state: 'unavailable',
    purpose: 'source',
  });
}
/** Internal, bounded projections. Never calls a mutating graph/controller reader or resolves labels. */
export async function readBookEditorialImpactCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  const def = definitions[family];
  if (!def) fail();
  const item = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + def.collection + '/' + id),
    family === 'control' ? initial : ['jobId'],
  );
  if (!item.exists || tokenForRow(item) !== itemToken) bookBackupChanged(true);
  const jobId = family === 'control' ? id : workId(item.data().jobId),
    root = await readWorkMetadata(tx, c.ref, []);
  const parent =
    family === 'control'
      ? item
      : await readWorkMetadata(tx, c.db.doc(c.path + '/literaryImpactControls/' + jobId), initial);
  let control = parent.data(),
    graphBirth = control?.graphBirth ?? null;
  const pins = [];
  let reason =
    !parent.exists || control.uid !== c.uid || control.jobId !== jobId
      ? 'source-unavailable'
      : control.version !== 1
        ? 'unsupported-legacy-schema'
        : stable(born(control.bookBirth)) !== stable(literaryNativeBirth(root))
          ? 'source-unavailable'
          : null;
  if (
    !reason &&
    (control.controlBirth != null
      ? stable(born(control.controlBirth)) !== stable(literaryNativeBirth(parent))
      : !['registering', 'canceled'].includes(control.phase))
  )
    reason = 'source-unavailable';
  const artifactId = (sourceFamily = family, sourceId = id) =>
    digest({
      domain: 'writer-editorial-impact-capture-v1',
      bookId: c.target.id,
      bookBirth,
      controlBirth: parent.exists ? bookBackupIdentity(parent).created : null,
      graphBirth: ['control', 'control-input'].includes(sourceFamily) ? null : graphBirth,
      jobId,
      family: sourceFamily,
      id: sourceId,
    });
  const make = (kind, content, sourceFamily = family, sourceId = id, extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: artifactId(sourceFamily, sourceId),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'included' },
      content,
      ...extra,
    });
  const missing = (why) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: artifactId(),
      kind:
        family === 'control' || family === 'graph'
          ? 'checkpoint'
          : family === 'check'
            ? 'report'
            : 'document',
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'unavailable', reason: why },
      content: null,
    });
  let artifacts;
  if (reason) artifacts = [missing(reason)];
  else {
    const details = await readWorkMetadata(tx, parent.ref, controlFields);
    if (stable(bookBackupIdentity(details)) !== stable(bookBackupIdentity(parent)))
      bookBackupChanged(true);
    control = details.data();
    graphBirth = control.graphBirth ?? null;
    pins.push({ control: bookBackupIdentity(parent) });
    const controlPointer = reference(c.target.id, artifactId('control', jobId));
    const key = (value, sourceFamily) => ({ id: digest({ jobId, value }), family: sourceFamily });
    const graphRef = async (sourceFamily, rawKey, purpose = 'source') => {
      const target = key(rawKey, sourceFamily),
        def = definitions[sourceFamily];
      const fields =
        sourceFamily === 'node'
          ? ['jobId', 'nodeKey']
          : sourceFamily === 'link'
            ? ['jobId', 'linkKey']
            : ['jobId', 'visitKey'];
      const row = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/' + def.collection + '/' + target.id),
        fields,
      );
      const value = row.data(),
        recorded = row.exists && value.jobId === jobId && value[fields[1]] === rawKey;
      pins.push({ reference: bookBackupIdentity(row), recorded });
      return reference(
        c.target.id,
        artifactId(sourceFamily, target.id),
        recorded ? 'recorded' : 'unavailable',
        purpose,
      );
    };
    if (family === 'control') {
      const refs = [],
        sections = [
          {
            label: 'Escopo do registro',
            text: 'Inventário e propagação de dependências registradas; não certifica completude semântica, leitura integral, qualidade, aceite ou publicação.',
          },
        ];
      const sources = control.intent?.sources;
      if (sources !== undefined) {
        if (!Array.isArray(sources) || sources.length > 16) fail();
        for (const source of sources)
          refs.push(
            sourceReference(
              c.target.id,
              source,
              digest({
                domain: 'writer-editorial-impact-intent-source-v1',
                bookId: c.target.id,
                bookBirth,
                source,
              }),
            ),
          );
      }
      if (typeof control.intent?.prepareIndices === 'boolean')
        sections.push({
          label: 'Preparação de índices solicitada',
          text: control.intent.prepareIndices ? 'sim' : 'não',
        });
      if (control.census != null) {
        if (!Array.isArray(control.census) || control.census.length > 512) fail();
        for (const field of ['records', 'unavailable', 'unsupported', 'unknown'])
          sections.push({
            label: 'Contagem histórica: ' + field,
            text: String(control.census.reduce((n, row) => count(n + count(row[field])), 0)),
          });
        sections.push({ label: 'Inventários registrados', text: String(control.census.length) });
      }
      artifacts = [
        make(
          'checkpoint',
          {
            process: 'impact',
            phase: text(control.phase, 160),
            counters: { steps: count(control.steps) },
            currentUnit: null,
            references: refs,
            haltReason: null,
            nextAction: null,
            controlsDisabled: true,
          },
          'control',
          jobId,
          { createdAt: control.createdAt ?? null },
        ),
        make(
          'document',
          {
            role: 'progress',
            title: 'Solicitação e cobertura histórica do mapa de impacto',
            sections,
            references: refs,
          },
          'control-input',
          jobId,
          { provenance: 'author' },
        ),
      ];
    } else {
      let current = false;
      try {
        current = await inspectLiteraryImpactCurrent(tx, c, control, { row: parent });
      } catch (error) {
        if (
          !['permission-denied', 'not-found', 'failed-precondition', 'resource-exhausted'].includes(
            error.code,
          )
        )
          throw error;
      }
      pins.push({ current });
      const graph = await readWorkMetadata(tx, c.db.doc(c.path + '/literaryImpactJobs/' + jobId), [
        'schemaVersion',
        'jobId',
        'uid',
      ]);
      if (
        !current ||
        !graph.exists ||
        graph.data().uid !== c.uid ||
        graph.data().jobId !== jobId ||
        graph.data().schemaVersion !== 1
      )
        artifacts = [missing('source-unavailable')];
      else {
        if (graphBirth != null && stable(born(graphBirth)) !== stable(literaryNativeBirth(graph)))
          artifacts = [missing('source-unavailable')];
        else {
          // A legacy original graph is accepted only through the exact native current gate above.
          graphBirth = graphBirth ?? literaryNativeBirth(graph);
          pins.push({ graph: bookBackupIdentity(graph) });
          const loaded = await readWorkMetadata(tx, item.ref, def.fields),
            value = loaded.data();
          if (stable(bookBackupIdentity(loaded)) !== stable(bookBackupIdentity(item)))
            bookBackupChanged(true);
          if (value.jobId !== jobId) fail();
          if (
            family === 'check' &&
            stable(value.controlBirth) !== stable(literaryNativeBirth(parent))
          )
            artifacts = [missing('source-unavailable')];
          else if (family === 'graph') {
            if (value.uid !== c.uid || value.schemaVersion !== 1) fail();
            const sections = [];
            for (const field of ['nodes', 'links', 'visits', 'completedVisits', 'witnesses'])
              sections.push({ label: field, text: String(count(value[field])) });
            sections.push({
              label: 'Limite do resultado',
              text: 'Contagens históricas de grafo; não equivalem a leitura de corpos ou completude semântica.',
            });
            artifacts = [
              make('checkpoint', {
                process: 'impact',
                phase: text(value.state, 160),
                counters: {
                  plannedUnits: count(value.visits),
                  completedUnits: count(value.completedVisits),
                },
                currentUnit: null,
                references: [controlPointer],
                haltReason: null,
                nextAction: null,
                controlsDisabled: true,
              }),
              make(
                'document',
                {
                  role: 'progress',
                  title: 'Contagens históricas do grafo de impacto',
                  sections,
                  references: [controlPointer],
                },
                'graph-counts',
                id,
              ),
            ];
          } else if (family === 'check') {
            const observations = [];
            if (
              !value.facts ||
              typeof value.facts !== 'object' ||
              !['source', 'composition', 'subject', 'narrative', 'target', 'preserves'].includes(
                value.relation,
              )
            )
              fail();
            for (const field of facts)
              if (value.facts[field] !== undefined)
                observations.push({
                  axis: field,
                  text:
                    value.facts[field] === null
                      ? 'não registrado'
                      : typeof value.facts[field] === 'boolean'
                        ? value.facts[field]
                          ? 'sim'
                          : 'não'
                        : typeof value.facts[field] === 'string'
                          ? text(value.facts[field])
                          : 'Metadata nativa complexa; não constitui conteúdo portátil ou grant.',
                  evidenceIds: [],
                });
            const refs = [
              controlPointer,
              await graphRef('node', literaryImpactNodeKey(value.from)),
              await graphRef('node', literaryImpactNodeKey(value.to), 'subject'),
            ];
            if (value.linkId !== undefined) {
              if (!/^[a-f0-9]{64}$/.test(value.linkId)) fail();
              observations.push({
                axis: 'Chave lógica do vínculo',
                text: value.linkId,
                evidenceIds: [],
              });
            }
            observations.push({
              axis: 'Relação registrada',
              text: value.relation,
              evidenceIds: [],
            });
            artifacts = [
              make('report', {
                role: 'impact',
                title: 'Verificação técnica histórica de dependência',
                summary:
                  'Fatos técnicos registrados pelo verificador nativo; decisões próprias são preservadas em sua família separada.',
                findings: [],
                observations,
                references: refs,
                claimedCoverage: {
                  scope: 'registered-dependencies',
                  completed: 1,
                  total: 1,
                  limitations: [
                    'Uma verificação não comprova leitura integral, revisão editorial, completude semântica, aceite ou publicação.',
                  ],
                },
              }),
            ];
          } else {
            const refs = [controlPointer],
              sections = [];
            if (family === 'node') {
              const node = normalizeLiteraryImpactNode(value.node),
                nativeKey = literaryImpactNodeKey(node);
              if (value.nodeKey !== nativeKey || id !== key(nativeKey, 'node').id) fail();
              sections.push(
                { label: 'Tipo de unidade', text: node.kind },
                { label: 'Âmbito de origem', text: node.scopeKind },
              );
              refs.push(
                sourceReference(
                  c.target.id,
                  node,
                  digest({
                    domain: 'writer-editorial-impact-source-v1',
                    bookId: c.target.id,
                    bookBirth,
                    node,
                  }),
                ),
              );
            } else if (family === 'link') {
              const link = normalizeLiteraryImpactLink(value.link),
                nativeKey = literaryImpactLinkKey(link);
              if (value.linkKey !== nativeKey || id !== key(nativeKey, 'link').id) fail();
              sections.push(
                { label: 'Relação registrada', text: link.relation },
                { label: 'Chave lógica do vínculo', text: digest(nativeKey) },
              );
              refs.push(
                await graphRef('node', literaryImpactNodeKey(link.from)),
                await graphRef('node', literaryImpactNodeKey(link.to), 'subject'),
              );
            } else if (family === 'visit') {
              const visit = normalizeLiteraryImpactVisit(value.visit),
                nativeKey = literaryImpactVisitKey(visit);
              if (
                value.visitKey !== nativeKey ||
                value.nodeKey !== literaryImpactNodeKey(visit.node) ||
                id !== key(nativeKey, 'visit').id
              )
                fail();
              sections.push(
                { label: 'Efeito registrado', text: visit.effect },
                { label: 'Profundidade registrada', text: String(count(visit.depth)) },
                { label: 'Estado histórico', text: text(value.state, 160) },
              );
              refs.push(
                await graphRef('node', literaryImpactNodeKey(visit.source)),
                await graphRef('node', literaryImpactNodeKey(visit.node), 'subject'),
              );
            } else {
              for (const field of ['fromVisitKey', 'visitKey', 'linkKey'])
                text(value[field], 1024 * 1024);
              let sourceKey, nextSourceKey;
              try {
                sourceKey = JSON.parse(value.fromVisitKey)[0];
                nextSourceKey = JSON.parse(value.visitKey)[0];
              } catch {
                fail();
              }
              if (
                typeof sourceKey !== 'string' ||
                sourceKey !== nextSourceKey ||
                value.sourceKey !== digest(sourceKey)
              )
                fail();
              const nativeKey = digest({
                fromVisitKey: value.fromVisitKey,
                linkKey: value.linkKey,
              });
              if (id !== key(nativeKey, 'witness').id) fail();
              sections.push({
                label: 'Limite do testemunho',
                text: 'Caminho técnico de propagação; não é citação do manuscrito ou prova de correção literária.',
              });
              refs.push(
                await graphRef('node', sourceKey),
                await graphRef('visit', value.fromVisitKey),
                await graphRef('link', value.linkKey),
                await graphRef('visit', value.visitKey, 'subject'),
              );
            }
            artifacts = [
              make('document', {
                role: 'architecture',
                title: 'Registro histórico do mapa de impacto: ' + family,
                sections,
                references: refs,
              }),
            ];
          }
        }
      }
    }
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (artifacts.length > 2 || bytes.length > 1024 * 1024) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state: 'artifact',
    head: null,
    pins,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}
