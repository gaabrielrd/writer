# P3 — revisão autorizada das origens do arquivo

- Data: 2026-10-29.
- Base: 7228150; sequência de [213](213-arquivo-nativo-de-campanha.md).
- Estado: implementação interna e checks dirigidos locais; P3/D/F2-09 e macro 8/35 abertos.

## Objetivo

Conferir acesso atual às evidências autenticadas do arquivo, preservando próprios
e explicitando derivados indisponíveis. Não consultar campanha/base antigas
nem aceitar origem recriada por ID reutilizado.

## Descoberta e contrato

A leitura de um source emprestado pode mudar depois da validação. Reler evidências
e consultar origens antes de conferir novamente a raiz usaria dados ainda não
autenticados. Preparar um índice temporário injetado durante a validação completa,
sem consultas de origem. Cada registro recebe MAC efêmero do servidor, vinculado
à conta/ordinal/payload, antes de sair para o índice. Somente depois de cadeia,
raízes e assinatura válidas selar o índice e iniciar consultas de origem.

O índice recebe write/seal/read/dispose por métodos capturados. Não há adaptador
persistente padrão. Ler páginas de até 25; copiar e conferir todos os MACs da
página antes de await/consulta nativa. Alteração, troca, repetição, ausência ou
registro de outra revisão recusam. Chave MAC existe só em RAM e é zerada no fim;
não vai para arquivo, logs ou armazenamento. Sempre descartar o índice ao terminar.

## Arquivos e sequência

- campaignBackupFileValidation: callback interno provisório onWitness, fechado/
  desprendido, somente para armazenamento temporário; nunca tratar como grant.
- campaignBackupOriginAccess.mjs: leituras mascaradas de reserva C4 da aventura,
  raiz/owner/nascimento e universo/ficha atuais, inclusive token do lore local.
- campaignBackupOriginReview.mjs: validar arquivo e indexar evidências; depois,
  duas passagens de autorização, com hashes/contagens e clock global antes/
  durante/depois. Não criar controles ou ler prosa.
- Base ativa em memória é singleton; itens precisam pertencer a ela. Âncora antiga
  carrega sua própria base. Não montar mapa de projeto ou reutilizar permissão
  observada em outra transação.
- Aventura: mesma conta, schema, nascimento exato, sem deleting/reserva C4.
- Universo: mesmo autor/nascimento, sem deleting. Universo indisponível não retira
  material não dependente de lore global da aventura.
- Ficha: mesmo nascimento, ativa e no pai autorizado. Lore local exige schema,
  owner, adventureId/token e entityId exatos. Edição de prosa não recaptura texto.
- Omitida na exportação permanece omitida; nunca reclassificar derivado como próprio.
- Resultado e decisões provisórias contêm somente IDs/disponibilidade/contadores,
  sem prosa; prova campaign-origin-review-only é efêmera e não ativa restauração.
- Testes com arquivos realmente assinados, escritores nativos, origens removidas/
  recriadas, campanha/base antigas ausentes, MAC/índice adulterado, fonte mutável,
  clock/C4, abort e ausência de leituras antes da validação. Checks dirigidos.

## Critérios

- [x] Nenhuma origem é consultada antes de autenticar o arquivo e o índice.
- [x] Alteração de origem/índice/clock durante a revisão impede prova final.
- [x] Nascimento exato e C4 distinguem edição antiga de origem recriada.
- [x] Próprios não são apagados; ausências/omissões dos derivados são explícitas.
- [x] Base/itens/âncoras possuem vínculos conferidos sem depender dos IDs antigos no banco.
- [x] Páginas limitadas, métodos capturados, abort/limpeza e zero prosa/escrita nativa testados.
- [x] Regressões pertinentes, checks, revisão e evidência registrados.

## Limites e sequência

Sem endpoint/UI/Rules/dependência, segredo persistente ou produtor de índice real.
Índice de testes é efêmero em memória; adaptador privado real e retomada exigem
inventário/cleanup C4 v1–v4 e consumidores preparados antes de persistir recursos.
MAC efêmero não é atestado portátil nem recuperação entre processos.

Revisão não certifica vínculos semânticos completos do domínio, materialização,
ativação ou acesso futuro. Restaurador deverá reautorizar por unidade e na ativação.
Concorrência real e fontes/índices persistentes ainda não foram validados.
P3/D/F2-09 e macro 8/35 abertos. Validate integral no grande bloco.
Somente commits locais, sem CI/push/deploy/subagentes.
