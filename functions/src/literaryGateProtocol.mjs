export const LITERARY_GATE_CRITERIA = Object.freeze({
  function: 'Função singular e transformação',
  causality: 'Objetivos, obstáculos e encadeamento causal',
  chronology: 'Cronologia e deslocamentos',
  ages: 'Idades e estados dos personagens',
  encounters: 'Encontros e presenças',
  knowledge: 'Conhecimento e origem das informações',
  pointOfView: 'POV e limite de percepção',
  voice: 'Voz e guia editorial',
  institutions: 'Autoridade, procedimentos e limites materiais',
  revelations: 'Revelações permitidas e reservas',
  planting: 'Plantios e retornos',
  ending: 'Fechamento e passagem',
  scenes: 'Cenas capazes de realizar a ficha',
  worldbuilding: 'Condições locais para viver as cenas',
});
export const LITERARY_GATE_OPTIONAL_CRITERIA = Object.freeze([
  'ages',
  'encounters',
  'institutions',
  'planting',
]);
const closed = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new TypeError('Verificação inválida.');
};
const text = (value, limit, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw new TypeError('Preencha os campos dentro do limite.');
  return value.replace(/\r\n/g, '\n');
};
export function normalizeLiteraryGate(value) {
  closed(value, ['criteria', 'authorAccepted', 'notes']);
  if (
    typeof value.authorAccepted !== 'boolean' ||
    !Array.isArray(value.criteria) ||
    value.criteria.length !== Object.keys(LITERARY_GATE_CRITERIA).length
  )
    throw new TypeError('Confira todos os critérios da preparação.');
  const seen = new Set();
  const criteria = value.criteria
    .map((item) => {
      closed(item, ['id', 'result', 'rationale', 'evidence']);
      if (
        !Object.hasOwn(LITERARY_GATE_CRITERIA, item.id) ||
        seen.has(item.id) ||
        !['pass', 'fail', 'gap', 'notApplicable'].includes(item.result)
      )
        throw new TypeError('Critério ou resultado inválido.');
      if (item.result === 'notApplicable' && !LITERARY_GATE_OPTIONAL_CRITERIA.includes(item.id))
        throw new TypeError('Este critério estrutural precisa ser conferido.');
      seen.add(item.id);
      if (!Array.isArray(item.evidence) || item.evidence.length > 3)
        throw new TypeError('Use até três evidências por critério.');
      const evidence = item.evidence.map((source) => {
        closed(source, ['documentId', 'quote']);
        return {
          documentId: text(source.documentId, 1800, true),
          quote: text(source.quote, 1500, true),
        };
      });
      const rationale = text(item.rationale, 2000, item.result !== 'gap');
      if (item.result === 'pass' && !evidence.length)
        throw new TypeError('Um critério atendido precisa de evidência localizada.');
      if (item.result === 'notApplicable' && !rationale.trim())
        throw new TypeError('Explique por que o critério não se aplica.');
      return { id: item.id, result: item.result, rationale, evidence };
    })
    .sort(
      (a, b) =>
        Object.keys(LITERARY_GATE_CRITERIA).indexOf(a.id) -
        Object.keys(LITERARY_GATE_CRITERIA).indexOf(b.id),
    );
  const result = { criteria, authorAccepted: value.authorAccepted, notes: text(value.notes, 6000) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 140000)
    throw new TypeError('Verificação acima do limite.');
  if (result.authorAccepted && !literaryGateReady(result))
    throw new TypeError('Resolva as pendências antes do aceite autoral.');
  return result;
}
export function literaryGateReady(value) {
  return (
    value.criteria.length === Object.keys(LITERARY_GATE_CRITERIA).length &&
    new Set(value.criteria.map((item) => item.id)).size ===
      Object.keys(LITERARY_GATE_CRITERIA).length &&
    value.criteria.every((item) => Object.hasOwn(LITERARY_GATE_CRITERIA, item.id)) &&
    value.criteria.every((item) => item.result === 'pass' || item.result === 'notApplicable')
  );
}
export function verifyLiteraryGateEvidence(gate, documents) {
  const available = new Map(documents.map((document) => [document.id, document.text]));
  for (const criterion of gate.criteria)
    for (const evidence of criterion.evidence) {
      const source = available.get(evidence.documentId);
      if (typeof source !== 'string' || !source.includes(evidence.quote))
        throw new TypeError('Uma evidência não corresponde literalmente à fonte selecionada.');
    }
}
