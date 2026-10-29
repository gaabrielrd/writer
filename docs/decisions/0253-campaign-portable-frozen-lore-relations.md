# ADR 0253 — Relações portáteis do lore congelado

- Data: 2026-10-29.
- Estado: aceita para leitores internos da base; corpos de variantes pendentes.
- Relacionadas: [0251](0251-campaign-portable-base-references.md),
  [0252](0252-campaign-restored-session-materials.md).

## Contexto

O arquivo preserva relações lógicas com targetKey e available. Um alvo sem
prova não permite reconstruir targetEntityId, nome ou descritores. O modelo
nativo da base usa referências de origem, e o corpo de variante usa outro
contrato canônico, que precisa de incremento próprio.

## Decisão

Item lore de base restaurada autorizada pode usar structured.relationMode
portable e structured.portableRelations, sem structured.relations bruto.
Validador puro compartilhado conserva ordem, múltiplos tipos, self e limite 50.
Relação true exige chave/estado/tipo e descrição opcional; false contém somente
chave/estado. Presença parcial, mistura, texto inválido, campos extras ou uso
em outro tipo/base nativa falha fechado antes dos corpos.

Leitor da base, C2/readBaseEntity e backup reconhecem o modelo. Relação true
só é exibida quando a ficha correspondente na mesma base/âncora passa pelos
gates atuais; a projeção C2 ainda aplica variante/remoção/legado atuais.
Relação false não dispara consulta de alvo ou origem na leitura normal.
Nenhum tipo/descrição é inventado para um alvo ausente.

Backup conserva o DTO existente. Alvo ausente/revogado produz chave e available
false, sem descritores; declaração histórica true sem alvo/prova continua
privada e reexporta como não resolvida. O registro original não é modificado.
A revisão de restauração futura deve apresentar essas omissões de projeção,
sem tratar o arquivo anterior como permissão atual.

Para false explícito, o backup confere ausência física só por metadata, recusando
snapshot contraditório. Semântica de arquivo e autorização continuam gates
separados. Não procurar alvo por nome, hash reverso ou origem viva.

## Escrita e adoção

Save de variante mantém a substituição explícita da ficha inteira do contrato
C2 e não muda a base original. Descartar a variante retorna à base com as
relações portáteis intactas. Âncora base-mode retida conserva o modelo após
adoção/restauração, submetida à autorização original e projeção atual.

## Limites

Sem mudança de API/formato público, dependência, endpoint ou produtor persistente.
Relações opacas dos corpos de variantes, seus writers e adoção continuam
necessários antes de C4 e materialização persistente. Não converter relação
false para JSON entityInput inventando labels vazias.
