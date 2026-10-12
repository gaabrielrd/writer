# Paridade do espaço de escrita — execução incremental

- **Data**: 2026-10-12
- **Branch atual**: `codex/editor-paridade-workspace`
- **Plano de origem**: [fase em 12 tarefas](../tasks/paridade-editor-gerador-temas.md)

## Objetivo

Trazer o editor/chat do Writer aos padrões de espaço ajustável, tela cheia,
raciocínio e organização visual observados no Gerador de Temas, conservando os
temas, manuscrito e contratos privados de IA.

## Incremento de 2026-10-12 — tarefas 1 a 3

### Funcionalidades e aceite

- [x] Contrato aprovado registrado com requisitos, tarefas e riscos.
- [x] Preferência de largura privada por usuário/navegador, com formato versionado,
      migração, isolamento e defaults seguros; sem apagar dados inválidos.
- [x] Divisor neutro em `shared/ui`, com drag, setas, Shift, Home/End, limites e
      restauração; preserva foco/seleção/texto e salva apenas ao terminar o gesto.
- [x] Demonstração funcionando no styleguide nos três temas.

### Arquivos e testes

`editor/model/workspacePreferences.ts`, `editor/services/workspacePreferencesStorage.ts`
e `workspacePreferences.test.ts` cobrem persistência, migração, falhas e isolamento.
`shared/ui/ResizeHandle.tsx`, seu CSS/testes e exportação pública cobrem interação
acessível; `StyleguidePage.tsx` demonstra o controle. `editor-workspace.visual.ts`
valida o comportamento no navegador. O styleguide documenta o novo componente.

### Resultados observados

```text
Tarefa 1: npm run validate verde — 743 testes da aplicação
Tarefa 2: npm run validate verde — 756 testes da aplicação; 13 testes dirigidos
Tarefa 3: npm run validate verde — 764 testes da aplicação; 8 testes dirigidos
Test Files 108 passed (108)
Tests 764 passed (764)
All files: statements 92.62%, branches 86.04%, functions 91.13%, lines 94.71%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Navegador: 6 passed (19.2s)
```

O lint tinha dois falsos positivos para o separator focável. A exceção é local
ao widget e documenta o padrão WAI-ARIA; sem enfraquecer regras globais. A seleção
do teste de drag passou a limpar o cursor anterior antes de criar a seleção real.
Capturas do navegador foram inspecionadas. Logs por tarefa ficam no diretório
de artefatos `paridade-editor` desta conversa, fora do repositório.

### Pendências da fase

As tarefas 4–12 continuam em execução. O divisor ainda não foi integrado aos
painéis neste incremento; tela cheia e raciocínio ainda não foram implementados.
Sem push ou deploy deste incremento. O arquivo paralelo de entrega permanece
fora das alterações e conserva o hash previamente registrado.

## Verificação manual deste incremento

1. Abra `/styleguide` e localize “Painéis redimensionáveis”.
2. Arraste o divisor ou use setas, Shift e Home/End; dê duplo clique para restaurar.
3. Troque entre claro, escuro e sépia; confira foco e ausência de transbordamento.

## Incremento de 2026-10-12 — tarefa 4

Assistente e Compêndio agora compartilham um único espaço redimensionável,
com largura persistida, mínimos de painel/manuscrito e apresentação empilhada
quando necessário. Fechar/alternar conserva árvores de edição e rascunho;
falhas de persistência conservam a largura da sessão e permitem retentativa.
ResizeObserver acompanha mudanças do espaço, com fallback para resize da janela.
O limite de arredondamento foi corrigido para não inverter mínimo/máximo.

Onze testes dirigidos passaram; os testes existentes de EditorPage e aceite
continuaram passando. O navegador comprovou drag real, seleção preservada,
mesma largura/altura dos painéis, retomada de largura/rascunho e 320 px.

```text
Test Files 109 passed (109)
Tests 775 passed (775)
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Navegador: 24 passed (2.5m)
```

O gate geral no checkout compartilhado encontrou uma falha de lint em um arquivo
da criação de livros alterado em paralelo. A fase foi transferida para a worktree
isolada `C:/Users/gaabr/.codex/worktrees/editor-paridade/writer`; apenas seus próprios
arquivos foram transferidos/conferidos por hash e retirados do checkout compartilhado.
Todas as alterações paralelas de livros e documentação foram preservadas.
Os mesmos cenários de navegador passaram na worktree, sem mudança nos testes de drag.
Após estabilizar a correção do limite, o gate completo foi repetido e passou.

