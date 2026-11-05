# ADR 0275 — Anatomia de página na área logada

Data: 2026-11-05. Estado: aceita por decisão do operador.

## Contexto

A revisão de UX de 2026-11-05 mostrou que a barra lateral e a barra contextual
estão consistentes, mas a área de conteúdo não. Livro, aventura, campanha e
universo montam cabeçalhos próprios; há seis implementações de abas, quatro
estilos de filtro e ações destrutivas em destaque no topo das páginas. O kit
`@/shared/ui` não oferecia peças para cabeçalho de objeto, abas, barra de
ferramentas e filtros, e cada feature resolveu o layout com CSS local.

Foram avaliadas três direções para a página do livro: bancada consistente
(cabeçalho, abas e barra de ferramentas), próxima ação (continuar e próximos
passos no topo) e lista com inspetor.

## Decisão

- Adotar a bancada consistente como padrão das páginas de objeto.
- Usar no topo dessas páginas o bloco "Continuar de onde parou" e os próximos
  passos, quando houver dados.
- Reservar lista com inspetor para Compêndio e Personas.
- Criar no kit `ObjectHeader`, `Tabs` (sobre `@radix-ui/react-tabs`, já
  declarado), `Toolbar` e `FilterChips`, e registrar as regras de ações no
  [styleguide](../styleguide.md#anatomia-de-página).
- Manter o assistente da página flutuante e reposicionável, chegando
  minimizado e com layout aberto mais compacto (fase própria).
- Migrar as telas em fases, começando por `/settings/ai` como piloto.

## Consequências

Telas novas nascem alinhadas usando as peças do kit. As telas existentes
continuam com o layout antigo até a migração de cada fase, então a
inconsistência diminui de forma gradual. O visual de cápsula do `Button` não
muda nesta decisão. Verificações automáticas (abas fora de `Tabs`, botão
destrutivo fora de diálogo) ficam para a fase final de proteções.
