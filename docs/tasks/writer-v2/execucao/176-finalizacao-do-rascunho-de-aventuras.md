# P2 — finalizar o rascunho recuperado da aventura

Base: a39aaf3. Contratos de workHistory, descriptor/raw de 175, prova dos
artefatos e countVisibleWords conferidos; grafo parcial sem cobertura suficiente.

## Objetivo e escopo

Criar a versão nativa do rascunho já montado, mantendo manuscrito e histórico
existentes. Usar os campos nativos de aventura (sem draft de livro), com motivo
manual, rótulo de recuperação, data savedAt e texto/hash/partes preservados.
Ausência de draft é resultado explícito; draft vazio ou igual ao salvo continua
uma versão separada, conforme a decisão do operador.

## Sequência

1. Novo finalizeAdventureRestoreDraft interno após history-ready. Fase draft-ready,
   resultado none/version e contagem nullable, sem avanço de itemIndex. Compatível
   com recibos antigos e contagens fonte; não reclassificar versões fonte como draft.
2. Reabrir descriptor/text-state/root comprovados. Confirmar origem/fonte semântica
   autenticada, unidade do draft e seu raw token completo, ID determinístico e
   metadados exatos. Ausência exige ausência de descriptor/journal inesperados.
3. Provar cabeça/corpo salvos e sua correspondência com a origem capturada.
   Ler cada parte preparada com hash e identidade nativa. Recalcular SHA/bytes
   completos, preservar UTF-8/BOM e detectar partes faltantes/adulteradas/recriadas.
4. Calcular uma vez sobre o texto completo com countVisibleWords existente:
   palavras, entidades, HTML/Markdown e conteúdo removido podem cruzar partes.
   Não somar contagens por chunk nem introduzir limite arbitrário menor.
   Esse contador usa memória proporcional ao draft e o limite real de strings
   do runtime; falha de capacidade preserva fonte/estado, sem contagem inventada.
5. Antes de escrever, revalidar por metadata/journal todas as versões lidas e
   a fonte na transação final, sem reabrir toda a prosa nessa transação.
   Confirmar manifesto nativo, descriptor finalized, historyRevision +1,
   metadados/checkpoint/recibo juntos. Replays não duplicam versão; falha ou
   cancelamento não deixa manifesto parcial. Não tocar no manuscrito.
6. Cleanup reconhece a operação nova, mantém todas as provas e contagens.
   Artefato estrangeiro ou prefixo/versão incoerente não pode ser adotado.
7. Testes dirigidos Node/Vitest e SDK demo de none/vazio/igual/diferente,
   fronteiras de palavras/HTML/Markdown, metadata nativa e recaptura pelo leitor
   de histórico; replay/concorrência/retry/rollback/cancel e partes/journals
   ausentes/adulterados/ABA, mudanças durante contagem e cleanup.
8. Fechar o bloco de texto com npm run validate integral, sem CI, seguido de
   revisão/docs/ADR/evidência e commit local com hooks normais.

## Aceites

- [x] Versão recuperada nativa com contagem exata e manuscrito intacto.
- [x] Provas de fonte e partes reconferidas antes do commit; nenhum alvo adotado.
- [x] None/vazio/igual e recibos/cleanup compatíveis, sem duplicação.
- [x] Testes/checks e validate reais, revisão/docs/evidência e commit local.

Validate integral positivo: 4.316 frontend, 90 scripts e 3.477 Functions, além
de sintaxe/tipos/build/smoke, sem mudança de limites. Resultados e limites reais
estão na [evidência](../../../entregas/2026-10-27-writer-v2-finalizacao-do-rascunho-de-aventuras.md).

## Continuação e limites

A contagem tem a mesma semântica e custo em memória do contador nativo; não é
contador streaming novo. Leituras preparatórias são separadas; rechecagem final
precisa de metadata de cada artefato. Arquivos grandes ainda exigem benchmark
operacional antes do lançamento. Não declarar snapshot contra escrita
administrativa externa depois da transação final.
draft-ready não ativa projeto nem finaliza P2. Universo autorizado, personas na
biblioteca, imagens, agregados/audit/ativação, recuperação cifrada/UI/roundtrip,
P3/D/F2-09, fases seguintes e gates humanos/comerciais permanecem obrigatórios.
