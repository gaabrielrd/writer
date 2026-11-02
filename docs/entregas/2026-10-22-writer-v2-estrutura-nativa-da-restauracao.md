# Writer V2 — Estrutura nativa e limpeza v4 (P1 M22)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 55](../tasks/writer-v2/execucao/55-preparacao-nativa-da-estrutura.md).
- **Decisão:** [ADR 0066](../decisions/0066-book-restore-native-structure.md).
- **Estado:** marco interno validado; P1/F2-09 e Writer V2 continuam abertos.

## Objetivo e funcionalidades

A restauração passa a preparar atos, capítulos e ledger reais no destino
reservado, ainda sem criar raiz ou expor cópia incompleta. IDs vêm de M21 e
conteúdo de M20; prosa, ordem e vínculos são preservados. Contagem de palavras,
dono, datas e revisões são reconstruídos.

Novo journal liga cada documento ao recibo criador e à atualização atual.
Cancelamento v4 limpa pares por páginas com conferência nativa, preservando
documento alterado/recriado ou estranho. Inventários v1–v3 continuam funcionando.
O próximo tipo fica no cursor resources, sem ser ignorado ou declarado restaurado.

## Critérios de aceite

- [x] Gravação de estrutura por item com CAS/replay, sem raiz visível.
- [x] Prosa exata, metadados e IDs corretos; ledger compartilhado reconstruído.
- [x] Snapshot final de validação permanece íntegro após avanços de preparação.
- [x] Documento/journal/cursor/recibo atômicos com provas nativas.
- [x] Limpeza v4 limitada, certificação vazia e recusa de alteração/ABA/foreign.
- [x] Compatibilidade de versões anteriores e cancelamento dos seis legados.
- [x] Retry automático do callback não acumula cursor ou contadores.
- [x] SDK direto negado e método de estrutura continua interno.
- [x] Falha do limite nativo conserva fonte, texto, checkpoint e ausência de recibo.
- [ ] Cenas/fontes/narrativa/lore, versões/rascunho, representação de campos grandes.
- [ ] Perfis/mídia, autorização/ativação, host/UI/roundtrip e validate integral P1.

## Arquivos alterados

Novos bookRestoreArtifacts e bookRestoreStructure. Upload/Contracts compõem
serviço/progresso/recibos e cleanup v4; Integrity/ValidationCleanup conferem novo
inventário e preservam versões antigas. Validation autentica checkpoint fixado
somente no v4. Functions check inclui módulos novos.

Novos testes Node/helper/SDK. README, arquitetura, testes, plano P1/execução,
ADR e AGENTS atualizados. Nenhuma dependência, Rule ou callable novo. Nenhuma
raiz, mídia, perfil, grant ou crédito criado. materializationArtifacts é privado
pelas regras existentes; documentos preparados ficam inacessíveis sem a raiz.

## Testes Node dirigidos

Comando executado:

```bash
node --test functions/test/bookRestoreStructure.test.mjs functions/test/bookRestoreRemap.test.mjs functions/test/bookRestoreContentRead.test.mjs functions/test/bookRestoreValidation.test.mjs functions/test/bookRestoreLegacyValidation.test.mjs functions/test/bookRestoreUpload.test.mjs functions/test/bookRestoreIntegrity.test.mjs functions/test/bookRestoreRecovery.test.mjs
```

Resultado final:

```text
tests 103
pass 103
fail 0
skipped 0
duration_ms 2369.854
```

Dezessete novos cobrem estrutura/ledger/metadados, snapshot fixado, retries/CAS/
resolver, limpeza limitada, ABA de documento/journal/recibo, namespace estrangeiro,
raiz inesperada, falha de armazenamento sem efeito, seis legados, cancelamento
durante a leitura, filho reaparecido antes da conclusão e callback repetido.
Demais são regressões dos serviços alterados. Sem redução de asserts/cobertura.

A revisão identificou mutação de cursor fora do callback transacional.
Preparação agora é clonada por tentativa; um teste descarta a primeira execução
do callback e repete a operação com os mesmos dados, verificando avanço único.
Essa simulação Node não é prova de retry nativo do Firestore.

## SDK Firestore real

Emulador 1.22.0, JAR verificado, porta efêmera em loopback. Dois novos casos:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 62828.1378
```

Depois do ajuste de clone por tentativa, repetido somente o cenário afetado de
estrutura/journal/limpeza:

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 39804.8092
```

- Arquivo novo prepara oito artefatos reais de estrutura/ledger. createTime de
  documento/journal/recibo criador coincide; updateTime dos dois coincide com o
  último recibo. Prosa BOM/Unicode e contagem preservadas. Dono/outro/anônimo não
  leem/listam preparação. Cleanup em páginas de dois remove os oito pares e
  namespaces, preservando outro livro. Recibo inicial confirma após cancelled.
- JSON v1 com content de 1.100.000 bytes valida como conteúdo, mas o SDK recusa
  a escrita nativa: code 3, campo content maior que 1.048.487 bytes. Job e seu
  updateTime permanecem iguais; nenhum capítulo/recibo parcial; leitor continua
  entregando os 1.100.000 caracteres originais. Recriar o controle preparado
  depois faz o cleanup recusá-lo, preservando documento e journal.

Primeira execução teve dois asserts de teste incorretos: literal Unicode sofreu
mojibake ao escrever pelo PowerShell e regex não incluía a mensagem nativa de
campo longo. Corrigidos com escape Unicode ASCII e code/mensagem observados.
Nenhuma redução do formato ou truncamento foi aplicada para passar.

Runner privado run-book-structure-sdk.mjs; logs m22-native-structure-final-emulator.log
e m22-native-retry-final-emulator.log fora do Git. Execuções acima terminaram
com exit 0. SDK local não comprova produção, Auth/App Check implantados ou UI.

## Outras validações e pendências

Lint dirigido, formato, check sintático de Functions, arquitetura, docs e diff
passaram. Não há mudança de UI, tipo TypeScript ou bundle; typecheck/build/
navegador não foram repetidos. Validate integral fica no fechamento de P1,
conforme orientação do operador. CI ignorada; sem push/PR/merge/deploy.

A limitação de campo grande está demonstrada, não resolvida. Representação grande
e adaptação completa dos leitores/escritores são necessárias antes de concluir
P1. Não reduzir 8 MiB do formato nem tratar falha nativa como arquivo inválido.
A fase resources e todos os demais recursos/ativação/UI também seguem pendentes.

## Como verificar

Executar o comando Node e bookRestoreStructure.rules.test.mjs com emulador local.
Conferir capítulos/ledger e journal via SDK Admin, ausência da raiz e negação SDK;
cancelar e limpar em páginas. Para documento grande, verificar falha atômica e
fonte íntegra, sem afirmar restauração concluída.
