# P1 / M38c3e — Alcance e coleta dos corpos de lore

## Resultado exigido

Preparar a coordenação de alcance/lease/inventário antes de habilitar a adoção
CAS da edição prevista no [plano 81](81-escrita-do-lore-completo.md).
A limpeza atual de sceneJobs cobre bookTextBodies, mas não payloads/segmentos/
leases de lore. Não habilitar produtor de cabeças enquanto isso não for integrado.

## Sequência

1. Inventário nativo dos corpos já usados por fonte payload v1/v2: base, campo e
   página. Autorizar a mesma origem e obter o ponteiro no servidor; nunca receber
   manifesto/caminho físico como autoridade do cliente. Registrar geração ativa,
   corpo e referência antes de coletar qualquer corpo controlado.
2. Coleta por unidades e metadata: examinar referências e geração corrente,
   recusar referências ativas/preparando e lease de upload, travar novas
   referências antes da primeira remoção e preservar contexto/corpo/parte recriado.
   Header sai por último, depois de verificar ausência de chunks extras.
   Manter marcadores/recibos para não ressuscitar corpos coletados.
3. Reservar uploads sob a geração em preparação com prova nativa e cancelamento
   coordenado; estender a coleta para leases adotadas e geração preparing.
4. Preparar geração completa: campos achatados, páginas copiadas/alteradas por
   unidades e materialização servidor da origem inline. Consumir a inspeção da
   metadata sem confundi-la com disponibilidade física atual.
5. Adotar geração, leases, clock, privacidade/publicação e recibo no mesmo CAS.
   Replay confirma o evento e não reaplica edição antiga.
6. Integrar exclusão do livro/lore, guardas das Rules/clientes e todos os
   escritores antes de habilitar endpoint/UI. Validate integral no fim de P1.

## Escopo inicial — passo 1/2

Arquivos previstos: contratos/store do inventário, registro de fonte e coleta
internos; helper de abertura de páginas no reader existente; testes Node/SDK;
Rules do namespace, check e documentação. Sem nova dependência ou endpoint.

Controles de geração/corpo têm contexto imutável, estado revisionado e
eventos/âncoras nativos. Referência imutável liga a encarnação do corpo à geração
e ao evento original. Corpo initializing é protegido antes da primeira referência;
novos registros invalidam uma varredura e são recusados após reclamar coleta.

A fonte atual é reconferida em toda unidade de coleta, inclusive antes de
cada delete. Base/campos são comparados diretamente; todas as páginas de relações
são examinadas por lotes, sem supor posição fixa para um corpo. A varredura fica
vinculada à identidade nativa da cabeça e recomeça se ela mudar. Só remover após
conferir o alcance na mesma cabeça atual, inclusive após reclamar a coleta.

O primeiro passo protege qualquer lease presente e não a interpreta como grant.
O suporte a leases adotadas/reservadas virá no passo 3 com prova coordenada.
Book deleting/ausente adia coleta; a integração de exclusão vem no passo 6.
A geração ativa só pode ser aposentada quando a cabeça já não a usa.
Nenhuma geração antiga pode voltar a active.

Aceites: corpos ativos protegidos, fonte alterada/revogada, referências duplicadas/
novas durante varredura, corpos/partes/controles recriados, interrupção/replay,
coleta acima de 128 partes, chunk extra, header por último e fence permanente.
SDK deve comprovar nascimentos e negações, não somente usar doubles.

A adoção CAS completa e M38c/P1/F2-09/V2 permanecem pendentes. Somente commits
locais; CI ignorada, testes direcionados, nenhum deploy.

## Evidência do núcleo inicial

[Entrega](../../../entregas/2026-10-23-writer-v2-alcance-e-coleta-do-lore.md)
e [ADR 0097](../../../decisions/0097-lore-resource-reachability.md):
102 Node distintos e quatro SDK positivos. Registro de fonte v1/v2 e coleta
interna por metadata validados; varredura da cabeça inteira por lotes protege
páginas deslocadas, inclusive após reclamar coleta. Cabeça recriada com dados
iguais reinicia a varredura. Referências novas reiniciam o cursor de gerações.

