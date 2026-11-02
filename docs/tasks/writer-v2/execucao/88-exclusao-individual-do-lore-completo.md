# P1 / M38c3k — Exclusão individual do lore completo

## Objetivo e aceites

Concluir a retirada e limpeza de uma ficha própria inline/payload v1/v2, de
qualquer tamanho aceito pelo contrato portátil, preservando outras fichas,
livros e provas históricas. A ficha sai do catálogo no commit inicial;
bytes são limpos por unidades, com progresso retomável e sem recriação por replay.

Exigir inspeção ready e CAS da mesma origem. Retirar cabeça, avançar clock/datas,
gravar reserva permanente e recibo nativos juntos; revogar publicação somente
quando o consentimento lógico anterior era true explícito. Sem normalização,
leitura de prosa na limpeza ou manipulação de lore global.

## Suposições e fronteiras

Serviço interno, ainda sem callable/UI, dentro do passo 4 do plano 81.
O operador já autorizou a implementação sequencial; decisões técnicas reutilizam
inspeção, inventário, cancelamentos e exclusão de livro existentes.
Criação por reserva e integração dos hosts de escrita continuam tarefas seguintes.

A exclusão é irreversível. Um novo conteúdo recebe outro ID, nunca reutiliza
o ID retirado. Tombstone privado sob books/bookId/bookLoreTombstones/loreId
e job users/uid/bookLoreRemovals/removalId permanecem após limpar bytes.

## Sequência

1. Contratos fechados de intenção, startHash, token e pedidos CAS. Contexto
   imutável fixa livro/ficha/inspeção e nascimento; estado, eventos, âncoras e
   recibos ligam progresso à mesma transação. Start repetido confirma o pedido
   próprio sem reaplicar clock/publicação ou exigir acesso atual à origem.
2. Commit inicial consome inspeção autorizada da mesma fonte, mantém datas
   válidas do livro e valida clocks/epochs. Apaga cabeça e cria contexto/estado/
   tombstone juntos. Rules recusam criar/editar o ID retirado e negam controles.
3. Extrair unidades compartilhadas de cleanup do livro por capacidade nativa
   ligada à transação. Escopo individual filtra gerações/descritores/payloads
   por lore; jobs privados são varridos por livro em páginas unitárias,
   preservando os de outras fichas.
4. Cancelar preparações, filhos inline, uploads e inspeções da ficha; manter
   adopted/cancelled e suas fences. Aposentar gerações antes de limpar payloads.
   Até 16 partes por unidade, header por último; recusar escopo/recriações/leases
   desconhecidas e auditar inventário ao terminar.
5. Se o livro entrar em deleting, bloquear cleanup individual e entregar a
   responsabilidade ao controlador do livro. A etapa removals do livro registra
   handoff nativo antes de sua limpeza; confirmar conclusão pelo checkpoint
   original, sem dois coletores independentes nem recriar raiz/ficha.
6. Integrar a reserva aos leitores/aberturas atuais e às mutações Admin que
   poderiam reutilizar o ID; preservar confirmação histórica e guardas de
   cleanup após revogação. Adicionar índice da consulta de corpos por kind/id.
7. Testes Node/SDK dirigidos: inline/v1/v2, privado/público/ausente, clocks
   inválidos, CAS/retry/rollback/concorrência, origens/controladores/tombstone/
   corpos/partes recriados, mais de 128 partes, outras fichas preservadas,
   preparação parcial, transição para exclusão do livro e replay após raiz sair.
8. Revisar diff, atualizar ADR/AGENTS/docs/evidência e commit local com hooks.
   Sem push/CI/deploy. Validate integral fica no fechamento de P1.

## Riscos e não escopo

A limpeza individual só pode atribuir partes órfãs por inventário/header/provas
originais. Não varrer chunks desconhecidos do livro como se fossem da ficha:
preservá-los; o finish do inventário do livro inteiro continua bloqueando órfãos.
Fences não são conteúdo removível. Livro/ficha/controle recriados não herdam
autorização da encarnação anterior.

Não habilitar escrita ao cliente antes de integrar criação, todos os writers,
consumidores, backup lógico/indexado, roteamento de preparações sem marca e
recuperação do host. Sem crédito/IA, relação transitiva ou publicação automática.
P1/F2-09/Writer V2 permanecem abertos.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-exclusao-individual-do-lore-completo.md)
e [ADR 0103](../../../decisions/0103-individual-book-lore-removal.md):
303 Node e cinco SDK distintos positivos em rodadas dirigidas.
Lint, arquitetura e sintaxe dos 210 módulos passaram.

Retirada e cleanup internos estão implementados, incluindo entrega ao inventário
do livro e guardas do coletor/leitor/análise/Rules. O índice está declarado,
sem implantação. Criação por reserva e demais integrações de writers/consumidores/
backup/cliente continuam antes de endpoint/UI. Validate integral no fim de P1;
P1/F2-09/Writer V2 permanecem abertos e os commits são somente locais.
