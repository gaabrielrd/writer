# ADR 0021: Atos e ordem de leitura por grupos

- **Data:** 2026-10-11
- **Status:** Aceito

## Contexto

Livros tinham uma lista plana de capítulos. Atos precisam organizar o manuscrito
sem mudar IDs, perder conteúdo ou gerar sequências diferentes na leitura e nas
exportações. Livros e publicações existentes devem permanecer compatíveis.

## Decisão

Guardar atos em subcoleção privada do livro e vínculo opcional no capítulo.
Alocar a posição do ato com contador no livro em transação. Ordenar atos pela
posição e capítulos dentro de cada grupo por order, com ID como desempate.
Sem ato vem por último. Numerais romanos derivam da posição de todos os atos,
incluindo os nomeados. A numeração exibida dos capítulos é global e calculada.

Usar transações para seleção em lote, com limite explícito de 200 capítulos,
validando versões antes de escrever. Incrementar o timestamp do livro para
detectar conflitos na preparação da publicação. As contagens de palavras são
atualizadas junto com criação, edição e exclusão em lote.

Adicionar projeções públicas imutáveis de atos com somente name e order e
actId opcional nos capítulos. hasActs é um campo opcional do apontador, preservando
o contrato anterior quando ausente. O leitor nunca consulta atos privados.
O backup com atos usa versão 4, evitando conflito com a evolução paralela de personas.

## Consequências

A sequência por grupos passa a ser reutilizada pela lista e exportadores e pela
projeção pública. Atos vazios não geram páginas públicas nem cabeçalhos de exportação,
mas continuam no backup privado. Numerais não mudam quando atos vazios são omitidos.
A movimentação online pode ser recusada se houver edição concorrente e requer
atualização explícita. Renomear, excluir e reordenar atos ficam fora desta entrega.

Veja [atos e capítulos](../book-acts.md).
