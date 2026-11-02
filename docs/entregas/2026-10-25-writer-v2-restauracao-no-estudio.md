# Writer V2 — restauração privada no Estúdio

## Resultado parcial

Estúdio oferece Restaurar backup de livro, revisão local, preparação e revisão
final com confirmação explícita da cópia privada. Lista reúne jobs da conta e
pedidos do dispositivo, com paginação independente, retry, carregando e vazio.

Pausa, recarga e fechamento preservam operações sem resposta. Arquivo permanece
apenas em memória; envio retomado confere identidade original. Mídia/limpeza têm
retomada própria após ativação. Abrir livro consulta acesso normal no servidor,
confere proprietário/exclusão e revalida conta/vida útil antes de navegar.

Cancelamento e descarte do ciphertext local são confirmados separadamente.
Descarte reautoriza contexto terminal e usa CAS integral, sem chave nem alteração
do projeto. Interface pública composta no Estúdio preserva importações anteriores.

[ADR 0162](../decisions/0162-book-restore-studio-workflow.md),
[plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md).

## Testes dirigidos

30 Vitest distintos positivos em seleções: 12 de diálogo/sessão de interface,
seis de lista, quatro de descarte local e oito de composição do Estúdio
(seis novos e duas regressões). Não houve rodada global única de 30.

- Estúdio: 7/7, 6.01 s; ação própria, importação preservada, retomada sem raiz
  listada e abertura somente por consulta atual. Ausência, outro autor e
  exclusão não navegam.
- Diálogo: 11/11, 3.56 s; preparação/revisão explícita, resposta perdida, ausências
  do legado, StrictMode, arquivo divergente, confirmações, intenção pendente,
  fechar/pausar, conta e falha de abertura.
- Tentativa de ativação agora retira a revisão antes de esperar RPC; caso novo
  1/1, 2.05 s, 11 não selecionados, impede nova confirmação após resposta perdida.
- Lista/descarte: 9/9, 2.38 s; fontes parciais, páginas independentes/duplicadas,
  storage indisponível, contexto/CAS, envelope inválido e conta.
- Prova de resposta tardia da lista foi fortalecida para verificar ausência de
  linhas, não um ID oculto por apresentação: 1/1, 2.10 s, quatro não selecionados.
  Novo remount por conta: 1/1, 1.92 s, cinco não selecionados.
- Após explicitar guard antes de publicar recuperação local, somente os dois
  fluxos afetados foram repetidos: 2/2, 2.64 s, dez não selecionados.

## Chromium real

Fluxo integrado tem sete verificações positivas e painel um cenário positivo.
React/Dialog reais, OPFS/IndexedDB/Web Locks/WebCrypto nativos, serviços Functions
e HTTP de chave reais contra banco em memória; identidade/SDK callable e callback
de abertura simulados. A consulta normal de abertura está provada na composição,
não contra credenciais de produção.

Arquivo de 15408 bytes percorre inspeção, start com resposta perdida/reinício,
append com resposta perdida/segundo reinício e preparação até revisão. Como
append perdido era o último, retomada usa bytes já recebidos sem pedir arquivo
de novo. Raiz ausente antes do botão explícito de criação.

Ativação perde resposta depois do commit; nova confirmação some. Terceiro
reinício confirma o pedido original após chave revogada e termina mídia/limpeza,
preservando raiz ativa. 1287 RPC e 389 pedidos HTTP de chave locais; nenhuma
medição de custo/latência de produção ou pedido de chave após ativação.

Escape fecha e retorna foco ao gatilho; Tab permanece no diálogo. Seis capturas
revisadas, temas claro/escuro/sépia, larguras 360/1280, sem overflow horizontal;
contraste do botão principal pelo menos 4.5:1. Corpo rola em viewport estreito
com ações finais visíveis. Animações desativadas somente no harness de captura
para conferir cores finais da troca de tema.

Painel real combina pedido inicial em IndexedDB e job remoto autorizado, sem
expor IDs/tokens; cada retomada entrega sua própria identidade. Captura 360 px
revisada após aguardar CSS real. Ajustes do harness corrigiram import CJS de
ReactDOM, espera assíncrona de foco, hipótese incorreta sobre último chunk e
carregamento de estilos; não foram tratados como falhas da aplicação.

Artefatos externos: m51-restore-ui e m51-panel-browser, JSON/PNG/perfis fora do Git.
Não foram usados manuscritos reais ou credenciais de produção nesses cenários.

## Checks, verificação e pendências

Styleguide, lint dirigido, typecheck, arquitetura, docs, formato e diff passaram
no fechamento; resultado global de validate permanece pendente. Revisão conferiu
conta/vida útil após esperas, CAS, confirmação explícita e fronteiras públicas.

Para conferir a UI: Estúdio → Restaurar backup de livro → selecionar backup
atual/JSON legado → Preparar cópia → revisar → Criar cópia privada. Fechar e
retomar pela lista; cópia ativada oferece Abrir livro antes de encerrar limpeza.
Novos endpoints ainda são locais, sem implantação de produção neste incremento.

Roundtrip integral atual/legado com consumidores normais, inventários/writers/
exclusão/rollout/validate de P1 continuam. Modo indexado padrão false, fases 3–5 e
gates humanos/comerciais pendentes. Sem CI, push, PR, merge, deploy ou subagentes.

Prova adicional de composição: troca de conta enquanto getBook aguarda bloqueia
navegação após a resposta; guard não roda antes da resposta. 1/1, 2.74 s,
22 não selecionados. Lint pediu callback sem retorno any e act síncrono;
corrigidos só no teste. Repetição afetada 1/1, 2.76 s, 22 não selecionados,
e lint dirigido verde. Mantém acesso histórico separado do acesso atual.
