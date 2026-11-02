# Configurações de provedor de IA

Em /settings/ai?tab=provider, o autor escolhe primeiro **Firebase AI Logic**
ou **Chave própria — BYOK**. A aba Personas e o retorno ao livro/editor são
preservados. Alterações só passam a valer depois de **Salvar Preferências**.
Salvar não gera conteúdo, consome cota nem debita créditos.

## Firebase AI Logic

| Modelo                | Identificador         | Uso indicado            |
| --------------------- | --------------------- | ----------------------- |
| Gemini 3.8 Flash      | gemini-3.8-flash      | Padrão equilibrado      |
| Gemini 3.5 Flash-Lite | gemini-3.5-flash-lite | Menor custo do provedor |
| Gemini 4 Argon        | gemini-4-argon        | Raciocínio avançado     |

O raciocínio padrão oferece **Médio** e **Alto**. Alto pode aumentar latência e
custo do provedor; não altera a regra de créditos do Writer. Temperatura não
é oferecida nem enviada nas chamadas Gemini abrangidas.

Catálogo e capacidades ficam no contrato puro
functions/src/chatGeneration.mjs, compartilhado com a feature ai-assistant.
As Functions validam IDs explícitos antes de gerar. O chat conserva o
reconhecimento de gemini-3.7-flash para compatibilidade. Um erro de acesso
ao provedor é apresentado sem trocar de modelo silenciosamente.

As preferências aplicam-se a autocomplete, ações do editor, chat, sinopse,
criação assistida e análise de lore. Capas continuam com configuração própria.
Cada operação conserva seus limites de tokens, prazo, validação de saída e
regras de autorização e débito.

## BYOK e armazenamento

BYOK oferece Google Gemini e OpenAI em um segundo seletor, com chave em campo
de senha e modelo opcional. Chaves e modelos de cada provedor são preservados
ao alternar o formulário. O modelo personalizado legado é migrado para o
provedor ativo; ele não passa a definir o modelo da plataforma.

O adaptador byokStorage mantém as preferências locais neste navegador.
Não há sincronização nova entre dispositivos. Preferências Firebase ausentes
ou inválidas usam Gemini 3.8 Flash e Médio; falha ao salvar conserva o
formulário e mostra erro. **Restaurar Padrão** remove a configuração local,
incluindo ambas as chaves, e retorna ao padrão Firebase. Falha na remoção não
é anunciada como sucesso.

## Conversas e pedidos em andamento

Uma conversa com preferência própria conserva seu raciocínio, mostrado no
chat. Novas conversas Firebase recebem o padrão da aba Provedor; o antigo
padrão por usuário continua sendo usado no BYOK. Auto em um novo pedido
Firebase herda o raciocínio da aba Provedor.

O snapshot público de cada pedido inclui somente versão, origem, modelo e
raciocínio. Nenhuma chave é enviada às callables ou copiada ao histórico.
O servidor registra a configuração efetiva antes da geração. Trocar
preferências não interrompe nem modifica pedidos em andamento.

No chat, retry conserva configuração e histórico originais; regenerar usa a
escolha atual. A criação assistida conserva o snapshot no pedido pendente e
na operação do servidor, inclusive após falha. Os blocos e tentativas de
reparação de lore usam o mesmo snapshot. Reutilizar uma identidade com outra
configuração é recusado; recuperar um resultado pronto não gera nem cobra de
novo. Pedidos legados sem configuração preservam seus fingerprints.

## Disponibilidade e publicação

Os modelos foram conferidos na documentação oficial em 2026-11-02.
A disponibilidade efetiva depende do projeto, quotas e requisitos de cobrança;
Argon exige Blaze. Antes de publicar, verificar acesso aos três modelos no
projeto alvo. Não inferir suporte apenas pelo catálogo geral da Gemini API.

Publicar Functions e frontend de forma coordenada. Clientes antigos sem
snapshot continuam aceitos; no chat, BOOK_SYNOPSIS_MODEL permanece como
fallback legado, com padrão de novas instalações em Gemini 3.8 Flash.
Novos pedidos explícitos usam a lista validada pelo servidor.

Fontes:
[modelos Firebase](https://firebase.google.com/docs/ai-logic/models),
[raciocínio](https://firebase.google.com/docs/ai-logic/thinking),
[parâmetros](https://firebase.google.com/docs/ai-logic/model-parameters).
