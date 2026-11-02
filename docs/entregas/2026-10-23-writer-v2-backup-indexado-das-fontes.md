# Writer V2 — Backup indexado das fontes congeladas (P1 M37b)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [contrato 75](../tasks/writer-v2/execucao/75-backup-indexado-das-fontes.md)
- Decisão: [ADR 0086](../decisions/0086-indexed-scene-source-backup.md)

## Objetivo e funcionalidades

Exportar fontes grandes sem recompor todo o texto a cada página. O backup
preserva os mesmos bytes JSON e a autorização atual, com menos leituras de partes.

## Critérios atendidos

- [x] Índice pequeno no manifesto existente, criado atomicamente com fonte e
      partes, sem texto duplicado, novo namespace ou novo inventário.
- [x] Hash original conferido na geração; saída idêntica à serialização anterior,
      inclusive Unicode/BOM, aspas, controles e metadados com aparência de marcador.
- [x] Até quatro partes nativas por página JSON de 64 KiB, sem cache entre chamadas.
- [x] Token inclui nascimento/última alteração do corpo; atualização, ABA e
      recriação integral não herdam prova antiga nem exigem ler prosa para falhar.
- [x] Fonte sem índice mantém compatibilidade; índice inválido não vira fallback.
- [x] Cliente recusa hash integral incorreto antes de emitir registros da fonte
      e rejeita token alterado na verificação final.
- [x] Near-8 MiB validado no SDK para capacidade nativa/saída, e índice conferido
      pelo fluxo real de restauração acima de 1 MiB.
- [x] Nenhuma API, DTO, Rule, componente, crédito ou dependência nova.

## Arquivos alterados

BookSceneSourceEncoding constrói/valida o índice e lê intervalos;
BookSceneSourceText o grava no corpo. BookBackupResourceRead projeta somente a
página necessária e vincula a prova ao corpo. Functions check inclui o módulo.
Testes Node/SDK e helper de medição cobrem formato/custos/compatibilidade/tokens;
ResourceCapture ganha casos cliente de hash e prova final. AGENTS, README,
arquitetura/testes, plano/registro e ADR documentam o contrato.

## Testes e validações reais

**104 testes backend distintos positivos**, seis arquivos: codificação/fontes,
leitura de recursos, restauração/contagens e coleta/deleção de corpos.

```text
tests 103
pass 103
fail 0
skipped 0
duration_ms 9461.5072
```

Inclui 20 casos novos de codificação: comparação byte a byte com o JSON anterior,
Unicode entre partes, BOM, controles/escapes, near-8 MiB, ausência do índice,
11 índices inválidos, corpo recriado/alterado/ABA e parte corrompida.

A revisão encontrou uma leitura de parte antes da checagem do estado indisponível
da fonte. O novo teste falhou com 1 leitura em vez de 0; a checagem foi antecipada.
Somente os três arquivos de leitura afetados foram repetidos: 41/41 positivos,
6220.0611 ms. Esse lote acrescenta um caso distinto aos 103 anteriores; não somar
os casos repetidos. Nenhum texto era retornado na tentativa recusada.

O contador do helper registra também transações recusadas, evitando uma prova
vazia de que não leu partes. Leituras de listas são mascaradas e os testes
conferem o teto por página. O caso de fonte de 19 partes passou de 361 para
37 chamadas get de partes. O caso de 128 páginas usou 255.

**22 testes Vitest distintos positivos**, dois arquivos. O lote inicial teve
20/20, 2,63 s. Após adicionar os dois casos de integridade da fonte, apenas
bookResourceCapture foi repetido: 14/14, 1,77 s. Não somar repetições.
Não houve mudança de produção no cliente.

**Três cenários SDK reais positivos**, Firestore 1.22.0 verificado, portas
loopback dedicadas:

```text
# Capacidade nativa near-8 MiB/128 páginas e prova contra alteração/recriação
tests 2
pass 2
fail 0
skipped 0
duration_ms 19070.7986
# 128 output pages, 255 raw-part get requests

# Fluxo real de restauração, leitura/backup e cancelamento
tests 1
pass 1
fail 0
skipped 0
duration_ms 112772.7371
# 19 output pages, 37 raw-part get requests
```

O primeiro SDK usa plano nativo para provar capacidade/intervalos e tokens;
não substitui a validação do arquivo inteiro. O segundo executa upload,
validação, preparação, reconciliação, índice e cleanup reais. Raiz de leitura
continua sendo harness sintético, sem ativação do restaurador.

Sintaxe de Functions, arquitetura, lint dirigido, formatação, links e diff
positivos. Tipos e bundle não foram repetidos: APIs/declarations e código de
produção do cliente não mudaram; os novos testes TypeScript foram verificados
no lint. Sem jornada visual ou deploy. Validate integral continua no fechamento
de P1, conforme instrução do usuário.

## Correção da evidência anterior

Um nome incorreto de teste no lote de M37a foi ignorado pelo Node. Os 110 casos
registrados realmente passaram, mas vieram de seis arquivos, não sete; o número
de arquivos foi corrigido na entrega M37a. O arquivo correto
bookBackupResourceRead.test.mjs foi executado neste incremento e consta dos 103
casos acima. Os comandos dirigidos passaram a conferir a existência dos caminhos.

## Limitações e continuação

As contagens acima são chamadas get de partes nos testes, não faturamento ou
benchmark isolado de latência. Metadados e consultas também são lidos.
Fontes legadas sem índice mantêm o custo anterior; migrar/certificar esses jobs
antes de habilitar P1 integralmente.

Outros campos grandes e crescimento do JSON após remapeamento ainda precisam
de solução antes da ativação. Permanecem capa/biblioteca, certificação/ativação,
limpeza pós-ativação e host/UI/roundtrip/validate. P1/F2-09 e Writer V2 abertos.
Somente commit local, sem CI/push/PR/deploy; checkout original e servidor preservados.

## Como verificar

Executar bookSceneSourceEncoding e bookSceneSourceText em functions/test.
Os testes SDK correspondentes requerem Firestore loopback compatível. A captura
cliente conserva o contrato anterior; o restaurador ainda não ativa a cópia.
