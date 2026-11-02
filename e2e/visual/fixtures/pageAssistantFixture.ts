import type { PageAssistantReply } from '../../../src/features/page-assistant/model/pageAssistant';
import type { AssistedSession } from '../../../src/features/ai-assistant/model/assistedBook';
export async function loadProjectConception() {
  await Promise.resolve();
  return JSON.parse(
    sessionStorage.getItem('writer.visual.assisted') ?? 'null',
  ) as AssistedSession | null;
}
export async function askPageAssistant(input: {
  prompt: string;
  capabilities: { id: string; label: string; kind: string }[];
}): Promise<PageAssistantReply> {
  await Promise.resolve();
  const prompt = input.prompt.split('\n').at(-1) ?? '';
  const wanted = /salv.*capítulo/i.test(prompt)
    ? 'Criar capítulo'
    : /editar campanha/i.test(prompt)
      ? 'Editar campanha'
      : /nova nota/i.test(prompt)
        ? 'Nova nota'
        : /titulo|título/i.test(prompt)
          ? /capítulo/i.test(prompt)
            ? 'Título do capítulo'
            : 'Título da nota'
          : 'Novo capítulo';
  const capability = input.capabilities.find((c) => c.label === wanted);
  return {
    reply: capability
      ? `Vamos usar ${wanted}. Confira a ação antes de continuar.`
      : 'Você pode abrir a ação desejada nesta página.',
    action: capability
      ? {
          id: capability.id,
          ...(capability.kind === 'field' ? { value: 'Abertura das ilhas' } : {}),
        }
      : null,
    contextProof: 'fixture',
  };
}