Neste ponto restam as tarefas 5–12. Nenhum push ou deploy deste incremento.

## Incremento de 2026-10-12 — tarefa 5

Tela cheia agora ocupa o viewport do aplicativo e remove os limites de 1440 px
do shell e 860 px do manuscrito. Mantém créditos, tema, conta, status, ferramentas,
minimapa e painéis. A instância de edição permanece estável; a alternância conserva
seleção, undo, rascunho do chat e o trecho visível. O modo acompanha a navegação
entre capítulos e é encerrado ao sair da rota de edição.

Escape fecha primeiro menus/diálogos/barra de seleção/sugestões e, depois, o modo.
O handler DOM permite que Escape ocioso atravesse a captura interna do ProseMirror;
o estado atual chega por referência para conservar a instância do editor.
O minimapa permanente não é tratado como lista sobreposta. O Escape da barra de
seleção registra que foi consumido mesmo quando a barra é removida durante o evento.

```text
Test Files 110 passed (110)
Tests 784 passed (784)
All files: statements 92.67%, branches 86.07%, functions 91.12%, lines 94.76%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Testes dirigidos: 26 passed
Navegador: 12 passed (52.1s)
```

O navegador comprovou largura superior a 2100 px em monitor de 2160 px, ausência
do limite do texto, seleção/undo/rascunho preservados, trecho visível na mesma
posição, Escape em diálogo e barra de seleção, 320 px/altura de 480 px e restauração
da rota. Captura de tela cheia foi inspecionada e preservada nos artefatos desta
conversa. O teste de trecho visível mede elementos existentes sem alterar seus
atributos: mutar o DOM controlado pelo ProseMirror causava normalização do parágrafo.
As duas asserções de tipo redundantes apontadas pelo lint foram removidas.

Neste ponto restam as tarefas 6–12. Nenhum push ou deploy deste incremento.

## Incremento de 2026-10-12 — tarefa 6

A barra do manuscrito agora tem grupos nomeados de formatação, histórico de
edição e painéis, com botões compartilhados e estado ativo por tokens semânticos.
Navegação entre capítulos usa Button e grupo próprio no cabeçalho compacto.
Persona e exportação ficam no menu **Opções do capítulo**, com ícones Lucide,
acesso por teclado e abertura de diálogo após o fechamento/restauração de foco.
Os recursos existentes e a exportação do texto atual continuam disponíveis.

```text
Test Files 111 passed (111)
Tests 787 passed (787)
All files: statements 92.67%, branches 86.07%, functions 91.14%, lines 94.76%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Testes dirigidos: 29 passed
Navegador: 42 passed (2.6m)
```

Os cenários de navegador cobriram os grupos, formatação real, menu por teclado,
retorno de foco, Markdown com a versão atual, gestão de personas/base/complementar,
autocomplete contextual, tela cheia e 320 px nos três temas. Uma corrida no teste
de undo após fechar Persona foi corrigida aguardando o foco no gatilho persistente;
o produto já restaura esse foco em requestAnimationFrame. O lint foi repetido
nos testes ajustados, e a matriz visual completa foi repetida e passou.
Captura das ferramentas em 320 px foi inspecionada e preservada nos artefatos.
Contratos do chat, personas e styleguide foram atualizados e check:docs passou.

Neste ponto restam as tarefas 7–12. Nenhum push ou deploy deste incremento.

## Incremento de 2026-10-12 — tarefa 7

Assistente e Compêndio usam `SidePanelHeader`, com títulos nível 2, grupos de
ações nomeados e controles de 36 px/44 px em toque. Há demonstração no styleguide.
O histórico usa menu de ícone; filtros do Compêndio usam Button e o estado vazio
usa EmptyState. Cabeçalho/controles não encolhem, os corpos rolam de forma independente
e o composer limita sua altura para conservar leitura em viewport baixo.
O estado vazio do chat reduz decoração até 650 px de altura para manter título
visível. A barra de escrita usa menos padding até 420 px.

```text
Test Files 112 passed (112)
Tests 789 passed (789)
All files: statements 92.66%, branches 86.07%, functions 91.09%, lines 94.75%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Testes dirigidos: 42 passed
Matriz de workspace/chat: 48 passed (2.5m)
Refinamento final de estado vazio: 6 passed (21.9s)
```

