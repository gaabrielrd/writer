export const LITERARY_INTEGRATION_AXES = Object.freeze([
  'time',
  'knowledge',
  'relationship',
  'planting',
  'causality',
  'promise',
  'voice',
  'reservation',
]);
const closed = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new TypeError('Resultado de integração inválido.');
};
const text = (value, max, required = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    !value.isWellFormed() ||
    (required && !value.trim())
  )
    throw new TypeError('Texto de integração inválido.');
  return value.replace(/\r\n/g, '\n');
};
const integer = (value, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min)
    throw new TypeError('Cobertura de integração inválida.');
  return value;
};
function evidenceList(raw, documents) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3)
    throw new TypeError('A integração exige evidências localizadas.');
  return raw.map((item) => {
    closed(item, ['sourceId', 'quote']);
    const source = documents.find((document) => document.id === item.sourceId),
      quote = text(item.quote, 1200, true);
    const offset = source?.text.indexOf(quote) ?? -1;
    if (offset < 0) throw new TypeError('A evidência não está na fonte fornecida.');
    return {
      sourceId: source.id,
      quote,
      offset: integer(integer(source.offsetBase ?? 0) + offset),
    };
  });
}
export function normalizeLiteraryIntegrationReading(raw, { documents, scope = 'unit-segment' }) {
  closed(raw, ['complete', 'report', 'findings', 'matrix']);
  if (
    !Array.isArray(documents) ||
    new Set(documents.map((item) => item.id)).size !== documents.length ||
    documents.some(
      (item) => typeof item.id !== 'string' || !item.id || typeof item.text !== 'string',
    )
  )
    throw new TypeError('As fontes da integração precisam de identidades distintas.');
  if (raw.complete !== true) throw new TypeError('A análise de integração não foi concluída.');
  if (!['unit-segment', 'chapter-boundary', 'architecture-segment'].includes(scope))
    throw new TypeError('Escopo de leitura inválido.');
  if (
    !Array.isArray(raw.findings) ||
    raw.findings.length > 40 ||
    !Array.isArray(raw.matrix) ||
    raw.matrix.length > 40
  )
    throw new TypeError('A análise de integração excedeu o orçamento de evidências.');
  const findings = raw.findings.map((finding) => {
    closed(finding, ['severity', 'problem', 'action', 'evidence']);
    if (!['blocking', 'warning', 'suggestion'].includes(finding.severity))
      throw new TypeError('Gravidade inválida.');
    return {
      severity: finding.severity,
      problem: text(finding.problem, 2000, true),
      action: text(finding.action, 2000, true),
      evidence: evidenceList(finding.evidence, documents),
      status: 'open',
    };
  });
  const matrix = raw.matrix.map((row) => {
    closed(row, ['axis', 'subject', 'observation', 'certainty', 'evidence']);
    if (
      !LITERARY_INTEGRATION_AXES.includes(row.axis) ||
      !['established', 'interpretation', 'uncertain'].includes(row.certainty) ||
      (scope === 'architecture-segment' && row.certainty === 'established')
    )
      throw new TypeError('Linha de continuidade inválida.');
    return {
      axis: row.axis,
      subject: text(row.subject, 300, true),
      observation: text(row.observation, 3000, true),
      certainty: row.certainty,
      evidence: evidenceList(row.evidence, documents),
      status: 'proposal',
    };
  });
  return {
    complete: true,
    report: text(raw.report, 6000),
    findings,
    matrix,
    coverage: { scope, wholeChapter: false, wholeAct: false, wholeBook: false },
  };
}
export function normalizeLiteraryIntegrationSynthesis(raw, { evidenceIds }) {
  closed(raw, ['complete', 'report', 'findings', 'conclusions']);
  if (
    raw.complete !== true ||
    !Array.isArray(raw.findings) ||
    raw.findings.length > 40 ||
    !Array.isArray(raw.conclusions) ||
    raw.conclusions.length > 40
  )
    throw new TypeError('A síntese de integração não foi concluída.');
  const allowed = new Set(evidenceIds);
  const refs = (value) => {
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > 12 ||
      new Set(value).size !== value.length ||
      value.some((id) => typeof id !== 'string' || !allowed.has(id))
    )
      throw new TypeError('A síntese precisa referenciar evidências fornecidas.');
    return [...value];
  };
  const findings = raw.findings.map((finding) => {
    closed(finding, ['severity', 'problem', 'action', 'evidenceIds']);
    if (!['blocking', 'warning', 'suggestion'].includes(finding.severity))
      throw new TypeError('Gravidade inválida.');
    return {
      severity: finding.severity,
      problem: text(finding.problem, 2000, true),
      action: text(finding.action, 2000, true),
      evidenceIds: refs(finding.evidenceIds),
      status: 'open',
    };
  });
  const conclusions = raw.conclusions.map((item) => {
    closed(item, ['axis', 'observation', 'evidenceIds']);
    if (!LITERARY_INTEGRATION_AXES.includes(item.axis))
      throw new TypeError('Eixo de integração inválido.');
    return {
      axis: item.axis,
      observation: text(item.observation, 3000, true),
      evidenceIds: refs(item.evidenceIds),
      status: 'proposal',
    };
  });
  return {
    complete: true,
    report: text(raw.report, 6000),
    findings,
    conclusions,
    coverage: {
      scope: 'evidence-synthesis',
      wholeChapter: false,
      wholeAct: false,
      wholeBook: false,
    },
  };
}
export function advanceLiteraryIntegrationCoverage(previous, coverage) {
  closed(coverage, [
    'sourceToken',
    'sourceCharacters',
    'segment',
    'segmentCount',
    'coreStart',
    'coreEnd',
  ]);
  const total = integer(coverage.sourceCharacters, 1),
    count = integer(coverage.segmentCount, 1),
    index = integer(coverage.segment),
    start = integer(coverage.coreStart),
    end = integer(coverage.coreEnd, 1);
  if (
    typeof coverage.sourceToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(coverage.sourceToken) ||
    index >= count ||
    end <= start ||
    end > total ||
    (index === count - 1 && end !== total) ||
    (index < count - 1 && end === total)
  )
    throw new TypeError('A cobertura da integração tem lacunas ou um encerramento incorreto.');
  if (previous) {
    if (
      previous.complete ||
      previous.sourceToken !== coverage.sourceToken ||
      previous.sourceCharacters !== total ||
      previous.segmentCount !== count ||
      previous.nextSegment !== index ||
      previous.covered !== start
    )
      throw new TypeError('A cobertura não continua o checkpoint da mesma fonte.');
  } else if (index !== 0 || start !== 0)
    throw new TypeError('A leitura precisa começar no início da fonte.');
  return {
    sourceToken: coverage.sourceToken,
    sourceCharacters: total,
    segmentCount: count,
    nextSegment: index + 1,
    covered: end,
    complete: index + 1 === count,
  };
}
