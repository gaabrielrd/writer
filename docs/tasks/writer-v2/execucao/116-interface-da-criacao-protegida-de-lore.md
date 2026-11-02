# P1 / M38c5r — Interface da criação protegida de lore

## Objetivo

Oferecer host visual de criação/retomada da operação durável, com campos
literais, preparação, revisão e criação explícita. Listar recuperações locais
por conta/livro sem abrir texto nem iniciar produção automaticamente.

## Requisitos e sequência

1. Formulário preserva texto/presença/vazios/duplicados e campos opcionais.
   Nome/categoria permanecem presentes; privacidade começa false. Reusar
   BookLoreLiteralFields com apenas data, sem captura/token fictícios.
2. Preparar congela o input e dirige initialize/advance até revisão. Criar
   depende de clique próprio; apply incerto oferece verificar resultado por
   advance, sem reaplicar automaticamente.
3. Antes de retomar, ler ticket metadata pela sessão Auth e conferir livro/
   writeId; depois usar o executor existente. Rascunho só aparece após leitura
   protegida autorizada. Troca de actor/host fenceia retorno; perfil não apaga draft.
4. Cancel/discard ficam disponíveis durante rede/chave/crypto pendentes, sem
   esperar produtor. Descarte pede confirmação e preserva ficha aplicada.
   Fechar/sair/rotas avisam sobre draft sem cópia e permitem manter recuperação.
   Cancelado com cópia autorizada pode iniciar nova preparação explicitamente.
5. Listagem pagina até 50 por conta, filtra livro e tombstones completos,
   cobre loading/erro/vazio/sucesso e não usa chave. Não misturar edições/criações.
6. Testes direcionados, prova Chromium com componentes/serviço reais,
   teclado/foco/mobile/três temas, tipos/build/styleguide/revisão e evidência.

## Arquivos previstos

BookLoreCreationEditor/CreationRecoveries e testes; ajuste de tipo do campo
literal (apenas data), leitura creationTicket no EditService/sessão e exports.
Reusar CSS existente de manualEditor. Docs/AGENTS/ADR 0131/entrega/execução.

## Aceite e fronteira

Clique preparar não cria cabeça; clique criar confirma evento próprio e notifica
uma vez por tentativa. Reabrir/verify/cancel não reenviam apply. Erro mantém draft/
operação; contexto incorreto não lê/cancela outro livro. Foco vai para erro/
confirmação e retorna ao acionador; fechamento protege texto ainda não confirmado.

Host é exportado e validado, sem ativar entrada no compêndio. Exclusão nativa
do cliente precede a composição final com edições/criações e recuperação.
Lifecycle, demais writers/consumidores/backup/rollout e validate de P1 continuam
pendentes. P1/F2-09/V2/fases 3–5/gates humanos/comerciais abertos.
Sem backend/Rules/dependências/env/remoto. Testes dirigidos; validate no fim de P1.

## Resultado local

Host e lista exportados, sem ativar entrada legada. 77 Vitest distintos positivos
em rodadas (21 novos); integração 76/76 em quatro arquivos e retake final de três
afetados passou. Três jornadas Chromium reais de UI/executor
com reinício e espera de chave passaram. Capturas de três temas/mobile
inspecionadas; tipos/build/smoke/lint/styleguide/arquitetura positivos.
Revisão corrigiu retorno de foco, aviso indevido após apply e status de
cancelamento ainda pendente. Formato/docs/diff conferidos no fechamento.

Ver [ADR 0131](../../../decisions/0131-protected-lore-creation-ui.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-criacao-protegida-de-lore.md).
Próximo: exclusão nativa do cliente e integração coordenada no compêndio;
demais portões e validate de P1 continuam abertos.
