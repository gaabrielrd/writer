# P1 / M38c12 — Backup lógico indexado do lore

## Objetivo e descoberta

Prosseguir a etapa 5 do [plano 80](80-consumidores-do-lore-completo.md), sem
declarar concluído o conjunto de P1. A etapa 4 foi conferida no código atual:
EditorChatContextRead usa leitor lógico; LoreAnalysisContext usa
ReadBookLoreLogical com orçamento de contexto; Scenes/NarrativePlanning usam BookLoreReferenceRead; publicação
usa captura C1 e o certificado dos marcos A/B do plano 130.

ChapterChat clássico recebe contexto cliente de listLoreEntities hidratado;
não resolve fichas backend. O [plano 29](29-contexto-autorizado-e-ia-de-cenas.md)
e a [ABI 30](30-contratos-do-chat-de-cenas.md) preservam explicitamente capítulos/
históricos antigos, sem migração/proveniência retroativa. Não ampliar esse
contrato durante o backup. Campanhas capturam universo/aventura por leitores
próprios; não conceder autorização implícita para fichas de livros.

BookBackupResourceRead ainda serializa snapshot.data de lore. Em stubs, omite
a fonte lógica ou falha no domínio. BookSnapshotCapture reúne todo JSON em RAM;
BookBackupContent/BookRestoreValidationStep limitam a 8 MiB/128 spans e também
recompõem o item. Essa fronteira não atende lore grande nem JSON remapeado que
cresceu. O framing do contêiner já aceita múltiplas partes; não aumentar o limite
nem reunir uma string gigante como substituição da leitura por faixas.

## Requisitos e suposições

Preservar campos presentes/ausentes, strings/UTF-8/BOM/escapes literais, ordem e
duplicados de aliases/relações, datas reais e consentimento, sem resolver global.
Projeção portátil continua fechada, sem payloadStorage, jobs, chaves ou tokens.
Nome/categoria são obrigatórios; demais campos seguem o schema portátil atual.
Cópia continua privada e autoriza a mesma origem nativa por unidade e ao selar.

O índice sintático não concede acesso, não certifica SHA/nascimento, nem permite
ativação. Valores do índice temporário precisam ser vinculados ao mesmo arquivo,
item, framing e checkpoint nativo antes de produção/restauração. Relações devem
ser indexadas e remapeadas por unidades, sem catálogo integral em RAM.

Não criar formato incompatível se o framing existente puder transportar o JSON
lógico completo por spans. A versão/representação final só será habilitada após
todos os leitores, validadores, materializadores e cleanup estarem integrados.

## Sequência de implementação

1. A: núcleo puro compartilhado de índice do objeto data do lore portátil,
   processando até 64 KiB por passo. Reutilizar a gramática/domínio incremental
   dos campos, com uma entrada separada para relações extensas; conservar o
   limite e o contrato das páginas nativas de 64 relações. Índice em estado
   constante, somente campos/ranges/datas/privacidade/contagens e ID corrente.
   Eventos de referências saem em unidades, sem guardar prosa/lista integral.
   Desacoplar o erro público GenerationError do I/O, preservando a mesma classe
   reexportada por generation e todos os contratos dos validadores existentes.
2. B: composição/inspeção autorizada do lore lógico inline/v1/v2/criação e índice
   de saída portátil por spans. Fixar coleção/livro/ficha/geração/segmentos e
   hash integral. Leitura de cada página deve ter budget nativo explícito e
   custo total linear, sem reconstruir o item a cada chamada. Inventariar e
   implementar cancelamento/fence/cleanup antes de qualquer novo produtor.
3. C: integrar captura cliente, validação local e validação servidor em unidades.
   Eliminar o acúmulo de prosa/spans ilimitados no checkpoint e conferir EOF,
   framing, SHA/domínio/referências antes de aceitar o item. Compatibilidade
   atual é requisito; nenhum fallback para serializar o stub.
4. D: integrar leitor verificado/remapeador/materialização de lore e relações,
   incluindo crescimento após remap >8 MiB e fontes/campos/páginas grandes.
   Produção nativa deve ser limitada por unidade, manter raiz ausente, inventário,
   rollback e retomada com provas originais. Conferir captura → validação →
   remap → preparação → leitura/recaptura antes da ativação geral.
