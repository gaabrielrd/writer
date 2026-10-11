# Dropdown compartilhado

`Dropdown`, exportado por `@/shared/ui`, reúne seleção de valor e menus de ações.
Os dois modos usam a mesma superfície, itens, tokens de tema e posicionamento em
portal. Não há dependência nova. A demonstração está em `/styleguide`, inclusive
busca e ações dentro do modal do catálogo.

## Seleção

```tsx
<Dropdown
  mode="select"
  label="Categoria"
  value={category}
  onValueChange={setCategory}
  searchable
  options={[
    { value: '', label: 'Sem categoria' },
    {
      value: 'character',
      label: 'Personagem',
      icon: <User className="icon icon-sm" aria-hidden="true" />,
    },
    { value: 'location', label: 'Local' },
  ]}
/>
```

`value` torna o controle gerenciado pelo chamador. Sem ele, `defaultValue` define
o início; na ausência de ambos, a primeira opção habilitada é selecionada.
Valores numéricos e vazios são aceitos; `onValueChange` sempre recebe uma string.
`placeholder` aparece quando o valor não corresponde a uma opção. `name` inclui
o valor nos dados do formulário por um campo oculto; `disabled` o retira.
`label`, `id`, `aria-label`, `hint` e `error` fornecem identificação e feedback
acessíveis. O gatilho é um botão com papel `combobox` e nunca submete o formulário.

## Ações

```tsx
<Dropdown
  mode="action"
  label="Opções do livro"
  iconOnly
  icon={<MoreHorizontal className="icon" aria-hidden="true" />}
  variant="ghost"
  options={[
    { value: 'edit', label: 'Editar', onSelect: openEditor },
    { value: 'delete', label: 'Excluir', variant: 'destructive', onSelect: confirmDelete },
  ]}
/>
```

O modo padrão é `action`. Ele não aceita valor de seleção. `iconOnly` exibe apenas
o ícone, preservando `label` como nome acessível; sem essa propriedade, aparecem
ícone, label e seta. Cada opção pode executar `onSelect`; `onAction` recebe a chave
da ação escolhida. Escolher uma ação fecha o menu sem substituir o label do botão.
O callback executa após o fechamento e a restauração de foco, para que diálogos
abertos por uma ação devolvam o foco ao gatilho persistente ao fechar.
Para links, avatar ou composição de conta, use `trigger`, `DropdownItem asChild`
e `DropdownLabel`. O filho de `asChild` deve ser um único elemento e conter seus
próprios ícones. As confirmações e permissões permanecem nas telas que usam o menu.

## Busca, visual e teclado

- `searchable` filtra as opções de `options` por `label` e `searchText`, ignorando
  caixa e acentos; aceita espaços. Não filtra filhos compostos de `DropdownItem`.
- `searchPlaceholder` e `emptyMessage` personalizam os textos. A busca é limpa
  ao fechar/reabrir, sem modificar o valor selecionado.
- `className`, `variant` e `size` personalizam o botão; `contentClassName`,
  `itemClassName` e `align` personalizam o menu. Use tokens semânticos em CSS.
- `icon` aceita ícones Lucide no botão e em cada opção. `disabled` também existe
  por item; itens desabilitados são ignorados pelo teclado e não executam ações.
- Enter/Espaço/seta abrem o menu. Na busca, as setas levam aos resultados.
  Setas navegam, Enter/Espaço escolhem, Escape fecha e devolve o foco ao gatilho.
  Tab fecha o menu; clique fora também fecha. Escape no dropdown dentro de um
  diálogo preserva o diálogo pai.
- A superfície acompanha claro, escuro e sépia, limita a largura ao viewport e
  rola quando a lista ultrapassa a altura disponível.

Os selects das telas usam `Dropdown mode="select"`. `Select` permanece apenas
como nome compatível para esse modo, com a API `onValueChange`; não renderiza um
select nativo. Os testes abrem o controle e escolhem pelo label visível.

## Verificação

Os contratos ficam em `src/shared/ui/tests/Dropdown.test.tsx` e a verificação
real de temas, dimensões e portal em `e2e/visual/dropdown.visual.ts`.

```bash
npm run validate
npx playwright test --config playwright.visual.config.ts
npm run test:e2e
```
