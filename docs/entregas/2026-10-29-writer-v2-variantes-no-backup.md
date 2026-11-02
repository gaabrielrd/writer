# Writer V2 — variantes e âncoras de lore no backup

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 208](../tasks/writer-v2/execucao/208-variantes-e-ancoras-do-lore.md).
- Decisão: [ADR 0238](../decisions/0238-campaign-backup-lore-anchors.md).
- P3/D/F2-09 e macro 8/35 continuam abertos; somente commit local.

## Implementado

Inventário limitado de variantes e leitores de entidade, âncora/auditoria e
texto congelado da âncora. Layout legado e gerações anteriores são seguidos
pelos bindings exatos, com provas nativas e SHA/JSON canônico antes do DTO.
Estado removed/inactive/legacy é preservado; conteúdo revogado fica
explicitamente indisponível, sem nome/manifesto/hash textual/prosa.

Factory de âncora antiga confere captura e encarnação própria. O corpo também
exige origem anterior à base de seu binding: uma âncora nova não libera texto
anterior à recriação da ficha. Lore local/global e relações são reautorizados
por metadata; alvo indisponível não leva descrição antiga.

Entidade é uma unidade nativa de até 900.000 bytes, lida e parseada uma vez por
chamada. Não reúne projeto completo, não trunca campos e não cria staging.
DTO não contém bodyBinding, paths, tokens/revisões operacionais ou chaves.
A âncora conserva cabeçalho/snapshot e texto antigo, com auditoria de campos.

## Testes e validações observadas

- Node: 74/74 passaram, saída 0, 1.147,2975 ms: 28 novos de variantes e 46
  regressões dos leitores físicos/lógicos afetados pela factory.
- Vitest: 29/29 do consumidor real de campos passaram, saída 0, duração
  3,22 s (280 ms de testes). Total: 103 testes distintos dirigidos.
- Casos incluem gerações atual/anteriores, corpo legado retido, nova escrita de
  ficha legada sem duplicá-la na candidata, removed/inactive, recriação entre
  âncora/corpo, 27 variantes reais paginadas, lookahead, lore local, corrupção,
  JSON não canônico, ausência de corpo, identidade nativa regravada, relações
  revogadas, C4/adoção/conta e pedidos desprendidos.
- Todos os leitores foram exercitados com porta que recusa escrita e full-read
  de documento. Inventário recusou leitura de nomes/manifests/prosa.
- Lint inicial apontou um parâmetro db não usado no fixture de relações; removido.
  Lint final dos seis arquivos não apontou erros. Check:docs e formato dos
  14 arquivos passaram, saída 0, assim como diff e scan de segredos/artefatos
  grandes. Revisão conferiu escopos, encarnações, geração declarada, binding,
  limites, DTOs e falta de prosa antes da autorização; sem bloqueador pendente.

## Revisão e limites

Sem novos endpoints, Rules, dependências, segredos ou recursos persistentes.
Nenhuma alteração de interface/TypeScript de produção; não repetidos build ou
typecheck. Não rodou `npm run validate`: reservado ao fechamento do grande bloco
por orientação do operador. Não houve CI/push/PR/merge/deploy.

Inventário físico do grafo de bindings e segunda passagem conjunta ainda são
obrigatórios; também faltam binários/imagens, atestado/procedência portátil,
arquivo/restauração/UI/ciclo. Provas privadas de unidade não certificam arquivo
completo nem concedem acesso. Credenciais, concorrência e operação em produção,
pilotos humanos e condições comerciais não foram validados aqui.
