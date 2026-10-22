# Writer V2 — Integridade dos backups recebidos (P1 M14)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, local.
- **Plano:** [contrato 47](../tasks/writer-v2/execucao/47-integridade-retomavel-da-restauracao.md).
- **Decisão:** [ADR 0058](../decisions/0058-book-restore-integrity.md).
- **Estado:** marco interno; P1/F2-09 e a V2 completa continuam abertos.

## Objetivo e funcionalidades

Conferir no servidor os bytes recebidos antes de preparar recursos do livro.
O avanço pode retomar em outra instância após cada lote e continua resolvendo
pedidos sem resposta pelo recibo original. Arquivo com hash/chain incompatível
é rejeitado; ele não cria livro.

## Critérios de aceite

- [x] Avanço limitado a 16 partes/1 MiB com checkpoint e recibo atômicos.
- [x] SHA integral independente, retomada por estado privado e prova de EOF.
- [x] Provas de hash/tamanho e identidade nativa por parte.
- [x] Leitor interno reautoriza e detecta mudança/ABA sem expor download.
- [x] Cancelamento/cleanup v2 removem partes, provas, estado SHA e chave.
- [x] Compatibilidade de jobs v1 e recusa de schema/contexto desconhecidos.
- [x] Estado sensível ausente de metadata/recibos e inacessível pelo SDK.
- [ ] Validação semântica servidor e materialização/ativação.
- [ ] Host com revisão cifrada, UI/roundtrip e validate integral de P1.

## Arquivos e dependência

Novos bookRestoreIntegrity e bookRestoreIntegrityRead, composição/contratos do
upload, index e comando de check. Testes Node e SDK real nas suas pastas.
Documentação de contrato/execução, ADR, arquitetura/testes/README/AGENTS.

hash-wasm 4.12.0 fixado somente em functions/package.json e seu lock, sem
transitivas novas. Consulta npm confirmou versão/integrity; npm ci --prefix
functions passou, 252 pacotes instalados e 253 auditados, zero vulnerabilidades
naquela árvore. A auditoria não representa a árvore cliente.
Node local 24.21.0 gerou EBADENGINE porque Functions declara 22, além dos avisos
de depreciação de node-domexception/glob já transitivos. Não alegar execução em
Node 22 ou produção. Nenhuma dependência no bundle cliente.

## Testes executados

Node de integridade final:

```text
tests 14
pass 14
fail 0
skipped 0
duration_ms 350.4473
```

Inclui dez tamanhos independentes SHA-256 via Node (padding/blocos/fronteiras),
retomada em serviço novo, replay/resolver, fonte alterada, estado corrompido/
ausente/incompatível, parte ausente/alheia/alterada, corrida/checkpoint,
rejeição de hash/chain, proteção após cancelamento/raiz inesperada e cleanup
de entrada parcial/verificada/rejeitada. Teste de 17 partes comprova lote
16+1 e ranges compostos no teto fixo. EOF rejeita parte extra.

Regressões Node de M13 e HTTP passaram: 17 casos. O lote combinado anterior
tinha 30/30 em 336,4563 ms (13 de integridade então existentes + esses 17).
O 14º teste novo foi acrescentado após a revisão de integração abaixo.

SDK real Firestore emulator 1.22.0, JAR verificado, porta loopback efêmera:
cinco novos cenários passaram, sem pulos, 13,0788644 s na execução final.
Comprovam SDK deny para dono/outro/anônimo sobre provas e SHA state, retomada
em serviço novo, leitura atravessando partes, recuperação da chave durante
checking, retry/CAS/recibos, ABA nativo, rejeição integral, cleanup e preservação
de outro livro. SHA state próprio corrompido continua explicitamente cancelável.
PERMISSION_DENIED é saída esperada dos asserts negativos.

A primeira execução conjunta de SDK passou em 11/11 (25,9690693 s), incluindo
seis regressões M13. Após o guard final de compatibilidade v1, essas seis
regressões foram repetidas e passaram em 15,0239091 s, sem pulos.

## Revisão e ajuste demonstrado

O limite inicial de 64 KiB do range não acomodava o decoder M2, que pede metadata
e payload juntos. O leitor foi ajustado ao teto de 272 KiB já definido pelo
contêiner. Teste com encode/decode reais e payload de 64 KiB passou; SDK final
também leu intervalo maior que 64 KiB. Não relaxar validação de payload/DTO.

Hash e prova conferem bytes, não conteúdo de livro: vetores binários válidos
podem chegar a bytes-verified sem formato válido. A API não exporta ativação
e não grava books. Índice temporário usado nos testes não é implementação do
futuro validador semântico no servidor.

## Validações e limites

Check sintático de Functions e lint dirigido passaram. Checks de documentação
e arquitetura passaram. Formato e diff foram conferidos antes do commit;
revisão final sem bloqueadores no escopo deste marco.
Cliente/TS/interface não mudaram; build e Vitest cliente não repetidos.
Validate integral permanece para fechamento P1, sem reduzir cobertura.

Sem UI, Storage, materialização, concessão de acesso a universo, publicação,
crédito, CI/push/PR/merge/deploy. A pergunta pendente sobre rascunho não bloqueia
esta integridade e permanece para a restauração.

Runner privado run-book-structure-sdk.mjs e logs m14-book-integrity-emulator.log /
m14-integrity-reader-final-emulator.log / m14-v1-regression-final-emulator.log
ficam nos artefatos da sessão, fora do Git.

## Como conferir

Executar bookRestoreIntegrity.test.mjs e regressões bookRestoreUpload/
bookRestoreRecovery. Usar emulador demo local para bookRestoreIntegrity.rules.test.mjs;
o teste recusa host não loopback e não pula silenciosamente. Não existe interface
de restauração final neste marco.
