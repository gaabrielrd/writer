# P2 — rascunho explícito no backup de aventuras

Base: cdf3643. Conservar contribuição explícita do editor de cena ou bloco,
separada do manuscrito salvo. Não enumerar localStorage, exportar journals,
pedidos pendentes ou conteúdo de outro contexto. Sem autosave/publicação.

## Descoberta e decisão

Grafo insuficiente; sceneDraftStorage, useAdventureBlockDraft, bookDraftBackupRecords
e adventureCoreData conferidos. Draft atual desses editores contém texto,
baseRevision e savedAt; persona e metadata salvas pertencem à composição central.
Reter um rascunho explicitamente escolhido por exportação, como nos livros.
Revisão antiga pode divergir da atual: conservar a divergência como dado,
sem substituir texto salvo. Restore futuro criará versão separada.

1. Observador opcional onUnit no compositor central fornece somente provas
   limitadas já verificadas. Fixar callback antes do consumo. Assembler futuro
   recolhe apenas head/body do recurso escolhido, sem mapa integral.
2. Draft exige contexto adventureId/resource e essas duas provas; revalidar
   fontes/escopos/tokens e hashes pelos readers existentes. Token recebido
   do cliente não concede acesso. Nenhum endpoint/server novo.
3. Congelar texto/intenção/metadata/port/guard/signal antes de await. Calcular
   manifesto em partes UTF-8 limitadas, com estado constante e pausa cooperativa
   a cada MiB. Não alocar cópia binária do texto inteiro.
4. Emitir cabeçalho fechado e partes UTF-8, vazio explícito, contagem/hash.
   Cabeçalho vincula hashes dos JSONs salvos; não incorpora tokens/perfis novos.
   Ausência de draft fecha seção vazia com manifesto.
5. Segunda conferência revalida head/body/fonte antes do selo futuro; erro,
   conta e cancelamento não produzem prova. Arquivo não modifica o editor.
6. Testes direcionados de cena/bloco, conflito/texto vazio/Unicode, observador,
   mutação/ABA/erro/cancelamento e integração. Tipos/lint/bundle pertinentes;
   integral somente após fechar o grande bloco.
7. Revisão/ADR/docs/evidência/commit local, mantendo P2/P3/D abertas.

## Aceites

- [x] Texto explícito separado e contexto autorizado; nenhum journal/auto-save.
- [x] Provas/hash/UTF-8, memória limitada e segunda conferência.
- [x] Testes/checks/revisão e documentação.
- [x] Commit local; composição final/validador/restore/UI ainda pendentes.
