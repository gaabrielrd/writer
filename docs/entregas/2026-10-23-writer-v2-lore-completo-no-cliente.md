# Writer V2 — Lore completo no cliente (M38c2)

- **Data**: 2026-10-23
- **Branch**: codex/writer-v2
- **Plano de origem**: [M38c, etapa 2](../tasks/writer-v2/execucao/80-consumidores-do-lore-completo.md)
- **Decisão**: [ADR 0092](../decisions/0092-complete-lore-client.md)

## Objetivo

Ler a ficha lógica completa antes de apresentar lore restaurado, incluindo dados
gerais extensos e relações paginadas. Preservar livros inline e impedir retorno
vazio/parcial ou resposta antiga depois de perder o contexto.

## Funcionalidades entregues

- Montagem de payload por bytes comprovados, SHA integral, UTF-8/JSON e schema
  de domínio compartilhado, preservando conteúdo literal e campos opcionais.
- get/list/assinatura incluem stubs sem nome; a coleção completa é revalidada
  por IDs/tokens antes de mapear e ordenar as fichas.
- Reenvio de criação que encontra payload existente devolve a ficha completa
  sem escrever novamente nem avançar clock.
- Guarda da conta exata, cancelamento/epoch e unsubscribe; assinaturas limpam
  dados apresentados quando a autorização/raiz deixa de valer.
- Leituras de livro confirmadas pelo servidor e assinaturas conscientes de
  metadata; cache inicial ausente ou escrita otimista não viram dados definitivos.
- Inline continua usando SDK com Rules, sem depender da nova API de payload.
  Escritores antigos recusam update/delete de payload enquanto a etapa 3 não existe.

## Critérios de aceite da etapa 2

- [x] Mais de 8 MiB/128 partes sem teto artificial; Unicode/BOM literais.
- [x] Todas as relações, ausências/vazios e duplicados preservados na montagem.
- [x] Escopo/token/manifest/índice, base64, bytes, SHA, UTF-8, JSON e domínio conferidos.
- [x] Header final fixado e lista completa com nova varredura de IDs/tokens.
- [x] Quatro chamadas concorrentes por lote; drenar chamadas pendentes após erro.
- [x] Respostas obsoletas não publicam nem iniciam páginas novas.
- [x] Snapshot de cache sem raiz não encerra prematuramente a assinatura.
- [x] Livros inline e contratos globais mantidos, com regressões do editor/compêndio.
- [x] Produtor, API e cliente exercitados juntos em memória, com raiz de harness explícita.
- [ ] M38c completo: escritores/Rules/contextos/backup/coleta e etapas 3–7 pendentes.

## Arquivos alterados

| Grupo                                             | Alteração                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| bookLoreReadClient / Contracts                    | Transporte fechado, bytes, domínio e confirmação final                         |
| bookLoreReadService / Subscription                | RPC regional, conta exata, raiz e refresh serializado                          |
| loreService                                       | get/list/assinatura/criação existente e bloqueio de writers legados em payload |
| bookBackupSchema.d.mts                            | Declarações dos validadores puros já existentes                                |
| Três testes TS novos e teste integrado mjs        | Transporte, adaptador, bindings e produtor/API/cliente                         |
| Dois testes de serviço existentes                 | Mocks de conta, leitura servidor e metadata da assinatura                      |
| src/test/setup.ts                                 | Guardas de DOM para permitir também testes Node                                |
| Plano, ADR, AGENTS, README, arquitetura e testing | Contrato, evidência e próximos aceites                                         |

## Testes reais

**149 testes distintos positivos, em nove arquivos**: 85 novos e 64 existentes.
Não somar execuções repetidas. Evidência final por conjunto:

| Conjunto                                     | Casos distintos | Execução                                                |
| -------------------------------------------- | --------------: | ------------------------------------------------------- |
| Leitor puro cliente                          |              51 | 51 positivos, 3,69 s                                    |
| Bindings, serviços local/global e três hosts |              88 | 88 positivos em seis arquivos, 8,95 s                   |
| Adaptador RPC/conta                          |               8 | Incluídos na execução positiva de 30 casos com bindings |
| Produtor/API/cliente em memória              |               2 | Ambos positivos na execução de 64 casos com DOM e Node  |