5. Conferir todos os namespaces/escritores/exclusão/coleta e compatibilidades de
   P1, migrar/certificar fontes legadas necessárias, integrar host/roundtrip,
   executar validate integral no fechamento de P1. Restante de P1/fases 3–5 e
   gates humanos/comerciais permanecem requisitos, sem push/CI/deploy.

## Arquivos e aceites do marco A

Novos generationError e BookPortableLoreIndex/testes; Generation e
BookLoreFieldValidation conservam ABI. A gramática nova de relações extensas
não é aceita pelas entradas anteriores de página/campo. Sem endpoint, namespace,
Rule, dependência, captura ou materialização novos neste marco.

Node/Chromium/bundle browser: objeto lógico acima de 8 MiB/128 partes, texto grande
em campos/descrição, muitas relações/aliases, UTF-8/escapes em fronteiras, ausência/
vazio/duplicados, datas/IDs/enum, JSON truncado/não canônico, checkpoint inválido
e entrada imutável. Comparar domínio ao schema portátil existente. Estado e
retorno limitados pela unidade; índice não guarda prosa nem todas as relações.

Testar regressões dos consumidores do validador de campo e identidade de
GenerationError. Lint/sintaxe/formato/docs/arquitetura/build conforme risco;
documentar evidência real e commit local. Sem validate global até fechar P1.

## Riscos e não escopo

A base v1 requer inspeção completa, mas não releitura quadrática. Um índice de
ranges sem prova nativa não autoriza leitura. Não usar orçamento de contexto/
publicação como teto de autoria ou portabilidade. A/B isolados não entregam
backup grande ou restauração integral; não retirar essas pendências do registro.

Não migrar chat clássico, resolver lore externo, alterar UI comercial, habilitar
rollout ou inferir validação humana. Somente commits locais, sem subagentes.

## Mapa de fronteiras conferidas em 2026-10-25

| Fronteira                                               | Estado observado e continuação                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| EditorChatContextRead                                   | C1/ContextRead lógico em livro; proveniência histórica por nascimento.                                            |
| LoreAnalysisContext                                     | ReadBookLoreLogical com budget próprio de contexto, sem usar stub como dado.                                      |
| Scenes/NarrativePlanning                                | BookLoreReferenceRead para livro; ramos diretos restantes são aventura/universo.                                  |
| PublicationService/BookLorePublication                  | Captura C1 original e inspeção certificada; finalização transacional.                                             |
| LoreService/get/list/subscribe                          | Hidrata payloads antes do DTO visual. Hosts nativos usam captura C1 bruta.                                        |
| ChapterChat clássico                                    | Contexto cliente hidratado; capítulos/históricos legados preservados conforme 29/30.                              |
| CampaignCapture/CampaignLoreOrigin                      | Somente universo/aventura; não migrar para C1 de livros.                                                          |
| BookBackupResourceRead/BookResourceCapture              | Documento físico/JSON recomposto: B/C obrigatórios.                                                               |
| BookBackupContent/BookRestoreValidationStep/ContentRead | Limite/coleção de spans/recomposição: C/D obrigatórios.                                                           |
| ExportManuscript JSON legado                            | Usa DTO hidratado de apresentação; preservar compatibilidade sem usá-lo como fonte bruta do backup integral novo. |
| AssistedBook/BookRestoreArtifacts/LoreAnalysis apply    | Produtores, não prova de leitura portátil; inventário conjunto de writers/P1 continua obrigatório.                |

Busca no grafo consultada primeiro; símbolos recentes/edges ausentes exigiram
conferência direta das fontes. Este mapa não é prova de inventário global vazio,
implantação, validação humana ou rollout.

## Estado do marco A — 2026-10-25

Índice puro e declaração compartilhada implementados: 335 Node distintos
positivos (47 novos/288 regressões), três jornadas Chromium, bundle browser de
12 módulos e declaração TS isolada conferidos. [ADR 0151](../../../decisions/0151-incremental-portable-lore-index.md)
e [evidência](../../../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md).

A não está conectado à captura/validação/restauração; limites antigos não foram
alterados. Continuar B → C → D antes de encerrar o plano. P1/F2-09/V2 e demais
fases/gates permanecem abertos; validate integral somente no fechamento de P1.
