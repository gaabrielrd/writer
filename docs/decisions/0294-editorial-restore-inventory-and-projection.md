# ADR 0294 — inventário nativo e projeção da restauração editorial

- Estado: implementação local de infraestrutura; testes preparados, sem execução.
- Data: 2026-11-04.

## Contexto

Restaurar o processo exige estados editáveis e histórico privado. A geração de
recursos novos não pode anteceder seu inventário de cancelamento. Corpo dividido
em partes não pode perder seus headers por ordem arbitrária dos journals. Os
novos vínculos também precisam concordar com os IDs dos recursos restaurados,
sem confundir história com autorização atual.

## Decisão

Reservar inventário v15 para registros, corpos, partes e controle editoriais,
sob endereços fechados. A migração de v14 exige base auditada e namespaces vazios.
Bloquear a escrita editorial depois do cancelamento. Após revogar personas,
limpar partes nativas primeiro; exigir ausência física antes de headers e conferir
vazio em unidade própria. Reutilizar journals/recibos e contadores existentes.
Preservar a sequência de cleanup de fonte/chave e reservas permanentes.

Compor o remapeador editorial puro no projetor nativo, usando a mesma identidade
de recursos para referências. Vincular os novos IDs editoriais ao job pelo hash
privado do host, mantendo fechado o input do módulo portátil e sem serializar
tokens. Manter referências sem autorização indisponíveis. Transportar a política
histórica privada e a prova verify(tx) do leitor; mapeamento não é grant de escrita.

## Consequências

Layouts 1–14 mantêm seu comportamento. V15 ainda não ativa livro e v2 permanece
recusado. Materialização, estados editáveis, limites após expansão, certificação,
ativação, revisão, reexportação e exclusão continuam pendentes. Os helpers não
substituem a jornada real v2. São 22 casos preparados, nenhum executado. Ver o
[incremento 46](../tasks/producao-literaria/46-inventario-e-projecao-da-restauracao-editorial.md).
