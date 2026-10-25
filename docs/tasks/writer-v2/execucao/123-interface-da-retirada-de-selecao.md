# P1 / M38c5y — Interface da retirada de seleção

## Objetivo e requisitos

Oferecer confirmação e retomada visual para o coordenador da ADR 0137,
preservando seleção completa, nomes literais e origens capturadas. Nenhuma
montagem no compêndio antes da visibilidade nativa e composição coordenada.

1. Novo diálogo aceita livro e alvos id/token ou selectionId para retomar.
   Congelar alvos da tentativa; mudanças de perfil preservam, actor/livro
   diferentes invalidam. Abrir/retomar não inicia RPC filha nem retirada.
2. Conferir grava manifesto metadata antes da leitura e lê cada fonte por
   captura C1 autorizada. Conferir emissão token v2 contra o token original,
   sem adotar token divergente. Nomes só em RAM e após leitura autorizada.
   Revalidar origens ao terminar revisão; não incluir fichas já encerradas.
3. Aviso irreversível/publicação, revisão e confirmação separadas. Confirmação
   da seleção dirige apply por unidades; para em erro, incerteza ou dívida.
   advance/verificar nunca inicia retirada. Dívida só salva na ação seguinte.
4. Pedido incerto só habilita revisão de reenvio depois de GET sem resultado;
   reenvio explícito de uma ficha não aplica outras automaticamente.
5. Cancel não espera produtor: invalidar driver visual, usar handle fresco
   original e fechar todos os IDs por unidades, preservando aceites.
   Falha de cancel fica explícita e repetível; fechar continua disponível.
6. Progresso distingue registros locais de confirmação nativa, mostra
   completo/parcial/cancelado e chama callback uma vez por seleção no host,
   somente com IDs retirados conferidos e sem dívida. Sem certificado de GC.
7. Lista de retomadas por conta/livro, metadata até 50 por página, estados
   carregando/vazio/erro/sucesso e rótulos neutros; sem abrir prosa/rodar jobs.
8. Kit/temas, foco de erro/aviso/status, voltar/fechar e teclado/mobile sem
   overflow com nome longo. Sem alerta de draft: não há prosa editável.

## Sequência e arquivos

- RemovalSelectionReview: revisão por reader C1 v2, sem persistir nomes.
- RemovalSelectionService: compor leitor Auth e expor revisão autorizada.
- BookLoreRemovalSelectionDialog e Recoveries: componentes exportados.
- Estilos modulares existentes, acrescidos somente se necessário.
- Testes da revisão e UI/recuperações; regressões afetadas.
- Chromium real com React/serviços/IDB e temas/mobile/foco.
- ADR 0138, AGENTS, arquitetura/testes/execução/81 e evidência.
- Checks dirigidos, revisão e commit local. Validate no fechamento de P1.

## Suposições e aceite

O futuro host captura novas seleções por v2, apresenta alvos e conserva a
seleção original enquanto o diálogo estiver aberto. Callbacks encerram apenas
IDs com retirada comprovada; conflitos continuam selecionados. Não recapturar
fonte após falha nem promover pedidos v1.

Aceite: revisão antes de confirmação, mais de 50 alvos, nomes literais,
ausência de start ao abrir/verificar, erro/dívida/uncerteza, actor/perfil/
livro, callback único, cancel com produtor retido e retomada após reinício.
Três temas, 390px e foco conferidos no navegador. Cópias anteriores intactas.

Revisão usa captura completa por ficha e pode falhar por limites reais do
dispositivo; preservar operação e não usar nome de stub. Não acrescentar teto
artificial de autoria. Lista local não comprova disponibilidade/resultado.
Visibilidade nativa, compêndio, lifecycle/consumidores/backup/rollout/validate
de P1 e demais fases/gates da V2 abertos. Sem backend/Rules/deps/env/remoto.

## Resultado local

Revisão C1 v2, sessão Auth e diálogo/lista exportados implementados.
65 Vitest positivos (34 novos), quatro jornadas Chromium mais retake de
teclado, três temas/mobile/foco e lint/tipos/build/smoke/styleguide positivos.

[ADR 0138](../../../decisions/0138-book-lore-removal-selection-ui.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-interface-da-retirada-de-selecao.md).
Visibilidade nativa em lote e composição do compêndio continuam pendentes,
assim como demais lifecycle/consumidores/backup/rollout/validate de P1 e
fases/gates da V2. Somente commit local, sem CI/envio remoto/deploy.
