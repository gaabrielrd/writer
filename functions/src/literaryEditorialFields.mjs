// Pure field registry shared by native editing and editorial portability.
export const EDITORIAL_FIELDS = Object.freeze({
  premise: 'Premissa',
  genre: 'Gênero',
  audience: 'Público',
  language: 'Idioma',
  promise: 'Promessa de leitura',
  centralQuestion: 'Pergunta central',
  transformation: 'Transformação pretendida',
  ending: 'Horizonte de conclusão',
  narrator: 'Narrador e POV',
  tense: 'Tempo verbal',
  distance: 'Distância narrativa',
  cadence: 'Cadência',
  dialogue: 'Diálogo',
  exposition: 'Exposição e mistério',
  examples: 'Exemplos de voz',
  limits: 'Limites de conteúdo',
  invariants: 'Fatos e escolhas invariantes',
  reservations: 'Revelações reservadas',
  collaboration: 'Observações sobre colaboração',
});
export const EDITORIAL_STATUSES = Object.freeze(['proposal', 'working', 'approved', 'gap']);
export const EDITORIAL_CATEGORIES = Object.freeze(['requirement', 'preference', 'hypothesis']);
export const MAX_EDITORIAL_BYTES = 180000;
