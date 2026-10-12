# ADR 0023 — Capacidades e preferências de raciocínio do chat

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

A paridade do workspace inclui raciocínio selecionável, mas os provedores não
aceitam os mesmos níveis. Conversas privadas devem retomar preferências sem
guardar credenciais, e modelos personalizados precisam de um fallback seguro.

## Decisão

`functions/src/chatGeneration.mjs` é um contrato puro, sem rede, armazenamento
ou segredos, compartilhado pelo servidor e pelo modelo da feature no navegador.
Sua declaração `.d.mts` define os tipos. Isso evita duas matrizes divergentes,
sem criar dependência do frontend em código de infraestrutura.

A matriz reconhece somente os identificadores verificados em documentação
oficial: Gemini 3.7/3.8 Flash oferecem Baixo/Médio/Alto; GPT-6 Luna/Sol oferecem
Nenhum/Baixo/Médio/Alto/Muito alto/Máximo; GPT-6.1 Sol e GPT-6 Astra oferecem
os mesmos níveis exceto Nenhum. Modelos desconhecidos e GPT-4o mini conservam
somente Auto. Não inferir suporte pelo prefixo de um nome personalizado.

Auto resolve para o padrão documentado quando ele é conhecido; sem esse dado,
mantém o padrão do provedor. Uma preferência incompatível permanece salva,
mas a geração deve resolver para Auto e informar esse fallback. Máximo nunca
remove limites: 4000 tokens de saída/completion e 90 segundos no provedor,
com 120 segundos na callable e a cota existente de pedidos. Tokens internos
podem consumir o limite do provedor; uma saída incompleta não vira sugestão.

A callable informa o modelo da plataforma no load, valida a enumeração de
preferências e grava a escolha em cada conversa privada. Ações de preferência
verificam autoria e recusam mudanças durante uma geração ativa. Não debitam
nem consomem cota de geração. Conversas antigas sem campo usam Auto.

Novas conversas recebem o padrão versionado por usuário/navegador, através de
adaptador local. Falha local não desfaz uma escolha salva no servidor; falha
no servidor conserva a escolha anterior. Nenhuma chave entra nessa preferência.
A integração dos parâmetros e a identidade imutável dos pedidos pertencem
à tarefa 10 do plano aprovado.

## Fontes e consequências

Matriz verificada em 2026-10-12 nas páginas oficiais de
[Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash),
[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[ThinkingConfig de generateContent](https://ai.google.dev/api/generate-content#ThinkingConfig),
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol),
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
e [raciocínio OpenAI](https://developers.openai.com/api/docs/guides/reasoning).
Gemini 3.7 é um alias que o provedor encaminha para 3.8; o identificador configurado
no Writer permanece preservado. Identificador de requisição e versão física
servida pelo provedor são conceitos distintos.

O transporte futuro deve usar `thinkingConfig.thinkingLevel` em generateContent
e `reasoning_effort` em Chat Completions, sem copiar nomes de parâmetros entre APIs.
O controle é compatível com o histórico antigo e exige liberação coordenada de
frontend/callable. Veja [plano](../tasks/paridade-editor-gerador-temas.md) e
[chat do capítulo](../chapter-chat.md).
