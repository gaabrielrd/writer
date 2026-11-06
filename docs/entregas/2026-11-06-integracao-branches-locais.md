# Integração das branches locais e acompanhamento da CI

## Autorização e escopo

Em 2026-11-06, o operador solicitou integrar as alterações locais na branch
principal, fazer commit e push, pular validações locais e acompanhar/corrigir a
CI. Confirmou explicitamente incluir também os rascunhos não commitados dos
outros worktrees.

O fetch confirmou `master` como principal e `origin/master` em `35c20d1`.
Todas as branches locais anteriores já estavam contidas nessa base, exceto o
commit `0b9c1af` de `codex/home-publica-impacto`.

O conjunto a integrar inclui:

- Homepage pública e Home autenticada, já registradas em `0b9c1af`.
- [Central de ajuda](2026-11-06-central-de-ajuda.md), pendente no checkout atual.
- Rascunho de produção literária, com 647 arquivos pendentes no worktree
  `codex/producao-literaria` (150 rastreados e 497 novos).
- Ajustes de tipografia, com 16 arquivos pendentes no worktree
  `codex/typography-legibility` (15 rastreados e um novo).

## Procedimento

O inventário e hashes anteriores foram preservados localmente em
`test-results/integration-2026-11-06/worktrees-before.json`. Cada rascunho recebe
um commit na sua branch antes da integração na principal. Resoluções de conflito
devem preservar as funcionalidades dos dois lados e os contratos vigentes.

Hooks são pulados somente nos comandos autorizados com `HUSKY=0`, sem mudar
`.husky` nem a configuração permanente do Git. Não executar testes, lint,
typecheck, formatação automática, build ou `npm run validate` localmente nesta
integração; a verificação técnica ocorre na CI remota.

## Estado da evidência

Os rascunhos foram registrados em `6cd34b7` (ajuda), `8f764c4b` (produção
literária) e `18102f84` (tipografia). A integração exigiu resolver quatro arquivos:
página e testes do livro, testes do assistente e criação de projetos. Foram
preservados as abas modulares atuais, o painel editorial, o assistente persistente
e a geração opcional de capa também na criação manual.

Este registro documenta o escopo e a autorização. Os commits finais, o push e o
resultado da CI devem ser conferidos nas referências remotas e no relatório
final desta integração. Registros anteriores de testes descrevem as respectivas
entregas e não comprovam validação deste conjunto integrado.

O pedido não autoriza implantação manual de Functions ou Firestore. Workflows
já configurados para responder ao push conservam seu comportamento existente.

## Correções guiadas pela CI

O primeiro push foi `38d51d16`. A rodada remota identificou um link absoluto para
Downloads e a referência Linux do styleguide anterior às mudanças de tipografia
e ao acesso Ajuda. O link foi corrigido e a captura estável da CI foi inspecionada
antes de atualizar a referência em `c7c61c10`; o navegador de produção passou
nessa revisão.

As Rules apontaram um callback de transação síncrono em fixture, limpeza de
livro sem o estado deleting preparado e um alias externo indevido no bundle de
teste da portabilidade. As correções preservam as proteções do servidor.
Os contratos de teste do transporte também precisam reconhecer os oito métodos
editoriais acrescentados pelo rascunho, mantendo a conferência de unicidade,
destino e preservação integral do payload.

O rascunho referenciava um componente de consulta histórica ausente. A leitura
privada foi completada com paginação, seleção explícita, limites de bytes,
conferência SHA por parte e integral, nova autorização final e guard da sessão.
Não aplica conteúdo nem persiste corpos. Foram preparados testes de integridade,
revogação, paginação, leitura e recuperação de erro, sem execução local.

A formatação dos arquivos integrados foi aplicada como correção. Os gates
continuam sendo executados na CI, sem alterações de limites ou testes pulados.
O diagnóstico estático adicional após falha coleta tipos, estilo, formatação e
lint remotos, sem substituir a obrigação de `npm run validate` aprovado.

Os cenários visuais foram alinhados aos fluxos atuais: a criação parte de
Projetos, as sugestões de lore exigem seleção explícita e o autocomplete usa
uma fixture transacional própria, com autorização da conta fictícia, hashes,
recibo e atualização conjunta de prosa/crédito. A fixture recusa contexto
editorial configurado que não consegue representar. O teste de movimento por
teclado aguarda a pintura da posição, preservando a comparação estrita.

A primeira validação completa remota da integração registrou 5.590 testes
aprovados e seis falhas na fixture da consulta histórica: o beforeEach retornava
um mock executável, interpretado como cleanup pelo Vitest. O retorno foi removido.
A cobertura global de funções foi 84,99%, abaixo dos 90% exigidos. Foram
acrescentados testes de autoria, histórico, paginação, captura de marcos,
identidade do transporte e pedidos incertos da revisão editorial. Os testes
novos aguardam execução remota; o limite de cobertura permanece inalterado.
