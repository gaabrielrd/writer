import { GenerationError } from './generationError.mjs';
const fail = (code, message) => {
  throw new GenerationError(code, message);
};
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('invalid-argument', 'Pedido inválido.');
  return value;
};
export function normalizePageCapabilities(value) {
  if (!Array.isArray(value) || value.length > 80) fail('invalid-argument', 'Ações inválidas.');
  const ids = new Set();
  const capabilities = value.map((item) => {
    const id = text(item.id, 100),
      label = text(item.label, 180);
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      ids.has(id) ||
      !['action', 'field', 'select'].includes(item.kind)
    )
      fail('invalid-argument', 'Ação inválida.');
    ids.add(id);
    return {
      id,
      label,
      kind: item.kind,
      ...(item.kind === 'select' && Array.isArray(item.options)
        ? { options: item.options.slice(0, 40).map((v) => text(v, 180)) }
        : {}),
    };
  });

  return capabilities;
}
export function pageProviderCapabilities(capabilities) {
  const staticLabels = new Set([
    'Revisar proposta inicial',
    'Salvar rascunho',
    'Criar livro',
    'Criar aventura',
    'Criar campanha',
    'Criar capítulo',
    'Premissa e detalhes',
    'Capa opcional',
    'Universo e persona',
    'Universo compartilhado',
    'Persona de escrita',
    'Criar ou editar persona',
    'Negrito',
    'Itálico',
    'Desfazer',
    'Refazer',
    'Novo projeto',
    'Novo capítulo',
    'Nova cena',
    'Nova nota',
    'Nova sessão',
    'Editar campanha',
    'Editar aventura',
    'Editar livro',
    'Título do projeto',
    'Título da nota',
    'Título da campanha',
    'Título da aventura',
    'Título da sessão',
    'Título do capítulo',
    'Nome da Entidade',
    'Premissa',
    'Conceito da campanha',
    'Descrição da campanha',
    'Sinopse da aventura',
    'Gênero ou estilo',
    'Texto da nota',
    'Texto',
    'Sua mensagem',
    'Mensagem',
    'Assistente IA',
    'Abrir Assistente Criativo de IA',
    'Enviar mensagem',
    'Enviar',
    'Salvar',
    'Salvar alterações',
    'Cancelar',
    'Fechar',
    'Compêndio',
    'Cenas',
    'Capítulos',
    'Notas',
    'Sessões',
    'Preparação',
    'Narrativa',
    'Histórico',
    'Publicar',
    'Excluir',
    'Restaurar',
    'Arquivar',
    'Criar universo',
    'Criar persona',
    'Nome do universo',
    'Descrição do universo',
    'Salvar universo',
    'Nome da persona',
    'Instruções',
    'Claro',
    'Escuro',
    'Sépia',
  ]);
  const providerCapabilities = capabilities.map((item, index) => ({
    ...item,
    label:
      [...staticLabels]
        .sort((a, b) => b.length - a.length)
        .find((label) => item.label === label || item.label.startsWith(label + ' ')) ??
      (staticLabels.has(item.label)
        ? item.label
        : `${item.kind === 'field' ? 'Campo' : (/^(Editar|Excluir|Restaurar|Criar|Adicionar|Salvar|Confirmar|Abrir|Remover|Selecionar|Gerar|Cancelar|Voltar|Continuar|Enviar)/.exec(item.label)?.[1] ?? 'Ação')} ${index + 1}`),
    ...(item.options ? { options: item.options.map((_, index) => `Opção ${index + 1}`) } : {}),
  }));

  return providerCapabilities;
}
export function normalizePageAction(value, capabilities) {
  const providerCapabilities = pageProviderCapabilities(capabilities);
  let action = null;
  if (value != null) {
    const capability = capabilities.find((item) => item.id === value.id);
    if (!capability) fail('failed-precondition', 'A IA sugeriu uma ação indisponível.');
    action = { id: capability.id };
    if (capability.kind !== 'action') {
      if (typeof value.value !== 'string' || value.value.length > 16000)
        fail('failed-precondition', 'Texto inválido.');
      action.value = value.value;
      if (capability.kind === 'select') {
        const index =
          providerCapabilities
            .find((item) => item.id === capability.id)
            ?.options?.indexOf(action.value) ?? -1;
        if (index < 0 || !capability.options?.[index])
          fail('failed-precondition', 'Opção indisponível.');
        action.value = capability.options[index];
      }
    }
  }

  return action;
}
