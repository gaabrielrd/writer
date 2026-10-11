# ADR 0020: Dropdown compartilhado para seleção e ações

- **Data:** 2026-10-11
- **Status:** Aceito

## Contexto

Campos nativos de seleção e menus de ação apresentavam superfícies e capacidades
diferentes. A interface precisa oferecer ícones, filtro textual e customização
consistente, preservando callbacks, permissões e confirmações das telas.

## Decisão

Ampliar o componente local `Dropdown` em `src/shared/ui` com modos discriminados
`select` e `action`. Reutilizar o Radix Dropdown Menu já instalado para portal,
posicionamento, navegação e fechamento; usar a mesma superfície e tokens nos dois
modos. O modo de seleção usa semântica de combobox/listbox e callback de valor;
o modo de ações usa menu/menuitem, sem valor persistido. A busca é opcional e
filtra uma lista explícita de opções, mantendo o campo fora da lista semântica.

Migrar as telas para `Dropdown mode="select"` e preservar a composição de links
e conta com `DropdownItem` e `DropdownLabel`. Manter `Select` como alias do modo
de seleção para compatibilidade de import, usando a nova API `onValueChange`.

## Consequências

Aparência, busca, ícones e acessibilidade passam a ter uma base única. Não há
nova dependência nem alteração de serviços ou regras de domínio. Testes que
manipulavam selects nativos passam a abrir o dropdown e escolher o label visível.
A referência visual do styleguide precisa ser revisada por plataforma após a
mudança intencional da aparência dos gatilhos. Formulários que necessitarem de
validação nativa `required` de select deverão tratar obrigatoriedade no fluxo de
formulário; este componente fornece identificação e feedback, não essa validação.

Veja [API e exemplos](../dropdown.md).
