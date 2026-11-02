# Writer V2 — Validação servidor de JSON legado (P1 M19)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 52](../tasks/writer-v2/execucao/52-validacao-servidor-do-json-legado.md).
- **Decisão:** [ADR 0063](../decisions/0063-legacy-book-server-validation.md).
- **Estado:** marco interno; P1/F2-09 e a V2 integral permanecem abertos.

## Objetivo e funcionalidades

O servidor valida backups JSON v1–v6 pelas partes privadas já verificadas,
retomando em novos serviços até content-verified. Esse resultado preserva
procedência/ausências e coincide com o leitor compartilhado. Novo e legado usam
o mesmo protocolo de validação, sem criar livro ou ativar permissões.

Checkpoint opaco versionado suporta o cursor lexical grande. Índice, pointers,
estado e recibos são atômicos, com rechecagem nativa das leituras. Pointers do
legado guardam cursor/record/hash, sem copiar DTO. Pedidos seguem fechados.

## Aceites

- [x] Seis versões passam por upload/integridade/validação e paridade completa.
- [x] Arquivo com versão real divergente da declarada é recusado.
- [x] Scanner/catalog/normalizador/núcleo compartilhados e unidades limitadas.
- [x] Snapshot v2 privado grande, mantendo archive v1.
- [x] Replays/CAS, leitura por pointer e commit nativo conjunto.
- [x] Rejeição determinística separada de identidade/I/O/checkpoint corrompido.
- [x] Cleanup v3 aceita snapshot opaco e preserva outros projetos/reservas.
- [x] SDK direto negado, sem payload em progresso/recibos/listas.
- [ ] Materialização/remapeamento/mídia e ampliação do inventário.
- [ ] Reautorização/ativação, host protegido/UI/roundtrip e validate integral P1.

## Arquivos alterados

Novo bookRestoreLegacyValidation faz adaptação. Validation/Step ligam dispatch,
snapshot v2 e resumo. Upload/Contracts validam fases e replay por versão.
Encoder do normalizador converte somente falhas puras de codificação em erro de
formato; falha de I/O mantém o erro original. Script check inclui módulo novo.

Novos testes Node, helper e SDK; teste antigo que esperava legacy-validation-pending
agora confere rejeição de conteúdo incompleto. README/arquitetura/testes/execução,
ADR, AGENTS e esta entrega atualizados. Sem dependência nova, callable, Rule,
coleção ou interface. Nenhum write de livro, Storage, crédito ou grant.

## Node dirigido

Comando executado:

```bash
node --test functions/test/bookRestoreLegacyValidation.test.mjs functions/test/bookRestoreValidation.test.mjs functions/test/bookRestoreUpload.test.mjs functions/test/bookRestoreIntegrity.test.mjs functions/test/bookRestoreRecovery.test.mjs functions/test/bookLegacyNormalize.test.mjs functions/test/bookLegacyReview.test.mjs functions/test/bookLegacyJSON.test.mjs
```

Saída final real:

```text
tests 85
pass 85
fail 0
skipped 0
duration_ms 1889.9428
```

Quinze casos novos do serviço legado, dez de archive/coordenador, 13 upload,
14 integridade, quatro HTTP, 13 normalização, onze domínio legado e cinco scanner.
Cobrem as seis versões em novos serviços, relatórios completos e readback de todos
os pointers, JSON lógico acima de 64 KiB, 205 relações/205 referências em lotes,
versão/sintaxe/schema/corpo inválidos, nonfinite no DTO, CAS/perda de resposta,
I/O TypeError transitório, fonte alterada depois de preparar, snapshot opaco
corrompido/grande, codec/canonicalidade/limites e cleanup limitado.

Não houve redução de asserts/limites nem dependência nova. O teste de formatos
pendentes foi atualizado porque o serviço já valida o legado.

## Firestore real

Firestore emulator **1.22.0**, JAR verificado, porta efêmera loopback.
Dois SDK novos e quatro archive de regressão, em uma execução:

```text
tests 6
pass 6
fail 0
skipped 0
duration_ms 95139.0898
```

- Legado real via SDK Admin confere resultado com o leitor, commit nativo conjunto
  de índice/estado/recibo, updateTime final, pointer ligado ao próprio recibo,
  retry histórico e cancelamento/cleanup preservando outro livro.
- Dono/outro/anônimo têm leitura/lista/write SDK negados em estado/índice/pointers.
- Snapshot opaco de **235.284 bytes** retomado; envelope JSON media **439.317 bytes**,
  checkpoint 20. Recriação idêntica perde nascimento, falha sem rejeitar arquivo
  e permanece cancelável. Recibo antigo confirma depois do cancelamento.
- Regressões archive conferem paridade, Rules, commits/retries/CAS e ABA de estado
  e índice. Logs PERMISSION_DENIED são os asserts negativos esperados.

Runner privado run-book-structure-sdk.mjs; log
m19-legacy-validation-emulator.log fora do Git. Processo encerrou com código zero.
Fixture Node não foi usada como prova de limites, Rules ou timestamps reais.

## Cliente e validações

Vitest dirigido: **8/8**, dois arquivos em **1,70 s**, inspeção do legado e
interoperabilidade com exportador cujas APIs autorais são simuladas.
Typecheck, check sintático de Functions, lint dirigido, formato, documentação,
arquitetura e diff passaram.

Sem mudança de UI e sem novo caminho de bundle; build/navegador não foram
repetidos neste marco. Testes SDK acima exercitam o servidor real com emulador,
não Auth/App Check produtivos ou endpoint implantado. Validate integral fica
para fechamento P1, conforme orientação do operador.

## Revisão e limites

A fonte é conferida por SHA M14 e prova nativa por cada range; o scanner precisa
de EOF. stateJSON é privado e não serve como autorização autônoma. Regras de
publicação/universo/direitos continuam fora do resultado intrínseco.
Índices/pointers permanecem metadata-only; chave de recuperação não é persistida
em snapshots/histórico/recibos. Cleanup não precisa interpretar JSON corrompido.

Revisão final sem bloqueadores no escopo deste marco; hooks mantidos habilitados.
Sem CI, push, PR, merge ou deploy. Checkout original E: preservado.

## Próximo passo e reprodução

Ampliar inventário para preparar/remapear dados e normalizar mídia, antes de
ativar raiz/vínculo/recibo atomicamente. Host cifrado, revisão, UI e roundtrip
seguem em P1; a política pendente de draft continua registrada na conversa.

Rodar Node dirigido acima; os dois testes SDK estão em
tests/firestore/bookRestoreLegacyValidation.rules.test.mjs e
tests/firestore/bookRestoreValidation.rules.test.mjs e exigem emulador loopback,
sem skip silencioso. Não existe botão de restauração final neste marco.
