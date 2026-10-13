# Writer V2 — Jornadas e inventário da fase 1

- **Data:** 2026-10-13.
- **Branch:** `codex/writer-v2`, worktree isolada, base `a2df540`.
- **Plano:** [W2-F1-01](../tasks/writer-v2/fase-01-direcao-e-fundamentos/01-jornadas-e-escopo.md).

## Objetivo e resultado

Definir o caminho verificável do autor, criador de aventura, mestre, jogador,
comprador e operador, mantendo as duas jornadas e comércio na primeira versão pública.
Entrega documental; nenhuma funcionalidade nova do aplicativo foi implementada.

## Critérios documentais

- [x] Jornadas têm atores, entradas, resultados, falhas e tarefas responsáveis.
- [x] EV-01 a EV-08 têm demonstrações previstas e cobertura.
- [x] Escolhas comerciais recebidas estão separadas de responsabilidades pendentes.
- [x] Inventário técnico foi conferido contra a base atual.
- [x] Gate completo local passou e revisão independente não encontrou bloqueadores.
- [ ] Corpus real autorizado e CI no PR conferidos; não há aceite integral declarado.

## Arquivos alterados

| Área                                                            | Mudança                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Execução](../tasks/writer-v2/execucao/README.md)               | Registro de estados, escolhas e continuidade                                                        |
| [Jornadas](../tasks/writer-v2/execucao/01-jornadas-e-escopo.md) | Inventário, cenários, fluxos/falhas e cobertura                                                     |
| Índices V2, matriz, escopo e W2-F1-01                           | Estado de execução e referências                                                                    |
| [Decisões](../tasks/writer-v2/decisoes-e-riscos.md)             | Brasil/BRL, Stripe, vendedor/comissão/atendimento, edição adquirida e pesquisa oficial preparatória |
| Este registro                                                   | Evidência local do incremento                                                                       |

## Testes e validações

Nenhum teste de comportamento foi adicionado: código, regras e dependências não mudaram.
Dependências próprias instaladas com npm ci na raiz e nas functions; sem junction de node_modules.
Ambiente: Windows, Node 24.21.0, npm 10.6.0. Engine functions declara Node 22;
o aviso de versão foi registrado na instalação.

| Verificação           | Resultado observado                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------- |
| npm run validate      | Código 0, todos os gates passaram                                                            |
| Frontend/cobertura    | 106 arquivos, 756 testes; statements 92.62%, branches 86.01%, functions 91.11%, lines 94.71% |
| Scripts               | 69 passaram, zero falhas                                                                     |
| Backend/syntax        | 73 passaram, zero falhas; syntax check passou                                                |
| Typecheck/build/smoke | Passaram                                                                                     |
| Revisão independente  | Sem bloqueadores; 48 links locais existentes; estado da matriz corrigido                     |
| git diff --check      | Passou                                                                                       |

```text
 Test Files  106 passed (106)
      Tests  756 passed (756)
Statements   : 92.62% ( 6589/7114 )
Branches     : 86.01% ( 5251/6105 )
Functions    : 91.11% ( 1703/1869 )
Lines        : 94.71% ( 6001/6336 )
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ tests 73
ℹ pass 73
ℹ fail 0
Smoke test do bundle OK.
```

Build conserva avisos de chunks acima de 500 kB e importação dinâmica de exportDocx
ineficaz. Não houve redução de cobertura nem bypass de hooks.
Checks de docs/formatação serão repetidos após preencher esta evidência.

## Fora do escopo e pendências

Sem alteração do PRD/AGENTS, migração, deploy, push, cobrança ou acesso à conta Stripe.
Exemplos de conto/aventura são cenários originais para roteiro; corpus real não foi validado.
Participantes humanos serão indicados pelo operador. Connect, políticas financeiras,
retenção e exceções de retirada por direitos/privacidade precisam de fechamento posterior.
CI no PR não foi executado; testes locais não satisfazem esse item da definição de concluído.
Checkout original e alterações paralelas preservados.

## Verificação manual

1. Abrir o registro de execução e seguir a evidência W2-F1-01.
2. Percorrer as jornadas de conto, aventura, compra e atendimento; conferir falhas e responsáveis.
3. Conferir que hipóteses comerciais e evidências futuras continuam identificadas como pendentes.
