# Writer V2 — Candidatas e comparação de bases da campanha

**Data:** 2026-10-17. **Estado:** concluído tecnicamente em `fe10b15`, com CI e
regras verdes no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).

## Objetivo

Preparar outra captura da aventura própria e examinar suas diferenças antes da
adoção. C3A preserva base ativa, variantes, notas próprias e original. Adoção C3B
e exclusão integral continuam obrigatórias para encerrar F2-07.

## Funcionalidades entregues e critérios de aceite

- Candidata completa na campanha existente: partes, cenas, blocos, narrativa,
  arquivo, texto legado, ilustrações e somente lore explicitamente referenciado.
  Captura limitada e retomável aborta se origem, encarnação ou base mudam.
- Comparação paginada dos dados da origem, itens, referências e imagens, projetada
  antes de classificar. Rebalance técnico não vira mudança autoral; variantes e
  retiradas particulares indicam decisões necessárias na adoção futura.
- Texto integral verificado antes de renderizar; contexto comum protege páginas,
  detalhes e mídia. Descrição/legenda autorais aparecem sem buscar bytes; prévia
  explícita mantém autorização e falha invalidando o composto.
- Retomada e descarte no Estúdio mesmo sem origem/root. Recibos, fence inicial,
  checkpoints e pins próprios impedem duplicação ou limpeza da base ativa.
- Journal apenas de metadados, com Web Locks e CAS integral. Conhecido não é
  pedido pendente nem autoriza RPC automático. Confirmação antiga não substitui
  outra aba; consulta nova não fica presa à resposta anterior sem confirmação.

## Arquivos e contratos

Feature `src/features/campaign-comparisons`, composta publicamente na campanha
e no Estúdio. Functions acrescenta campaignComparison, contratos/leitor e o motor
mínimo compartilhado campaignCaptureEngine. Leitor B conserva seus endpoints;
há índices declarados para controles e contexto de ordem. Testes de servidor,
SDK, interface e fixtures acompanham a implementação.

Ver [contrato C3A](../tasks/writer-v2/execucao/18-comparacao-de-bases-da-campanha.md)
e [ADR 0034](../decisions/0034-campaign-base-comparisons.md).

## Testes e validação executados

`npm run validate` **exit 0** no fechamento:

- Frontend: **170 arquivos / 1.680 testes**, 146,32 s.
- Cobertura: **90,69% instruções, 84,71% ramos, 90,30% funções e 93,32% linhas**;
  limites, isolamento e instrumentação preservados.
- Scripts: **77/77**, 9.683,6018 ms; Functions: **324/324**, 2.847,5666 ms.
- Skills, arquitetura, documentação, estilo, formato, lint, tipos, sintaxe, build
  e smoke verdes. Build em 2,75 s; avisos existentes de chunk grande/importação
  mista do exportador DOCX permanecem.

SDK Firestore/regras reais: **22/22** nos arquivos B/C1/C2/C3A, 83.436,166 ms,
zero falhas/skips. Após limitar a projeção de imagem, somente o cenário afetado
foi repetido, verde em 16.298,4743 ms. O runner seletivo também carregou três
arquivos sem casos correspondentes; não são cenários adicionais. Emuladores
encerrados. Assets são injetados: isso não comprova Storage real.

HTTP real: três casos verdes, cobrindo no-store no callback de mídia em
sucesso/erro; não comprova recusas anteriores do framework ou produção.

Navegador: **24 combinações C3A únicas** nos seis projetos, 26.940,604 ms +
93.824,963 ms, zero retries/skips/flaky. Após corrigir o primeiro P2 de journal,
repetiram-se apenas as seis combinações da jornada de recuperação, junto com
seis regressões de narrativa: **12/12**, 90.097,568 ms. No último ajuste de
carregamento, um controle desktop específico passou **1/1**, 4.689 ms de teste
e 8.133,146 ms total. São 37 execuções positivas, com seis repetições; não 37
cenários C3A únicos. Raiz inspecionou seis PNG 320×740 nos três temas.

O controle final reteve GET antigo, atualizou Known pelo adaptador/Web Lock real,
rejeitou o passo antigo sem RPC e confirmou GET novo antes de liberar o anterior.
O servidor é simulado; autorização, orçamento e pins reais pertencem ao SDK.
O journal C3A não implementa cifra/IndexedDB; essa recuperação pertence ao C2.

