# Writer V2 — P1 M1, captura consistente do histórico

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2
- **Plano de origem:** [P1 M1](../tasks/writer-v2/execucao/32-captura-consistente-do-historico.md)
- **Estado:** marco interno validado localmente; Git/CI próprios em fechamento. Não conclui P1/F2-09/V2.

## Objetivo

Preparar o backup completo sem perder versões por mudanças durante a paginação.
A captura inclui histórico de recursos removidos e falha se a seleção mudar.
O botão/arquivo de backup restaurável ainda não faz parte deste marco.

## Capacidades implementadas

- Catálogo com revisão transacional na criação, cópia anterior e retirada de uma
  versão; replay e cleanup físico não incrementam novamente.
- Source autorizado por UID/projeto e timestamps precisos da raiz. Página e corpo
  podem exigir o mesmo token na própria transação; o histórico legado continua
  usando as opções anteriores.
- Captura pública do serviço de manuscript-history reúne todas as páginas/corpos,
  verifica integridade e resumo e confirma o source no fim. Invalidação retorna
  null; seleção inconsistente rejeita, sem resultado parcial ou token no DTO.
- Rules preservam o contador de livro no cliente; criação aceita ausência/zero.
  Escrita direta de manifesto/corpo continua negada inclusive ao dono.
- Escolha do universo registrada no plano: religar se autorizado, sem duplicação.
  A implementação dessa restauração continua pendente.

## Critérios do marco

- [x] Criação/restauração/retirada incrementam uma vez por mudança de seleção.
- [x] Replay/rollback/cleanup preservam contador e semântica de prosa/ledger/crédito.
- [x] Criação/exclusão entre páginas e troca de conta/encarnação rejeitam a captura antiga.
- [x] Versão vazia ou de recurso removido é preservada, sem recriar o recurso.
- [x] Timestamp nativo inválido e clock corrompido/esgotado falham sem inventar data.
- [x] Legado sem contador pode ter versões; zero não é catálogo vazio.
- [x] Validações locais e regressões dirigidas passaram.
- [ ] Git e CI do novo head conferidos após envio; sem rollout.

## Arquivos

| Área                                             | Alteração                                                 |
| ------------------------------------------------ | --------------------------------------------------------- |
| functions/src/workHistorySnapshot.mjs            | Revisão, source e comparação precisa de token.            |
| functions/src/workHistory.mjs                    | Writers atômicos e opção de token nas leituras.           |
| functions/src/index.mjs e functions/package.json | Callable de source e syntax check.                        |
| firestore.rules                                  | Preservação do contador no cliente.                       |
| manuscript-history/model e services              | Tipos, cliente e captura integral verificada.             |
| workHistory unit/SDK e fixture visual            | Vetores, integração real e compatibilidade de transporte. |
| docs/AGENTS/ADR 0044                             | Regra de trabalho, decisão e limites de M1.               |

## Testes e validações reais

- Primeira unidade backend: 28/28; integração com blocos: 39/39 em 1,23 s.
  Cinco vetores foram adicionados depois e passaram no validate integral.
- Cliente dirigido: 32/32 em 1,38 s, incluindo cancelamento em cada janela,
  resumo/corpo divergentes, paginação, duplicação e origem removida.
- SDK/Rules: 10/10, zero fail/skip, 37,11 s; Firestore/Admin reais no emulador
  1.22.0 com SHA-256 conferido, sem backend live ou provedor pago.
- Navegador: 6/6, 44,26 s, zero retry/skip/flaky; três jornadas de livro, aventura
  e origem removida em desktop-dark/mobile-light. Todos os coletores com
  runtimeErrors=[] e blockedRequests=[]. Transporte fictício, não prova de Rules.
- ESLint dirigido primeiro apontou uma asserção de tipo desnecessária; ela foi
  removida e o lint passou. Nenhuma asserção de comportamento foi retirada.
- npm ci --prefix functions: código 0, 251 pacotes, zero vulnerabilidades; engine
  Node 22 em runtime 24.21.0 e avisos deprecated registrados.
- `npm run validate` terminou com código 0. Resumo real:

```text
Test Files  219 passed (219)
Tests  2545 passed (2545)
Scripts: tests 85; pass 85; fail 0; skipped 0
Functions: tests 635; pass 635; fail 0; skipped 0
All files | 90.98 | 85.64 | 90.68 | 93.62
Smoke test do bundle OK.
```

Arquitetura, documentação, styleguide, formato, lint, tipos, backend syntax e build
passaram. Limites de cobertura preservados. Depois do validate somente docs/AGENTS
foram atualizados; seus checks dirigidos são repetidos antes do commit, sem
alegação de segunda execução integral. Avisos de chunks grandes e importação
estática/dinâmica de exportDocx permanecem.

Logs privados em writer-v2-portability-qa: m1-functions-install.log,
m1-history-unit-first.log, m1-backend-integration.log, m1-client-first.log,
m1-sdk-first.log, m1-native.json, m1-native-verification.json e m1-validate.log.

## Fora do escopo e pendências

Formato/arquivo restaurável, bytes de imagens, orçamento/streaming, materialização
privada, revisão/confirmação, retomada e roundtrip P1 ainda não implementados.
O helper atual reúne o histórico em memória; isso não define um limite comercial
nem comprova o orçamento de um arquivo arbitrariamente grande. JSON v6 continua
sem histórico. Tokens de M1 não cobrem sozinhos metadados/personas/progresso/mídia.

Rollout precisa coordenar todos os writers do clock e Rules e drenar instâncias
antigas antes de habilitar captura. Nenhuma implantação, merge ou chamada paga.
A contagem ampla permanece 8/35 tarefas; não somar um marco interno como nova
tarefa concluída. CI cancelada/parcial da base A está na sua própria entrega,
sem conversão em aprovação deste head. Pilotos humanos/comerciais pendentes.

## Verificação

No ambiente local de demonstração, guardar/restaurar texto pelo histórico deve
preservar cópia anterior, undo e prosa. O histórico do projeto deve permitir
consultar e excluir uma versão de capítulo removido sem recriá-lo. A prova de
concorrência/token/Rules exige executar workHistory.rules.test.mjs no emulador;
fixtures de navegador não demonstram essa autorização. A nova captura por serviço
ainda não tem ação de download no produto.
