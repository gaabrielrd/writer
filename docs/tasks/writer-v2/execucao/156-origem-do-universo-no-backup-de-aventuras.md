# P2 — origem neutra do universo no backup de aventuras

Base: a94e95f. Completar referência da origem antes do selo/pacote, sem duplicar
universo ou copiar lore global. Vínculo da raiz já foi capturado em 148.

Grafo consultado sem resultados; fallback em bookBackupUniverse/Read,
universes e fonte 147. Projeto liga universo próprio pelo contrato atual
authorId da conta; origem não é grant nem publicação. Leitor de livro já usa
none, unavailable(id) e reference(id,created nativo), sem prosa.

## Contrato antes do código

Extrair validador puro de origem para portableUniverseOrigin, mantendo exportação
antiga por alias e payload do livro idêntico. Há dois consumidores concretos;
não fazer cast de DTO ou hash de livro para aventura.

Novo getAdventureBackupUniverse interno, input fechado adventureId/sourceToken
e expectedUniverseToken opcional de 64 hex. Capturar tudo antes de awaits.
Na mesma transação conferir fonte 147 e máscara da raiz owner/schema/deleting/
universeId; somente consultar universo declarado com máscara authorId/deleting.
Nenhuma consulta de lore, descrição, nome, catálogo, compra ou autorização de
campanha. Raiz própria sem universo indisponível continua legível.

Ausência/null do vínculo gera none. ID válido de origem inacessível/ausente/
em exclusão gera unavailable(id), sem motivo que revele dado de terceiro.
Universo próprio ativo gera reference(id,created), pelo nascimento nativo,
sem duplicar. Token próprio liga UID/aventura/fonte/origem e identidade nativa
completa do universo autorizado. Atualização/recriação/revogação invalida token
esperado; não usa somente datas lógicas. Metadata inacessível não vira prova
nativa exportada. Origem unavailable não autoriza religar por coincidência;
restore futuro deve revalidar mesma origem/birth e acesso, sem copiar universo.

## Sequência e validação

1. Projeção/validador puro neutro, alias compatível e reader específico.
2. Produtores reais de universo + Estúdio, origem none/ativa/ausente/revogada/
   deleting, masks sem prosa, token repetível, mudança/ABA/nascimento,
   conta/input/espera e nenhuma escrita. Regressão do livro e vetor puro.
3. SDK real dirigido com máscaras/nascimentos/Rules e conteúdo próprio com
   universo indisponível; lint/sintaxe/docs/arquitetura/styleguide/format/diff.
   Validate integral no fechamento de P2.
4. Revisão, ADR/evidência parcial e commit local; próximo inventário final,
   selo/assembler/arquivo/revisão/restore/UI/roundtrip. Sem writer/Rule/runtime/
   namespace/dependência novos, CI/remoto/deploy/subagentes.

## Aceites

- [x] Origem neutra explícita, mesma identidade nativa e sem duplicação.
- [x] Autoria/fonte/masks no mesmo snapshot e nenhuma cópia global.
- [x] Alias do livro preservado e testes/SDK/checks/revisão/docs/commit.
- [x] Inventário/selo/pacote/restore/UI e P2 integral continuam abertos.

## Resultado dirigido e revisão

24 Node positivos (16 novos + oito regressões), sem skip, em 142,0615 ms.
Um SDK real positivo em 11.602,3315 ms, com produtores, masks nativas, birth/
recriação/revogação e própria aventura íntegra sem universo. Lint dirigido
positivo; checks finais acompanham commit.
[ADR 0179](../../../decisions/0179-adventure-backup-universe-origin.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-origem-do-universo-no-backup-de-aventuras.md).
Revisão confirma alias puro e ausência de lookup/prosa global. Inventário,
selo/pacote integral/restore/UI/roundtrip e validate P2 continuam abertos.
