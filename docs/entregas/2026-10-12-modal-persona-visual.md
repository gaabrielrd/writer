# Modal de persona visual e informativo

- **Data**: 2026-10-12
- **Branch**: `codex/editor-paridade`
- **Plano de origem**: plano apresentado na conversa para identificar as vozes, mostrar os valores efetivos e organizar a biblioteca sem um bloco extenso de instruções.

## Objetivo

Tornar claras a persona base, a complementar e a origem dos atributos usados
pela IA, com leitura visual no modal contextual do editor.

## Funcionalidades entregues

- Cards de composição com avatar, nome, descrição e função: base do livro e complemento do capítulo.
- Atributos efetivos com ícones, valores, barras, extremos e origem: Livro, Complemento ou Ajuste do capítulo.
- Ajustes junto ao atributo, incluindo zero explícito e recuperação de herança. Sem base, o seletor informa Usar valor da persona.
- Biblioteca do modal em cards, com três indicadores de personalidade e identificação das personas em uso.
- Orientações completas recolhidas em `FormSection`; na biblioteca, primeiro é consultado o perfil gráfico, depois o texto completo.
- Até 960 px acima de 900 px, duas colunas no desktop e uma até 600 px; header e ações preservados durante a rolagem do corpo.
- Abas com ícones, navegação por setas/Home/End e retorno do foco ao botão Persona.

## Critérios de aceite

- [x] Base e complemento identificáveis visualmente, com papéis separados.
- [x] Valores gráficos correspondem às instruções efetivas, preservando herança e atributos próprios.
- [x] Biblioteca visível sem um bloco extenso de prompt acima da listagem.
- [x] Edição, personalização, salvamento, arquivamento, retry e funcionamento em um único modal preservados.
- [x] Três temas, desktop/celular, teclado, valor zero e 320 px verificados.
- [x] Testes, typecheck, lint, arquitetura, styleguide, formatação, build e smoke aprovados.

## Arquivos alterados

| Arquivo                                                         | Mudança                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/features/ai-assistant/components/ChapterPersonaDialog.tsx` | Abas, contexto da biblioteca e foco.                                    |
| `src/features/ai-assistant/components/PersonaBindingDialog.tsx` | Composição, valores reais e ajustes visuais.                            |
| `src/features/ai-assistant/components/PersonaManager.tsx`       | Cards e indicadores da biblioteca contextual.                           |
| `src/features/ai-assistant/components/PersonaComposition.tsx`   | Identificação da base e do complemento.                                 |
| `src/features/ai-assistant/components/PersonaTraits.tsx`        | Barras reutilizáveis, origem e controles.                               |
| `src/features/ai-assistant/components/Personas.module.css`      | Hierarquia, composição e responsividade.                                |
| `src/features/ai-assistant/model/persona.ts`                    | Perfil estruturado compartilhado com a composição do prompt.            |
| `src/features/ai-assistant/tests/personaProfile.test.ts`        | Concordância dos valores, atributos próprios e configurações inválidas. |
| `src/features/ai-assistant/tests/PersonaBindingDialog.test.tsx` | Origem, zero, herança e salvamento.                                     |
| `src/features/ai-assistant/tests/ChapterPersonaDialog.test.tsx` | Consulta gráfica antes do texto e fluxo integrado.                      |
| `src/features/editor/tests/chatEditorBridge.test.tsx`           | Desmonta a ponte React antes de destruir a view do Tiptap.              |
| `e2e/visual/personas.visual.ts`                                 | Composição visual, catálogo, persistência, teclado e 320 px.            |
| `docs/ai-personas.md`, `docs/styleguide.md`, `docs/testing.md`  | Comportamento e validação.                                              |

## Testes

- Perfil visual comparado ao prompt real: atributos da base/complemento, ajuste explícito zero e referências inválidas.
- Vínculos: barra herdada de Tensão em 40, ajuste local, zero, restauração sem base, falha e retry.
- Modal contextual: biblioteca, detalhes, edição e consulta progressiva das orientações.
- Captura real do editor: fixture desmontada antes da destruição da view, preservando as verificações de seleção, persona, conteúdo e transações.
- Chromium: modelos, sliders próprios, edição, arquivamento, composição enviada ao chat/autocomplete, texto preservado até aceite, foco e temas.

Saídas reais:

```text
Suíte visual completa:
24 passed (3.0m)

Confirmação final do cenário de composição nos seis projetos:
6 passed (51.3s)

Captura do editor e configuração de personas após corrigir a fixture:
Test Files  4 passed (4)
     Tests  10 passed (10)

Confirmação final dos seis arquivos de testes diretamente afetados:
Test Files  6 passed (6)
     Tests  21 passed (21)
```

As capturas finais de desktop escuro/sépia e 320 px foram inspecionadas. A
confirmação dirigida cobriu a largura final, as barras antes dos controles,
origem dos valores, consulta recolhida e retorno de foco. A cópia para personas
sem descrição distingue uma voz configurada da ausência de persona.

## Validações executadas

| Comando                                 | Resultado                                      |
| --------------------------------------- | ---------------------------------------------- |
| `npm run validate`                      | Verde, código de saída 0.                      |
| `npm run typecheck`                     | Verde na conferência dirigida e no gate final. |
| ESLint e Prettier dos arquivos afetados | Aprovados.                                     |
| `git diff --check`                      | Sem erros.                                     |

Saída real do gate final:

```text
Test Files  110 passed (110)
     Tests  771 passed (771)
Statements   : 92.62% ( 6672/7203 )
Branches     : 86.13% ( 5368/6232 )
Functions    : 91.21% ( 1724/1890 )
Lines        : 94.71% ( 6079/6418 )
Setup: tests 69, pass 69, fail 0
Functions: tests 73, pass 73, fail 0
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

O teste integrado que percorre as abas, vínculo, biblioteca, detalhes e edição
tem limite local de 10 segundos; as assertivas foram preservadas. A falha do
Tiptap reproduzida isoladamente foi corrigida somente na limpeza da fixture,
sem alterar o código de produção do editor.

## Fora do escopo

Novas personas padrão, alteração dos prompts, regras de herança, armazenamento,
créditos, provedor, publicação e código de produção do editor.

## Limitações e pendências conhecidas

Validação usa dados e serviços fictícios, sem chamadas ou débitos de produção.
Não mede adesão literária do modelo. Sem push, deploy ou PR; CI remoto não foi
executado. O build conserva os avisos de chunks grandes e importação dinâmica/
estática de DOCX. A documentação de planejamento paralela foi preservada.

## Como verificar manualmente

1. No editor, abra Persona e selecione a base na aba Livro.
2. No Capítulo, escolha um complemento e confira os cards de composição e as origens dos atributos.
3. Defina um atributo no capítulo, altere para zero e confira o valor efetivo antes de salvar.
4. Abra Biblioteca, compare os indicadores e consulte as orientações opcionais.
5. Alterne temas e reduza a 320 px; confira rolagem, ações fixas e retorno de foco ao fechar.
