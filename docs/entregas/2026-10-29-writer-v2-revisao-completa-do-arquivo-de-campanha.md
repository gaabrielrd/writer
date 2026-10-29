# Writer V2 — revisão interna completa do arquivo de campanha

- Data: 2026-10-29.
- Escopo: [plano 218](../tasks/writer-v2/execucao/218-semantica-dos-derivados-da-campanha.md).
- Decisão: [ADR 0248](../decisions/0248-campaign-derived-semantics-and-review.md).
- Estado: conferência interna implementada; P3/D/F2-09 e macro 8/35 abertos.

## Implementação

DTOs derivados fechados e joins de snapshot/base, itens/origens/pais, campos/
manifestos/corpos, imagens/blocos, links/alvos/ledger e variantes/âncoras.
Inclui principal compartilhado, legadas com fonte inline e omissões explícitas.
O callback derivado processa campo/imagem por fluxo e só reúne um JSON limitado.

Índice temporário somente de metadata com MAC efêmero, posições ordenadas e
prova de ausência por vizinhos consecutivos. Páginas de 25 são autenticadas
antes de callback/lookup; reverse exige registro positivo. Não guarda prosa,
não cria adapter persistente e descarta chave/índice em sucesso ou falha.

A revisão composta executa próprios, derivados e origens atuais no mesmo
arquivo, recusando mistura de cadeias/tamanhos/manifestos. Captura leitor antes
de await e cria os índices por etapa, com cleanup inclusive em cancelamento.
Não é grant ou ativação: materializador deverá conferir identidade e acesso
novamente. Referências de âncora fora do arquivo são não resolvidas e contadas;
não religar por ID/chave sem prova atual.

## Testes dirigidos executados

- campaignBackupDerivedSemantics.test.mjs: **62/62**, zero falhas/skips,
  7883.0013 ms na execução final.
- Regressões pertinentes: campaignBackupFile (29), campaignBackupOriginReview
  (56), campaignBackupOwnSemantics (47) e campaignBackupUtf8Fields (19):
  **151/151**, zero falhas/skips, 10021.9039 ms.
- Total dirigido: **213 cenários distintos aprovados**.
- Rico/vazio, UTF-8 longo, legado v1 assinado, adoção/base antiga ausente,
  revogação de origem/ficha, relações nativas e alvos ausentes legítimos.
- 28 violações reassinadas: schema, fonte, pais, manifestos, omissões/duplicatas/
  órfãos, imagens/ledger, variantes/âncoras e seus campos. Integridade isolada
  passa antes de a semântica recusar cada caso.
- Índice/MAC/namespace, ausência falsa/vizinhos inválidos, paginação, replay de
  outra execução, falhas em cada porta, abort, chave revogada e cleanup.
- Revisão composta: três etapas, troca por outro arquivo válido, fábrica
  assíncrona/cancelada/inválida e leitor emprestado alterado.

A primeira montagem do caso de relação externa ainda deixava a ficha no
candidato. Ao removê-la, a proteção C3 corretamente recusou uma relação própria
incompatível. O teste foi preparado com relação própria removida pelo escritor,
preservando a relação original da âncora; então a ausência real foi validada.
Nenhuma regra C3 foi alterada para acomodar o teste.

## Validação do bloco e limites

A validação integral do bloco de conferência interna 201–218 passou localmente:
**npm run validate encerrou com código 0**, sem reduzir limiares de cobertura.
Testes de produção/credenciais reais, Rules/emuladores, UI e ciclo de restauração
não são comprovados por esses testes internos.

Sem callable/UI/produção nova. Faltam consumidores de procedência restaurada e
referências opacas, C4 v1–v4 antes de persistir, upload/retomada, nova cópia/
remapeamento, materialização/ativação e interface/ciclos. Sem CI/push/PR/merge/
deploy/subagentes; somente commit local. Dev server manual preservado.

## Resultado integral do bloco 201–218

| Verificação                                    | Resultado                                                      |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Skills, arquitetura, documentação e styleguide | Positivos                                                      |
| Formatação e lint completos                    | Positivos                                                      |
| Frontend                                       | 4.978/4.978, 370 arquivos; 446,20 s                            |
| Scripts                                        | 94/94; 22.293,5753 ms                                          |
| Functions                                      | 4.456/4.456; 442.648,4221 ms                                   |
| Cobertura global                               | 89,71% instruções; 85,93% ramos; 90,94% funções; 92,87% linhas |
| Sintaxe Functions                              | 445 módulos conferidos                                         |
| Typecheck                                      | tsc -b positivo                                                |
| Bundle                                         | Vite positivo; 3.113 módulos; 2,82 s                           |
| Smoke HTTP do bundle                           | Positivo, porta efêmera própria                                |
| Comando completo                               | npm run validate, código 0                                     |

São **9.528 testes no validate**, sem falhas ou skips; os 213 dirigidos já estão
incluídos nessa suíte e não devem ser somados novamente. Dependências de Functions
já instaladas no mesmo worktree; nenhum pacote/lockfile foi alterado neste bloco.

Os testes negativos de SDK registram rejeição de tokens App Check sintéticos.
O bundle mantém os avisos existentes sobre tamanho de chunks/imports dinâmicos
ineficazes; não houve alteração de frontend nem erro de bundle/smoke.

Não houve rodada nova de browser/Rules/emuladores/credenciais de produção.
Atualizações finais somente documentais recebem check dirigido, sem repetir
toda a suíte. Artefatos fora do Git: m141-final-62.log, m141-regressions.log
e m141-validate.log em writer-v2-portability-qa.

Conferência final pós-evidência: links, Prettier dos 13 arquivos e diff passaram.
Varredura dirigida não encontrou chaves privadas literais, padrões de segredo
ou artefatos acima de 5 MiB. Master em E segue limpa em 522ccaa; Vite manual
node 11192/5173 permanece HTTP 200 sem reinício. Nenhum recurso real foi apagado.
