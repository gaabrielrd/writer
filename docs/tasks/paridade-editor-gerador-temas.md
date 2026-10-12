# Paridade do espaço de escrita com o Gerador de Temas

Plano aprovado em 2026-10-12. Referência observada no navegador:
[Gerador de Temas](https://gerador-temas.web.app/).

## Objetivo e escopo

Entregar uma fase completa de paridade do editor/chat: painel lateral
redimensionável, tela cheia sem limites de largura, controle real de raciocínio
e organização compacta de ferramentas, menus e painéis. Preservar os três temas,
manuscrito, autosave, minimapa, seleção, histórico privado e cobrança no aceite.
Produção em lote, disciplinas, auditoria educacional e novos provedores ficam
fora do escopo. Nenhuma dependência nova é prevista.

## Contrato

- Assistente e Compêndio ocupam um único espaço lateral. Largura inicial de 40%
  do workspace, faixa de 20–70%, painel mínimo de 280 px e manuscrito mínimo de
  400 px. Quando os mínimos não couberem, usar apresentação empilhada.
- Divisor com drag via Pointer Events e captura do ponteiro; teclado com setas
  em passos de 2 pontos percentuais, Shift em passos de 10, Home/End nos limites
  e duplo clique para restaurar 40%. Informar limites/valor por ARIA. Não alterar
  seleção, conteúdo ou foco do manuscrito durante o drag.
- Preferência de largura por usuário/navegador, validada e versionada. Aplicar a
  mesma proporção em modo normal e tela cheia, respeitando os limites atuais.
- Tela cheia do editor ocupa a viewport do aplicativo e remove os limites do
  shell de 1440 px e do texto de 860 px. Mantém título, ferramentas, salvamento,
  créditos, temas, acesso à conta, minimapa e painéis. Não remonta o editor.
  Escape fecha primeiro menus/diálogos; depois sai do modo. Sair/restaurar a rota
  não deixa o layout global modificado.
- Ferramentas em grupos compactos: formatação, navegação, painéis e opções.
  Persona/exportação e operações secundárias permanecem acessíveis em menus.
  Usar exclusivamente componentes públicos de shared/ui e tokens do Writer.
- Painéis têm cabeçalho consistente, fechar, corpo rolável e estado explícito.
  Histórico e campo de envio conservam sua posição e estado ao alternar.
- Composer reúne Enviar/Parar no campo e, abaixo, contexto/modelo/raciocínio.
  Detalhes de contexto são expansíveis. `/`, IME, Enter/Shift+Enter e teclado
  conservam os contratos existentes.
- Raciocínio: Auto, Nenhum, Baixo, Médio, Alto, Muito alto e Máximo, condicionado
  às capacidades verificadas do modelo. Opções incompatíveis têm explicação.
  Máximo respeita quotas, timeout e limite de tokens da aplicação.
- Auto resolve conforme pedido/comando e capacidades, sem trocar silenciosamente
  o modelo/provedor. Escolhas afetam o próximo envio. Cada mensagem conserva a
  configuração solicitada/efetiva. Retries preservam identidade/configuração;
  regeneração permite uma nova configuração explícita.
- Preferência de raciocínio por conversa, com padrão por usuário/navegador para
  novas conversas. Conversas antigas continuam legíveis com Auto como padrão.
- Plataforma usa callable autenticada; BYOK continua no navegador. Nenhuma chave
  entra no histórico. Conversar não debita; aceite atômico e preço atual permanecem.
- Desktop, celular/320 px, viewport baixa e monitores largos; claro/escuro/sépia,
  teclado, toque, foco, contraste e redução de movimento.

## Tarefas sequenciais

| #   | Tarefa                    | Aceite                                                                  |
| --- | ------------------------- | ----------------------------------------------------------------------- |
| 1   | Contrato visual/funcional | Referência, requisitos, riscos e matriz de validação registrados        |
| 2   | Preferências do workspace | Persistência versionada, isolamento, valores inválidos/falhas cobertos  |
| 3   | Divisor acessível         | Drag, teclado, limites e restauração verificados                        |
| 4   | Integração dos painéis    | Mesma largura, alternância sem perder estado, fallback estreito         |
| 5   | Tela cheia                | Viewport integral, sem dois max-widths, estado/rota restaurados         |
| 6   | Ferramentas do editor     | Grupos/menus compactos, todas as ações existentes disponíveis           |
| 7   | Painéis                   | Cabeçalhos, ações, rolagem e estados consistentes                       |
| 8   | Composer                  | Controles/contexto/comandos sem transbordamento ou perda de foco        |
| 9   | Contrato de raciocínio    | Matriz de capacidades, Auto e preferências por conversa testados        |
| 10  | Geração real              | Callable/BYOK recebem parâmetros, histórico e retries consistentes      |
| 11  | Validação integrada       | Testes e navegador nos três temas, tamanhos e fluxo completo            |
| 12  | Revisão e documentação    | validate verde, diff revisado, contratos/styleguide/entrega atualizados |

Cada incremento considera testes observáveis, passa por `npm run validate` e
revisão do diff antes do próximo. Dependências de functions são instaladas com
`npm ci --prefix functions`. A validação visual usa fixtures e bloqueia rede
externa; nenhuma geração ou alteração de manuscrito real é necessária.

## Riscos e mitigação

Remontagem ou mudança de foco pode perder seleção/undo: alterar apenas o layout,
com testes de seleção e histórico. Resize pode deslocar minimapa/contexto:
recalcular geometria e testar viewport. Modelos não têm os mesmos níveis de
raciocínio: matriz explícita, validação no servidor e parâmetros próprios por
provedor. Raciocínio alto pode aumentar latência: conservar cancelamento,
timeouts, quotas e recuperação. Persistência antiga/indisponível deve produzir
defaults seguros sem apagar histórico. Alterações paralelas ficam fora do staging.

## Evidências por tarefa

Atualizar este registro com os resultados observados durante a execução. Não
marcar um item como entregue com base apenas na intenção ou no código escrito.

- Tarefa 1: contrato registrado e revisado; `npm run validate` verde, 743 testes
  da aplicação, 69 de scripts, 73 de backend, typecheck/build/smoke aprovados.
- Tarefa 2: preferências versionadas e isoladas implementadas; 13 testes dirigidos
  passaram. `npm run validate` verde com 756 testes da aplicação, cobertura
  92,58% de instruções, 85,98% de ramos, 91,08% de funções e 94,67% de linhas;
  scripts/backend/build/smoke aprovados.
- Tarefa 3: divisor acessível disponível no styleguide; oito testes dirigidos e
  seis cenários reais de navegador passaram (19,2 s). `npm run validate` verde
  com 764 testes; cobertura 92,62%/86,04%/91,13%/94,71%; demais gates aprovados.
- Tarefa 4: workspace único integrado aos dois painéis, com limites, persistência,
  estado preservado e fallback empilhado. Onze testes dirigidos e 24 cenários de
  navegador passaram (2,5 min); `npm run validate` verde com 775 testes.
  Execução isolada na worktree `editor-paridade`, branch
  `codex/editor-paridade-workspace`, para preservar o trabalho paralelo.
- Tarefa 5: tela cheia remove os dois limites de largura e conserva instância,
  seleção, undo, rascunho e trecho visível. Escape respeita sobreposições e funciona
  com foco no editor; navegação entre capítulos conserva o modo e saída restaura
  o shell. 26 testes dirigidos e 12 cenários de navegador passaram (52,1 s).
  `npm run validate` verde com 784 testes, 69 de scripts, 73 de backend e build/smoke.
- Tarefa 6: ferramentas divididas em formatação, histórico e painéis; navegação
  nomeada no cabeçalho e Persona/exportação em Opções do capítulo, com foco
  restaurado ao gatilho. 29 testes dirigidos e 42 cenários de navegador passaram
  (2,6 min). `npm run validate` verde com 787 testes e demais gates aprovados.
- Tarefa 7: cabeçalhos comuns, ações compactas, filtros por Button e estado vazio
  compartilhado; corpos roláveis e área de leitura preservada em altura baixa.
  42 testes dirigidos, 48 cenários de workspace/chat (2,5 min) e seis cenários do
  refinamento final de estado vazio (21,9 s) passaram. `npm run validate` verde
  com 789 testes; scripts/backend/build/smoke aprovados.
- Tarefa 8: enviar/parar integrados ao campo, contexto expansível legível,
  controles abaixo e acesso direto à aba Provedor com retorno/rascunho intactos.
  27 testes dirigidos e 54 cenários de navegador passaram (2,9 min).
  `npm run validate` verde com 795 testes; demais gates aprovados.