Passos 1–2 têm núcleo para fontes. Passos 3–6 e sua integração seguem pendentes:
nenhuma lease é liberada/coletada por um phase alegado, nenhum livro deleting
é limpo aqui e nenhuma troca ativa de edição foi habilitada.
Próximo é o passo 3: reserva de uploads/geração com cancelamento coordenado,
antes de compor e adotar a geração completa. P1/F2-09/V2 permanecem abertos.

## Reserva e cancelamento — M38c3f

O [plano 83](83-reserva-dos-uploads-de-lore.md) implementou a parte de reserva
preparing/cancelamento do passo 3, com coleta própria ligada à transação nativa.
[Evidência](../../../entregas/2026-10-23-writer-v2-reserva-dos-uploads-de-lore.md):
113 Node e cinco SDK distintos positivos. Ausência/deleting/revogação permitem
apenas limpar staged próprio comprovado; a coleta genérica mantém seus guardas.

Leases adopted completam o passo 3 junto da adoção do passo 5. Passos 4–6 ainda
pendentes: compilar/referenciar geração completa, materializar inline, CAS/
clock/privacidade/recibo, exclusão e integração. Não habilitar troca ativa antes.

## Composição em payload — M38c3g

[Plano 84](84-composicao-das-geracoes-de-lore.md):
base/campos achatados, diff de páginas, vínculos à geração preparing e auditoria
por partes implementados para fontes v1/v2. [Evidência](../../../entregas/2026-10-23-writer-v2-composicao-das-geracoes-de-lore.md):
69 Node e três SDK distintos positivos.

O passo 4 continua aberto até integrar materialização inline e cleanup de seus
filhos parciais. Passos 3 (leases adopted), 5 e 6 também continuam pendentes.
Não habilitar troca ativa antes da integração.

## Materialização inline — M38c3h

[Plano 85](85-materializacao-das-fichas-inline.md) implementou a materialização
servidor de campos/páginas inline, incluindo cleanup dos filhos ainda não
reservados. [Evidência](../../../entregas/2026-10-23-writer-v2-materializacao-das-fichas-inline.md):
134 Node e três SDK distintos positivos em rodadas dirigidas.

O núcleo do passo 4 cobre inline e payload v1/v2. Adoção do passo 5, leases
adopted e integração de exclusão/writers/clientes do passo 6 continuam pendentes.
Nenhuma troca ativa ou UI foi habilitada.

## Adoção interna — M38c3i

[Plano 86](86-adocao-atomica-das-geracoes-de-lore.md) implementou o núcleo do
passo 5 e a adoção lógica das leases do passo 3: ativação nativa única protege
todas as reservas, sem writes por lease. Aposentadoria permite somente prosseguir
os guards de cabeça/referências. [Evidência](../../../entregas/2026-10-23-writer-v2-adocao-atomica-das-geracoes-de-lore.md):
277 Node e três SDK distintos positivos.

Passo 6 e rollout continuam pendentes: exclusão/inventário completo e integração
de writers/consumidores/backup/cliente. hasLoreResources bloqueia exclusão legada.

## Inventário de exclusão do livro — M38c3j

O [plano 87](87-exclusao-dos-recursos-de-lore-do-livro.md) implementa a parte
de exclusão do livro do passo 6: contexto/cutoff nativos e etapa v3 resolvem
preparações, removem cabeças, aposentam gerações e limpam descritores/payloads
por metadata. Root sai por último; jobs/leases/controles/recibos permanecem.

Esta barreira própria do livro deleting não altera a coleta genérica por
alcance. Exclusão por ficha, criação e roteamento completo de livros ainda
não marcados seguem pendentes antes de exposição ao cliente, assim como
writers/consumidores/backup/recuperação e rollout. Passo 6 e P1 continuam abertos.
