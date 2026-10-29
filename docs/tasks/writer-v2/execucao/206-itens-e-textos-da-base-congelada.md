# P3 — itens e campos textuais da base congelada

- Data: 2026-10-29.
- Base: fdada8b; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md)
  e [205](205-origem-autorizada-da-base-congelada.md).
- Estado: leitores internos e fluxo de campo implementados localmente;
  P3/D/F2-09 e macro 8/35 abertos.

## Objetivo

Ler os sete tipos de item congelado e seus campos textuais declarados, sem
recapturar a aventura atual. DTO fechado de cabeçalho e partes de texto limitadas
permitem preservar campos/ausências, ordem, hierarquia, audiência e texto literal.

Este incremento entrega listagem de itens, cabeçalho lógico e leitura de campo.
O inventário físico completo de bodies/links/loreReferences/images, variantes/
legadas, bytes de imagens e manifesto/atestado seguem nos próximos incrementos.
Não confundir a lista de itens com prova de cobertura completa da base.

## Arquivos e arquitetura

- Definições puras dos campos textuais em campaignBackupBaseDefinitions.mjs,
  reutilizadas pelo validador existente de campos para evitar divergência.
- Gate/contexto/prova de item em campaignBackupBaseContext.mjs.
- DTO e projeções fechadas em campaignBackupBaseContent.mjs.
- Serviço privado em campaignBackupBaseRead.mjs: listagem, cabeçalho e partes.
- Fluxo de campo e contrato em campaign-portability/services, pela interface
  pública da feature, usando SHA incremental e guard/AbortSignal.
- Testes Node e Vitest com produtores/consumidores reais sobre bancos de teste.

## Contratos

Todas as entradas são fechadas, com UID/IDs/hash/índices validados e valores
capturados antes de await. Fonte própria e derivedToken esperado são obrigatórios.
Reautorizar o contexto do plano 205 em cada transação antes de metadados de item.
Base none/unavailable não vira lista vazia que aparenta captura completa.

Listar até 25 itens por ID e lookahead, sem filtrar arquivo ou indisponíveis.
Cursor canônico vincula UID/campanha/fonte/derivado/base/limite/último ID.
Resposta tem apenas id/itemToken/availability, sem nomes/campos de item revogado.
pageToken cobre página, início e lookahead; reconferência completa continua
obrigatória antes do futuro selo.

Conferir sourceKey igual ao digest da origem lógica, escopo da aventura/universo,
tipo e hierarquia de partes/cenas/blocos/arcos/marcos/eventos/lore. Pais têm tipo,
origem e prova nativa próprios. A profundidade é limitada pelo modelo.
Ficha de lore exige origem atual autorizada e nascimento da ficha anterior ou
igual ao da base; ID recriado não reautoriza ficha congelada. Lore local exige
também originAdventureToken e metadata privada correspondente. Sem prosa live.

Prova de item vincula base/derivado, identidade nativa, pais e fatos atuais da
origem da ficha. Não depender só do ID/globalLore available. Corpo/cabeçalho
indisponível não retorna prosa/nome/hash textual antigo.

Após a prova, ler somente máscaras fixas de conteúdo congelado e conferir a
mesma identidade. Cabeçalho portátil conserva sourceKey/tipo/origem declarada,
parentKey, archived/orderKey/title, campos textuais declarados, structured
permitido e referência lógica de imagem. Não exportar caminhos, geração, useKey,
controles, contadores internos da captura ou tokens privados.

Relações de lore apontam por targetKey. Alvo não capturado/revogado fica
indisponível sem título, relação textual ou descrição antigos; alvo autorizado
preserva os dados declarados. Não consultar prosa atual da ficha.

Validar manifesto de campos pelo contrato existente: nomes por tipo, unicidade,
SHA, bytes/chunkCount e limite de unidade, sem impor cap total do projeto.
bodySourceKey precisa corresponder ao próprio item; bloco principal pode
compartilhar content da cena pai, com manifesto idêntico. Nenhum caminho
arbitrário ou ponteiro para texto de outra ficha.

Leitura de texto usa campo/índice do manifesto provado e body key determinístico.
Conferir metadata/nascimento/updateTime antes da máscara content, corpo UTF-8
literal, field/sourceKey/index e tamanho até 65.536 bytes. Campo vazio conserva
um bloco vazio e SHA do vazio. Resposta retorna somente bytes/text manifest e
tokens privados de prova, nunca o documento de armazenamento.

O fluxo de campo valida cada envelope e parte, acumula SHA/tamanho e só retorna
frozen-field-bytes-only no término natural. Guarda apenas parte/hash/contadores,
não monta o campo/projeto completo. Byte length/SHA final divergentes recusam,
assim como encerramento, abort, troca de conta e resposta atrasada.
Metadados/chaves do pedido e manifesto ficam desprendidos antes de await.

## Critérios

- [x] Sete tipos e suas hierarquias/manifestos/campos lidos da base exata.
- [x] Ficha revogada/recriada não revela nome/corpo/hashes textuais; pais e relações autorizados.
- [x] Corpo compartilhado só na cena/bloco principal correspondente, sem cruzar fichas.
- [x] Partes limitadas preservam vazio/BOM/Unicode/espaços, com SHA/tamanho integral.
- [x] C4/adoção/conta/fonte/pedido obsoleto e dados corrompidos recusam.
- [x] Paginação/cursor/lookahead, dados desprendidos e interrupções cobertos por testes reais.
- [x] Validação dirigida, tipos/arquitetura/lint/docs/formato e evidência registrados.
      Validate integral no fechamento do grande bloco.

## Limites e sequência restante

Não assina manifesto de cliente nem produz atestado portátil. Ainda faltam
inventário físico completo e conferências de órfãos/cobertura/referências/imagens,
variantes/legadas, arquivo final, persistência/cleanup, restauração e UI/ciclo.
Declaração de origem/manifesto não concede acesso. Antes de produtores
persistentes, evoluir C4 v1–v4 e consumidores de bases restauradas, conforme 205.
Nenhuma dependência, Rules, endpoint, chave, job ou pin novo.
Somente commits locais, sem CI/push/PR/merge/deploy/subagentes.
