# ADR 0251 — Referências portáteis na base congelada de campanha

- Data: 2026-10-29.
- Estado: aceita para leitores internos; sem produtor persistente.
- Relacionadas: [0250](0250-campaign-restored-backup-readers.md) e
  [0248](0248-campaign-derived-semantics-and-review.md).

## Contexto

O arquivo guarda o alvo lógico dos vínculos e do ledger, inclusive indisponíveis.
Ele não guarda os IDs de origem necessários para reconstruir reference bruto.
Hashes não são reversíveis nem autorizam buscar outra origem com o mesmo nome/ID.

## Decisão

Em base restaurada com prova válida, links/ledger podem usar referenceMode
portable e portableReference fechado, schemaVersion 1 e target com kind,
sourceKey e available. Link acrescenta ledgerId hash ou null; ledger conserva
referenceKey e processed true. Campos de referência nativos conflitantes são
recusados; capturas nativas sem marcadores conservam a representação anterior.

Os validadores puros compartilhados rejeitam marcadores parciais/nulos,
versões/tipos inválidos, alvo/chave/estado incompatíveis e mistura com base
nativa. O produtor futuro deve derivar esses campos da revisão autenticada,
sem aceitar declaração do cliente como concessão de acesso.

Na leitura normal, alvo declarado indisponível não dispara consulta ao item
ou à origem. Seu vínculo continua presente, mas sem targetKey público.
Alvo disponível exige tipo correto e autorização atual do item. Link e ledger
devem concordar; o ID do ledger de um alvo autorizado permanece canônico.

O backup mantém o DTO portátil existente. Confere fonte, alvo e ledger, incluindo
testemunha reversa com consulta limitada a um registro pelo ledgerId. Para alvo
declarado ausente, confere apenas ausência física por metadata, sem origem/prosa:
uma base que contém item disponível contraditório não pode emitir arquivo válido.
Revogação atual de um alvo originalmente disponível continua produzindo
indisponibilidade pelos gates de origem. Tokens vinculam o descritor lógico.

## Consequências e limites

Nenhum novo formato público, dependência, endpoint, grant ou produtor persistente.
A emissão assinada e revisão semântica/origens continuam requisitos distintos.
O contrato permite reexportar vínculos de lore/cena/evento e externos indisponíveis
sem guardar marcadores privados no arquivo nem reconstruir scopeId/entityId.

Vínculos de sessão e relações externas de lore/variantes continuam pendentes.
Depois deles, integrar inventário/cleanup C4 v1–v4 antes de persistir dados de
restauração. Materialização/ativação e Estúdio/ciclos ainda são necessários.
