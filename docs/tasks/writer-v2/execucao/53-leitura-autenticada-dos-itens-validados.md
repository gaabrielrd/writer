# P1 / M20 — Leitura autenticada dos itens validados

## Objetivo e escopo

Preparar a entrada do materializador com leitura interna, limitada por item, do
arquivo novo e dos JSON legados v1–v6 já validados no servidor. Este incremento
não cria livros e não conclui P1/F2-09.

## Decisão confirmada

Em 2026-10-22, o operador escolheu manter o texto salvo no manuscrito e recuperar
um rascunho diferente como versão separada. Os dois textos devem sobreviver.
A implementação da cópia e da versão fica na materialização posterior; esta
decisão encerra a dúvida do plano P1, sem declarar a restauração entregue.

## Requisitos e solução

- Somente servidor; nenhuma rota HTTP/callable nova ou ampliação de regras.
- Abrir somente controle `content-verified`, reserva e marcador nativos válidos,
  destino ausente e snapshot final ligado ao recibo original da validação.
- Reconstruir o relatório final e conferir seu hash antes de oferecer itens.
- Ler ponteiros com nascimento imutável junto ao recibo da operação que os criou.
- Arquivo novo: JSON canônico limitado a 8 MiB; histórico/rascunho/capa por
  quadros limitados, sem acumular todo o texto ou mídia.
- Legado: reproduzir um item pelo catálogo/cursor normalizador já confirmado,
  verificando identidade, tamanho e hash, sem reconstruir o livro inteiro.
- Entregar, junto de cada leitura, verificação para a futura transação de escrita:
  controle, snapshot, ponteiro, índices, recibos e provas dos bytes devem continuar
  iguais. Cancelamento, recriação e alteração durante a leitura bloqueiam o uso.
- Sem novo armazenamento persistido nem dependências.

## Sequência

1. Reutilizar a autenticação do snapshot final e acrescentar leitura protegida de
   ponteiros no store existente.
2. Compor leitor interno na fábrica da restauração; JSON e sequência raw com
   verificação transacional por unidade.
3. Testar equivalência dos dois formatos, vazio/BOM/Unicode, multipartes,
   histórico e rascunho, autorização, cancelamento e alterações/ABA.
4. Validar com testes dirigidos e SDK Firestore real quando aplicável, revisar
   diff e atualizar arquitetura, regras de agentes e evidência local.

## Riscos e critérios de aceite

Nunca confundir validação de conteúdo com autorização de universo. Nenhuma origem
global será religada neste passo. Nunca confiar em ponteiro/cursor fornecido pelo
cliente. Nenhum método interno entra na lista pública. A verificação precisa rodar
antes das escritas na transação consumidora. IDs, contratos de documentos nativos,
personas, mídia, limpeza de materialização, ativação, UI e roundtrip permanecem
obrigatórios nos próximos incrementos de P1. Testes de unidades devem provar
ausência de efeitos persistidos. `npm run validate` fica no fechamento de P1,
conforme a orientação do operador; CI permanece ignorada e commits locais.

## Resultado local

Implementado o leitor interno, reuso da autenticação de snapshot, proteção dos
ponteiros e prova transacional. 71 Node dirigidos passaram, incluindo 15 novos.
Seis SDK reais distintos passaram; após correção do pin do recibo inicial, os
dois afetados foram repetidos e passaram com nova regressão nativa. Lint, formato,
check sintático, arquitetura, docs e diff passaram. Nenhum writer de materialização.
Veja a [evidência](../../../entregas/2026-10-22-writer-v2-leitura-autenticada-da-restauracao.md).
P1 continua aberto; próximos passos são remapeamento/inventário e writers nativos,
seguidos de autorização/ativação, host/UI/roundtrip e validate integral.
