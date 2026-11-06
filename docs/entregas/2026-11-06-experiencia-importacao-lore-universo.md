# Experiência de importação de lore para universos

Data: 2026-11-06. Estado: implementação local com verificações direcionadas.

## Resultado

O diálogo de importação mantém o fluxo e os contratos existentes, com uma
hierarquia voltada à tarefa: Arquivos → Análise → Revisão. A direção do Impeccable
é Operate, preservando componentes compartilhados e tokens dos temas do Writer.

- Seleção por botão em português, teclado ou arrastar e soltar. Seleções
  sucessivas continuam somando arquivos, com nome, tamanho legível, total e
  remoção individual. Lotes inválidos preservam a seleção anterior.
- Recuperação de sessão com carregamento explícito e seleção bloqueada até
  terminar. Retomada de envio incompleto orienta usar os mesmos arquivos.
- Preparação local identificada e progresso pelos trechos efetivamente
  concluídos no servidor. A análise pausada continua por clique explícito.
- Revisão com título, categoria e resumo por ficha; seleção secundária com
  `aria-pressed`, fonte e evidência, campos expansíveis e comparação preservados.
- Rodapé permanece acessível durante a rolagem, com custo do lote e quantidade
  selecionada na revisão. Ações de produção ficam bloqueadas enquanto a
  confirmação de descarte está aberta.
- Estados de erro, revisão vazia, campos inválidos e importação descartada
  recebem orientação. Permanecem o aviso de perda das edições locais ao fechar
  e o congelamento da revisão exata após confirmação incerta.

O escopo desta entrega está em `LoreImportDialog.tsx`, seu CSS, testes do diálogo,
cenários visuais e `docs/universe-lore-import.md`. Alterações anteriores nesses
arquivos e em outros caminhos foram preservadas. Não foram alterados serviços,
Functions, Rules, protocolo v2, preparação local ou cobrança nesta entrega.

## Verificações

- `npx vitest run src/features/universes/tests/LoreImportDialog.test.tsx src/features/universes/tests/loreImportService.test.ts --maxWorkers=2`:
  16 testes passaram em dois arquivos. Cobrem seleção acumulada, remoção, drop,
  formatos/tamanho inválidos, recuperação pendente/falha, progresso real,
  revisão vazia, diff, confirmação incerta e descarte explícito.
- `npx playwright test --config playwright.visual.config.ts e2e/visual/universe-lore-import.visual.ts`:
  nove jornadas passaram em Claro, Escuro e Sépia. Incluem seletor nativo aberto
  por Enter, drop válido/inválido, lista longa, janela 1024 × 768, preparação real
  de PDF no navegador e revisão/confirmação com backend fictício isolado.
- `npm run typecheck`, ESLint dos três arquivos TypeScript afetados,
  `npm run check:styleguide`, `npm run check:architecture`,
  `npm run check:docs` e Prettier dos arquivos desta entrega: passaram.
- Detector de layout do Impeccable: sem achados. Capturas de seleção, laptop e
  revisão foram inspecionadas visualmente nos três temas. Uma avaliação isolada
  de layout também conferiu ordem, agrupamento, densidade e extremos.

As primeiras tentativas de Vitest e TypeScript no sandbox encontraram `EPERM`
ao iniciar processos nativos/gravar cache. Os comandos passaram fora do sandbox,
sem mudanças de dependências ou configuração para contornar o ambiente.

## Limites

Não foi executado `npm run validate`: não há commit ou merge nesta entrega,
conforme a instrução que reserva esse comando a esses momentos ou solicitação
explícita. Os checks acima não equivalem ao gate completo.

Os testes de navegador usam autenticação e backend fictícios, com rede externa
bloqueada. Não comprovam operação com conta real, chamada paga de IA ou desempenho
do provedor. Não houve commit, push, acompanhamento de CI ou deploy.

## Verificação manual

Em Universos, abra **Importar universo**; dentro de um universo, use **Importar
lore**. Escolha documentos por teclado ou arraste PDF com texto/TXT/Markdown.
Confira arquivos, total, remoção e erros antes de analisar. Na revisão, escolha
as fichas e os destinos, abra campos e confira o diff antes da confirmação.
Verifique o rodapé em janela de laptop e nos três temas. Fechar antes de analisar
perde a seleção local; fechar uma revisão não confirmada perde suas edições locais.
