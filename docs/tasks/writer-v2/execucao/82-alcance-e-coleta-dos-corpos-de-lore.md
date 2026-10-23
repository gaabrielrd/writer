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
