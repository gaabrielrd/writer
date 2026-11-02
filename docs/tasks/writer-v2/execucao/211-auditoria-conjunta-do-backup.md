# P3 — auditoria nativa conjunta do backup

- Data: 2026-10-29.
- Base: 1d0d8e2; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md)
  e [210](210-imagens-congeladas-do-backup.md).
- Estado: implementação interna e checks dirigidos locais; P3/D/F2-09 e macro 8/35 abertos.

## Objetivo

Compor os leitores reais em uma auditoria servidor de todas as famílias,
calculando raiz incremental do conteúdo lógico e prova privada de dependências.
Repetir desde o início todos os inventários e verificações nativas e comparar
as raízes, contagens e disponibilidade antes de terminar. Não confiar em
hashes ou listas enviados pelo cliente.

## Implementação

- functions/src/campaignBackupAudit.mjs: factory com db/storage, API interna
  auditCampaignBackup(uid, {campaignId, expectedSourceToken?}, {signal?}).
- Validação e cópia da intenção antes de await; nenhum I/O antes do primeiro
  pull. Generator com progresso metadata por página/unidade, sem prosa/paths.
- Fonte própria e origem fixadas; raiz/progresso e nove famílias próprias,
  incluindo controles/omissões e páginas vazias.
- Base disponível: snapshot, sete tipos de item, cabeçalhos em partes, auditoria
  integral de campos e imagens declaradas; quatro famílias físicas em passes
  opostos para detectar ausência/órfãos.
- Lore: variantes ativas/removed/inactive/legacy, DTO/corpo e âncora autorizados,
  hashes/bytes e campos da edição antiga; cobertura por binding, lojas,
  corpos por loja e sonda de órfãos da encarnação, inclusive páginas vazias.
- Imagem disponível: hash nativo integral por geração exata, PNG/CRC32C/limites.
  Indisponível permanece explícito sem Storage nem promoção a conteúdo próprio.
- Fonte derivada none/unavailable não impede próprios; não ler base indisponível.
  Enumerar lore/lojas permitidos sem prosa revogada; registrar indisponibilidade.
- Cada seção dobra descritores canônicos (coordenadas, resultado, bytes/chunks/
  SHA) em hash; provas privadas também incluem tokens nativos, páginas, limites,
  lookahead e cobertura. Campos/âncoras usam auditoria existente dos bytes reais.
- Duas passagens completas idênticas, com final de fontes após ambas.
  Nenhum mapa/lista de projeto; página atual, hashes e contadores apenas.
- Emitir progresso provisório e devolver prova interna somente no término natural.
  Return/abort impedem chamadas seguintes e descartam resultado de I/O pendente
  ao revalidar o sinal. Não alegar cancelamento de uma requisição Storage já enviada.
- Testes Node com escritores reais, PNG/Storage real em memória e collectionGroup
  simulado; casos de mutação atrás de cursor, alterações tardias, bindings antigos,
  corpos ausentes/órfãos, revogação, interrupção e ausência de writes/prosa na saída.
- Docs/ADR/evidência parcial e commit local. Testes somente dirigidos.

## Critérios

- [x] Todas as famílias, páginas vazias e omissões são cobertas por ordem fixa.
- [x] Conteúdo lógico é dobrado por hash nativo, sem confiar em declaração cliente.
- [x] Segunda passagem recomeça em cada família e detecta mudança observada.
- [x] Próprios sobrevivem à origem indisponível; derivados não são promovidos.
- [x] Cobertura/órfãos, âncoras antigas e geração exata de imagens são conferidos.
- [x] Interrupção/escopo/pedidos desprendidos e saída sem prosa/paths testados.
- [x] Regressões pertinentes, lint/sintaxe/docs/formato e revisão registrados.

## Limites e sequência

Auditoria interna não é download, assinatura, atestado portátil, autorização
de restauração nem snapshot linearizável de alterações arbitrárias fora dos
produtores nativos. Controles monotônicos e identidades nativas dos escritores
vigentes participam das duas passagens; validar concorrência real permanece
obrigatório ao integrar persistência/ativação.

Sem endpoint/UI/Rules/dependência/segredo ou produtor persistente novo.
Segue manifesto portátil/atestado independente da existência dos IDs antigos,
framing/arquivo e ciclo. Antes de jobs/prosa/pins, ampliar cleanup C4 v1–v4
e consumidores de procedência. Somente commits locais, sem CI/push/deploy/
subagentes. Validate integral no fechamento do grande bloco P3.