## Revisão e negativos preservados

Revisões de servidor, cliente e integração encerraram sem bloqueadores restantes.
Negativos dirigidos reproduziram e corrigiram cursor de item ausente, campo de
imagem invisível causando mudança, contexto novo em páginas de texto, scope local
inválido, nova preparação após descarte, Known rebaixado por outra aba e loading
preso em GET invalidado. Os últimos sete afetados passaram após falhar antes.

O primeiro lote nativo falhou em quatro seeds C1 antes do fluxo C3A, pois noteId
e operationId divergiam. Corrigiu-se somente o seed; traces/JSON são preservados.

## Correção da CI e distribuição

A CI de `75b9104` terminou cancelada em um shard no limite de 15 minutos; sete
shards, validate Node 22/24, auditoria, produção e regras passaram. Traces de um
caso de cronologia mostram navegações redundantes consumindo os 45 segundos.
Removeram-se somente duas navegações, preservando reload, ordem, dois downloads
e comparação integral. O caso passou nos seis projetos, entre 10,321 e 17,919 s.

A suíte inteira passa de oito para doze shards, com workers, limites, retries e
gate agregado intactos. Oito contratos CI verdes. Enumeração `--list`: **1.092
IDs**, **91 por shard**, união exata sem omissão/duplicação; não executa testes
nem comprova redução de tempo remoto. Ver [ADR 0024](../decisions/0024-test-pipeline-sharding.md).

## Evidência e limitações

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-campaign-comparison-validate-final.log`, SDK/log do emulador,
`writer-v2-twelve-shards-audit.json` e `writer-v2-campaign-comparisons-qa/qa-summary.json`
com resultados, negativos, traces e hashes das capturas.

Sem adoção, transferência de variantes/chaves/ciphertext, exclusão integral,
sessões, compartilhamento ou comércio neste incremento. Candidatas não têm TTL.
Índices/callables não estão implantados por consequência dos testes; não houve
merge ou deploy. Pilotos humanos, zoom físico/leitor de tela e capacidade comercial
live conservam seus gates próprios. Checkout original master 522ccaa preservado.

## Como verificar manualmente

1. Criar campanha de aventura própria; editar o original e preparar candidata.
2. Comparar origem, conteúdo, referências e ilustrações; abrir texto dos dois lados.
3. Conferir que base atual, variantes, notas e outra mesa permanecem intactas.
4. Interromper resposta e recarregar; confirmar o mesmo pedido ou encerrar o início
   explicitamente. Em duas abas, preservar o controle mais recente.
5. Descartar candidata e retomar limpeza pelo Estúdio mesmo sem a origem.
6. Repetir por teclado e em 320 px, nos temas claro, escuro e sépia.

## Registro e envio

Commit `fe10b151f17230cc12aa2236edf209cc9ff26da4`, 56 arquivos, 9.129 inserções e
313 remoções. Pre-commit/commit-msg passaram; pre-push preservado: tipos verdes,
170 arquivos/1.680 testes em 128,14 s. SHA remoto conferido; worktree limpo após
envio. PR 21 confirmado aberto em rascunho, sem merge, base master 522ccaa.

Na primeira consulta do novo head, [regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/39089175341)
concluídas com sucesso e [CI geral](https://github.com/gaabrielrd/writer/actions/runs/39089175323)
em execução. Resultado parcial não equivale a aprovação remota geral; acompanhamento
continua em paralelo ao planejamento C3B, conforme autorização.

## Confirmação remota

CI e regras do mesmo SHA `fe10b15` terminaram com sucesso, incluindo validate
Node 22/24, auditoria, produção, doze shards e consolidação. Logs reais:
**1.080 visuais passaram**, **12 skips preexistentes**, **zero retries/flaky**;
produção **7/7**, 18,3 s; Firestore **125/125**, zero falhas/skips, 49.182,260951 ms.
As execuções de testes dos shards duraram de 5,4 a 9,5 minutos, sem contar setup
ou consolidação. Isso mede este head, sem prometer duração futura.

C3A concluído tecnicamente; C3B e exclusão integral ainda pendentes. O PR continua
em rascunho, sem merge/deploy e sem encerrar gates humanos/comerciais.
