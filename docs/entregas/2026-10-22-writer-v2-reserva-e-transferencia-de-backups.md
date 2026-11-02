# Writer V2 — Reserva e transferência de backups (P1 M13)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, desenvolvimento local.
- **Plano:** [contrato 46](../tasks/writer-v2/execucao/46-reserva-e-transferencia-da-restauracao.md).
- **Decisão:** [ADR 0057](../decisions/0057-book-restore-upload.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 permanecem abertos.

## Objetivo e funcionalidades

Preparar o recebimento privado de um backup sem criar livro incompleto.
A API reserva um novo ID, recebe partes verificadas, resolve pedidos sem resposta
e permite cancelar/limpar os bytes. Não é a restauração final para o usuário.

## Critérios de aceite

- [x] Reserva/marker/job com nascimento nativo comum e raiz ausente.
- [x] Criação comum pelo SDK e imageLibrary bloqueada no ID reservado.
- [x] Partes até 64 KiB, hash/base64/tamanho/índice, checkpoint e recibo atômicos.
- [x] Reenvio idempotente e confirmação histórica separada do progresso atual.
- [x] Fence inicial permanente e corrida start/resolver sem duplicar projeto.
- [x] Chave única por contexto, HTTP sem cache e SDK privado negado.
- [x] Cancelamento revoga chave; cleanup limitado preserva outros projetos.
- [x] Fingerprint completo de arquivo por ranges, cancelável e sem arquivo na RAM.
- [ ] Revisão cifrada persistente no host, validação servidor, remapeamento/ativação.
- [ ] UI/roundtrip e fechamento do bloco P1.

## Arquivos alterados

Functions: bookRestoreUploadContracts, bookRestoreUpload, bookRestoreRecovery e
composição index. Rules negam SDK nos namespaces de reserva, job/chunks, chave,
recibo e fence. Hosting acrescenta rewrite específico antes da rota curinga.
Scripts de check incluem os três novos módulos; nenhuma dependência nova.

Cliente: fingerprintBookBackup pela interface pública de book-portability.
Documentação: plano/registro de execução, ADR, arquitetura/testes/README/AGENTS
e esta evidência. Não houve interface ou mudança no estado de publicação.

## Testes executados

Node, dois arquivos:

```text
tests 17
pass 17
fail 0
skipped 0
duration_ms 217.7909
```

Treze casos do serviço e quatro de HTTP. Cobrem autenticação/entradas fechadas,
versões aceitas, contexto nativo, perda/troca de chave, checkpoint/índice/tamanho/
hash/base64 inválidos, reenvio, corrida, fence, resolução, paginação, cancelamento,
cleanup sem prosa, filho estranho, buraco Admin e proteção de raiz inesperada.
HTTP verifica método/Auth/App Check/corpo/UTF-8/content-type/limites/erros.
Verificadores HTTP são injetados em teste; não comprovam o serviço produtivo.

Vitest do fingerprint: **3/3**, 1,89 s. SHA-256 independente via Node, BOM, quatro
ranges de até 64 KiB, trecho final curto, abort durante leitura e leituras
incompletas/tamanhos inválidos.

SDK real, Firestore emulator 1.22.0, JAR verificado e porta efêmera loopback:

```text
tests 6
pass 6
fail 0
skipped 0
duration_ms 16187.9106
```

Prova createTime comum, bloqueio de criação normal, isolamento de dono/outro/
anônimo inclusive listas/chunks/chave/recibo/fence/reserva, corridas com retry,
recibos históricos, cleanup 2+1, manutenção de outro livro, chave ausente sem
regeneração, ABA real e fence antes/concomitante ao start.
Mensagens PERMISSION_DENIED são dos asserts negativos esperados.
Runner privado run-book-structure-sdk.mjs e log m13-book-restore-emulator.log
ficam nos artefatos da sessão, fora do Git.

## Validações

Typecheck, lint dirigido e check sintático de Functions passaram.
O primeiro lint encontrou import jobToken sem uso; removido e check repetido.
Checks de documentação e arquitetura passaram. Bundle de produção e smoke
passaram; permanecem os avisos conhecidos de tamanho e imports dinâmicos
ineficazes. Typecheck, check sintático de Functions e lint dirigido terminaram
com código zero. Não houve erro de comportamento nos testes executados.
O formato dos arquivos alterados foi conferido antes do commit.

A busca inicial do grafo não respondeu; fontes/contratos conhecidos foram
conferidos diretamente. Não atribuir resultado novo a um índice desatualizado.

## Limitações e pendências

uploaded não é ready: SHA integral e validade semântica ainda não conferidos no
servidor. Os bytes brutos ficam privados, incluindo qualquer dado não confiável
do arquivo; cancelamento os remove, preparação futura deve purgá-los ao concluir.

Cleanup v1 inventaria somente chunks e chave. Antes de ampliar preparação,
versionar o inventário e certificar que filhos alheios não serão adotados/apagados.
Nenhum dado entra em books neste marco.

Emissão da chave não comprova commit IndexedDB; aguardar oncomplete no host
continua obrigatório. Interface, persistência da revisão cifrada, materialização,
mídia normalizada, autorização de universo e ativação atômica são próximas etapas.
A escolha de tratamento de draft ainda está pendente na conversa.

Validate completo fica para o fechamento P1, conforme orientação do operador.
Sem CI, push, PR, merge, deploy, prova produtiva Auth/App Check ou lançamento.

## Como conferir

Executar os dois novos testes Node e o teste Vitest de fingerprint.
Executar bookRestoreUpload.rules.test.mjs com FIRESTORE_EMULATOR_HOST de um
emulador demo local; o teste recusa endereço não loopback e não pula silenciosamente.
Não há botão de restauração final disponível neste marco.
