# P1 / M38c4a A1 — Leitura lógica da análise de lore

## Objetivo

Eliminar o uso de stubs como conteúdo na análise assistida, pré-requisito para
integrar sua escrita ao protocolo preparado. Preservar valores/presenças e
recusar compêndio acima do orçamento sem texto parcial, escrita ou cobrança.

## Sequência e aceites

1. Leitor interno autorizado reutiliza C1 para inline/payload v1/v2, inclusive
   criação ativada. Reúne base, campos flat e páginas de relações, preservando
   UTF-8/BOM, ausências/null de remoção, datas e privacidade lógicas.
2. Confere JSON canônico/SHA integral, Merkle/nascimentos/escopo e domínio;
   não normaliza/trunca o original nem usa campos ausentes do stub como vazios.
3. Orçamento explícito agregado de leitura: 300000 bytes JSON, 512 partes e
   512 páginas para esta análise; orçamento final de contexto também 300000
   bytes UTF-8 e até 500 entidades. Esses limites pertencem à análise,
   não à ficha/portabilidade/C1. Recusar antes de baixar corpo acima do saldo.
4. Buscar entidades em páginas pequenas por ID dentro da transação autorizada,
   reusando budgets para toda a coleção local/global. Nada parcial chega à IA.
   Snapshot/revisão fixam nascimentos de livro/universo e nascimento/atualização
   das entidades/representação, além dos clocks e conteúdo lógico.
5. Snapshot da análise usa o leitor. Conferência de versões usa datas lógicas,
   e gerador recebe texto real. Reautorizar após cada resposta e antes de salvar
   ou repetir corpo; mudança impede o próximo chunk/reparo. Recibo aplicado
   continua metadata histórica. Não persistir corpos do contexto no ticket.
6. Enquanto o writer preparado multi-item/crédito não estiver integrado,
   recusar aplicar alterações a alvos locais payload antes de qualquer escrita/
   débito. Não adicionar campos inline a um stub. Misturas também são atômicas.
   Inline/global continuam com o comportamento vigente.
7. Testes dirigidos de v1/v2/criação, campos/relações/ausências/BOM, corrupção,
   budget antes de chunks, 500+ entidades, revogação/recriação/CAS, guardas de
   escrita e rollback/sem cobrança. SDK real demo/loopback e regressões de análise.
8. Checks estáticos, docs/ADR/AGENTS/evidência e commit local, sem CI/deploy.
   Validate completo no fechamento de P1.

## Arquivos e riscos

Novo leitor lógico interno e integração em loreAnalysis; fixtures/tests Node
e SDK. Nenhum endpoint, Rule, índice ou dependência novos. Caller autoriza livro
antes da abertura; objeto/clocks/tokens do cliente não concedem acesso.

A análise atual limita o compêndio completo. Este passo não é suporte completo
à aplicação de patches em fichas grandes: próximo A2 deve preparar os campos/
gerações e adotar todos os itens com crédito/recibo atômicos, preservando
relações/campos intocados, sem alterar o contrato de 50 itens ou fazer débito
por unidade. Demais writers/consumidores/backup/cliente continuam pendentes.
Não declarar M38c3, P1/F2-09 ou V2 completos.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-leitura-logica-da-analise-de-lore.md)
e [ADR 0109](../../../decisions/0109-logical-lore-analysis-context.md):
54 Node e seis SDK positivos. Origens, budgets, reautorização pós-I/O e guarda
de escrita passaram; erro de domínio foi corrigido para conflito de origem.
Arquitetura/lint e sintaxe dos 226 módulos passaram.

A1 implementado internamente. A2 deve integrar aplicação preparada multi-item
com crédito/recibo atômicos. Demais writers/consumidores/backup/cliente, gates
de P1/F2-09/V2 e condições humanas/comerciais continuam pendentes.
Validate completo no fim de P1, somente commits locais, sem CI/deploy.