```text
Leitor final:
Test Files 1 passed (1)
Tests 51 passed (51)
Duration 3.69s

Serviços e hosts após confirmação servidor:
Test Files 6 passed (6)
Tests 88 passed (88)
Duration 8.95s

Bindings e adaptador:
Test Files 2 passed (2)
Tests 30 passed (30)
Duration 1.71s

Setup DOM/Node e integração (inclui repetições):
Test Files 3 passed (3)
Tests 64 passed (64)
Duration 8.20s
```

O leitor confere Unicode/BOM de mais de 9 MB, 130 relações, ausências, vazios,
duplicados, SHA/UTF-8/JSON/domínio, headers/partes adulterados, limites de lote,
cancelamento, 138 IDs em todas as páginas e mudanças na varredura final.

Bindings cobrem carregamento confirmado, payload misto, caminho inline,
idempotência, revogação, troca de encarnação da conta antes do callback,
root/clock inválidos, unsubscribe, snapshots mais novos e escrita pendente.
Os hosts são LoreCollection, EditorPage e EditorPageChat. O adaptador usa sua
guarda real; a integração usa o produtor e os leitores reais com o DB em memória.

O produtor carrega/valida um arquivo real de fixture, prepara/remapeia o lore e
o cliente lê o conteúdo completo via API, inclusive lista com três entidades.
Antes da raiz de harness, a leitura falha. Depois, preserva texto por SHA,
todos os campos/relações e o timestamp monotônico real da preparação.
O job continua privado em scenes, sem certificação ou ativação.
O segundo cenário revoga a raiz após a primeira parte e impede resultado parcial.

A execução inicial do leitor teve um cursor de fixture em base64 comum;
corrigido para base64url, apenas o cenário afetado foi repetido. O teste de falha
de mapper passou após fornecer a autorização da raiz exigida pelo contrato novo.
No teste integrado, jsdom era incompatível com o realm das fixtures/hash-wasm
servidor; ele passou a usar Node com setup DOM condicional. A expectativa de data
fixa também foi corrigida para o timestamp monotônico real. Nenhum parser,
invariante ou contrato de produção foi afrouxado para fazer os testes passarem.

## Validações executadas

- Typecheck, lint dirigido e arquitetura passaram.
- Bundle final passou em 2,15 s e smoke do bundle OK.
- Build emite avisos de tamanho de chunk e imports dinâmicos ineficazes.
- Formatação, documentação e diff final passaram antes do commit.
- Nenhum teste SDK/Rules repetido: não houve alteração de Rules ou backend.
- Não houve jornada browser nova ou chamada às Functions de produção.
- Suite integral/coverage/validate permanecem no fechamento de P1, conforme o usuário.

## Limitações e próximos passos

Bloquear update/delete no cliente protege o caminho atual, mas não entrega
escritores novos nem segurança das Rules. Não habilitar payloads restaurados
antes de implementar a etapa 3. Livro inline lê pelo SDK servidor; payload
precisa das três APIs correspondentes implantadas no rollout futuro. Falha de
conexão não autoriza cache antigo como alternativa.

Contextos backend/referências/publicação, backup lógico em faixas,
coleta/exclusão do livro ativo, demais campos grandes e saída portátil ampliada
continuam pendentes. Certificação/ativação, capa/biblioteca, host de restauração
e roundtrip final de P1 não foram concluídos por esses testes de leitura.
P1/F2-09 e Writer V2 seguem abertos.

Sem push, PR, CI remota, deploy, cobrança ou ativação.

## Como verificar

Executar os arquivos de teste bookLoreReadClient, bookLoreBindings,
bookLoreReadService e bookLoreReadRoundtrip em src/features/lore/tests.
O teste mjs integrado declara ambiente Node e não acessa dados de produção.
Para testar payload pela interface, ainda são necessários o rollout das APIs
e os gates pendentes; abrir o dev server por si só não prova esse fluxo.