A regressão de drag levou à confirmação da posição também no pointerup, com
teste de último movimento ausente. Os testes de navegador aguardam a porcentagem
final/encerramento de drag antes de comparar larguras; medir um frame intermediário
produzia diferenças transitórias. A matriz de 48 cenários passou após esse ajuste.
A inspeção de imagem revelou decoração escondendo o título vazio em altura baixa;
os seis cenários foram repetidos após compactá-lo, com título, cabeçalho e envio
comprovadamente dentro do viewport. O gate completo foi repetido no estado final.
Filtros, rascunho, foco, seleção, minimapa, comandos, histórico e aceite continuaram
passando. Captura final em 440 px de altura foi inspecionada e preservada nos artefatos.

Neste ponto restam as tarefas 8–12. Nenhum push ou deploy deste incremento.

## Incremento de 2026-10-12 — tarefa 8

Enviar/parar fica dentro do campo, com padding reservado para o texto. Origem,
prévia expansível e modelo ficam abaixo; detalhes de contexto/comandos usam
região nomeada no composer, com rolagem e altura legível. Escape recolhe detalhes
antes de fechar o chat e restaura foco. A configuração do modelo abre Provedor
diretamente, conserva a origem e retoma o rascunho ao retornar. Nomes BYOK vêm
da configuração atual; chaves não aparecem na interface. Enter, Shift+Enter,
composição IME, catálogo de comandos, streaming e cancelamento são preservados.

```text
Test Files 113 passed (113)
Tests 795 passed (795)
All files: statements 92.73%, branches 86.15%, functions 91.16%, lines 94.81%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Testes dirigidos: 27 passed
Matriz final de workspace/chat: 54 passed (2.9m)
```

A revisão da imagem em 320 px revelou que o conteúdo expandido encolhia;
o CSS agora preserva a altura dos detalhes e dos controles, e o teste exige
altura legível e título dentro do viewport após rolar. A matriz foi repetida.
O teste de drag do styleguide também aguarda estabilização do layout e confirma
captura do ponteiro antes de medir o resultado. O gate completo foi repetido
após as correções, sem reduzir limites de cobertura. Captura final inspecionada
e preservada nos artefatos; contratos/styleguide/testes documentados.

Neste ponto restam as tarefas 9–12. Nenhum push ou deploy deste incremento.

## Incremento de 2026-10-12 — tarefa 9

O controle de raciocínio usa a matriz pura compartilhada entre navegador e
servidor, com enumeração validada, níveis incompatíveis desabilitados e Auto
seguro para modelos desconhecidos. Preferências ficam na conversa privada e
o padrão de novas conversas é versionado por usuário/navegador. Conversas antigas
sem campo usam Auto; falhas locais não desfazem a escolha salva no servidor.
Autoria, busy e ausência de débito/cota na mudança de preferência são testados.
O load informa o modelo configurado da plataforma. Modelo/raciocínio usam uma
linha compacta mesmo em 320 px, com nome truncável e tooltip.

```text
Test Files 114 passed (114)
Tests 808 passed (808)
All files: statements 92.72%, branches 86.11%, functions 91.20%, lines 94.84%
scripts: pass 69; fail 0
functions: pass 78; fail 0
Smoke test do bundle OK.
Testes dirigidos iniciais: 34 passed
Backend dirigido: 15 passed
Matriz final de workspace/chat: 60 passed (3.6m)
```

A matriz foi verificada em documentação primária e registrada na ADR 0023,
incluindo a diferença entre o alias Gemini 3.7 configurado e a versão física
servida pelo provedor. Auto conserva o padrão do provedor quando não há padrão
documentado; Máximo mantém limites. A inspeção visual levou à organização de
modelo/raciocínio na mesma linha; o teste mede essa geometria. Foram adicionados
três casos de disponibilidade OpenAI depois da primeira rodada dirigida, todos
cobertos pelo gate final. Dois seletores de teste usavam uma opção de Playwright
inexistente na Testing Library; o typecheck apontou o problema, corrigido antes
de repetir todo o gate. A captura final foi inspecionada e preservada.
Arquitetura, styleguide, contratos e testes foram realinhados.

Este incremento entrega contrato e persistência. A ligação real dos parâmetros
aos provedores, histórico e retries é a tarefa 10 e continua necessária antes de
liberar o seletor. Restam as tarefas 10–12. Nenhum push ou deploy deste incremento.
