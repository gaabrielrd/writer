# ADR 0179 — origem neutra do universo da aventura

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Novo getter interno revalida fonte 147 e vínculo da raiz no mesmo snapshot,
lendo somente universo declarado por authorId/deleting. Sem nome, prosa, lore,
catálogo, compra, autorização de campanha ou duplicação do universo.

Origem none para ausência/null; unavailable(id) para ausente/inacessível/deleting;
reference(id,created nativo) somente para universo próprio ativo. Não expor
motivo de indisponibilidade nem identidade nativa de terceiro. Token próprio
liga UID/aventura/fonte/origem e identidade nativa completa do universo
autorizado. Datas lógicas não substituem nascimento/updateTime nativos.

Restore futuro deve revalidar acesso e mesma origem/birth para religar ao
original. unavailable não é grant ou autorização por coincidência; não duplica
universo nem copia lore global. Conteúdo próprio segue legível sem universo.

Compartilhar somente validador puro portableUniverseOrigin com livro,
mantendo exportação anterior por alias e payload. Não reutilizar hash/DTO
de livro como aventura por cast.

## Limites

Sem writer, Rule, endpoint/runtime/persistência/UI/dependência novos.
Inventário/selo/pacote/restore/roundtrip e validate P2 continuam pendentes.
[Plano 156](../tasks/writer-v2/execucao/156-origem-do-universo-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-origem-do-universo-no-backup-de-aventuras.md).
