# Writer V2 — Leitura autenticada para materialização (P1 M20)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 53](../tasks/writer-v2/execucao/53-leitura-autenticada-dos-itens-validados.md).
- **Decisão:** [ADR 0064](../decisions/0064-verified-book-restore-content-read.md).
- **Estado:** marco interno validado; P1/F2-09 e Writer V2 continuam abertos.

## Objetivo e funcionalidades

O servidor passa a ler itens do backup já validado com proteção de origem e
prova para a transação que futuramente criará a cópia. A leitura funciona para
o arquivo novo e JSON v1–v6; preserva JSON por item e histórico/rascunho/PNG por
fluxo, inclusive texto vazio, BOM e Unicode. Não cria livro nem expõe endpoint.

O operador confirmou o comportamento de rascunho: manter salvo no manuscrito e
recuperar rascunho diferente como versão separada. Registrado no plano P1/ADR;
a escrita dessa versão continua pendente no materializador.

## Critérios de aceite

- [x] Abertura exige content-verified e relatório final coerente com snapshot/resumo.
- [x] Reserva/marcador/destino, controle, snapshot e recibo inicial conferidos.
- [x] Itens/índices têm nascimento ligado ao próprio recibo; leitura não os modifica.
- [x] Novo e seis legados lidos por unidades, sem carregar o projeto inteiro.
- [x] Raw confere partes/hash por fluxo, com provas limitadas por unidade.
- [x] verify(tx) bloqueia consumo após cancelamento/alteração/ABA.
- [x] Falha transitória não rejeita arquivo nem avança progresso.
- [x] Método interno fora da lista HTTP/callable; SDK privado continua negado.
- [ ] Remapeamento, inventário ampliado e escritores nativos de materialização.
- [ ] Personas/mídia/ledger, reautorização/ativação, host/UI/roundtrip e validate P1.

## Arquivos alterados

Novo bookRestoreContentRead compõe leitura, origem e verificações. Upload oferece
somente a capacidade interna; Validation compartilha autenticação de snapshot e
ValidationStore lê ponteiros imutáveis. O check sintático inclui o módulo.
Novos testes Node/helper e ampliação dos dois SDK existentes, sem reduzir asserts.
README, arquitetura, testes, plano/registro de execução, ADR e AGENTS atualizados.

Sem dependências, coleções, Rules, callable ou gravação de livro/Storage/créditos/
direitos. Cleanup v3 permanece para o inventário atual; sua ampliação deve preceder
os novos writers. A prova escrita pelos testes é apenas um sentinela de transação.

## Testes Node dirigidos

Comando executado:

```bash
node --test functions/test/bookRestoreContentRead.test.mjs functions/test/bookRestoreValidation.test.mjs functions/test/bookRestoreLegacyValidation.test.mjs functions/test/bookRestoreUpload.test.mjs functions/test/bookRestoreIntegrity.test.mjs functions/test/bookRestoreRecovery.test.mjs
```

Resultado final:

```text
tests 71
pass 71
fail 0
skipped 0
duration_ms 1983.7372
```

Quinze novos: equivalência de JSON/raw e ausência de writes, seis legados,
autorização/estado/limites, cancelamento depois da preparação, ABA de ponteiro,
recibo criador/recibo inicial, chunk/prova/snapshot/controle, fonte modificada,
multipartes/Unicode, PNG, índice legado e falha transitória. Os demais são
regressões dos serviços compartilhados. Nenhum limite de cobertura foi alterado.

A revisão acrescentou uma regressão de recriação do recibo inicial depois da
abertura: primeiro falhou e, após fixar/reconferir seu token nativo, passou.
Uma prova recriada invalida a observação anterior; leitura nova ainda pode conferir
a prova do chunk original inalterado. Isso não equivale a recriar o chunk.

## SDK Firestore real

Emulador 1.22.0, JAR verificado e porta efêmera em loopback, sem produção.
Seis testes distintos nos dois arquivos SDK existentes foram aprovados:

```text
tests 6
pass 6
fail 0
skipped 0
duration_ms 114485.9819
```

Depois da correção do pin do recibo inicial, repetidos somente os dois testes
afetados, com o novo caso nativo de recriação desse recibo:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 69630.737
```

Lê todos os itens dos dois formatos com SDK Admin, raw de histórico vazio e
rascunho BOM/Unicode, verify na mesma transação do sentinela; confirma recusa de
ponteiro/índice/recibo recriados. Dono/outro/anônimo continuam sem read/list/write
nos namespaces privados. Mantém regressões de commit nativo/replay/CAS/cleanup.

A primeira execução teve 5/6: um teste presumiu updateTime novo ao gravar payload
idêntico. Firestore pode tratar esse set como no-op. Corrigido para delete/create
efetivo, sem enfraquecer a verificação de nascimento, e as execuções acima passaram.
Logs PERMISSION_DENIED são os asserts negativos esperados.

Runner privado run-book-structure-sdk.mjs; logs m20-content-reader-final-emulator.log
e m20-content-reader-birth-final-emulator.log fora do Git. Ambos encerraram com
código zero. Fixture Node não substitui prova de timestamps/Rules nativos.

## Outras validações e limitações

Lint dirigido, formato, check sintático de Functions, arquitetura, documentação
e diff passaram. Nenhuma UI, tipo TypeScript ou caminho de bundle foi alterado;
typecheck/build/navegador não foram repetidos. Não se testou Auth/App Check de
produção nem endpoint implantado. Não há restauração final para verificar pela UI.

Validate integral fica no fechamento de P1 conforme orientação do operador.
CI ignorada; sem push, atualização de PR, merge ou deploy. A regra nova em AGENTS
exige verificação transacional do leitor; CLAUDE continua apontando ao AGENTS.
Os dois textos da decisão de rascunho ainda precisam ser gravados pelo materializador.

## Como verificar

Executar o teste Node dirigido acima. Para SDK, usar os arquivos
bookRestoreValidation.rules.test.mjs e bookRestoreLegacyValidation.rules.test.mjs
com emulador local e SDK reais. Inspecionar que a raiz reservada permanece ausente
e que a transação consumidora recusa provas antigas após cancelamento ou ABA.
