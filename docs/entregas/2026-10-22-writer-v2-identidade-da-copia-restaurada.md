# Writer V2 — Identidade da cópia restaurada (P1 M21)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 54](../tasks/writer-v2/execucao/54-remapeamento-da-identidade-restaurada.md).
- **Decisão:** [ADR 0065](../decisions/0065-restored-book-identity.md).
- **Estado:** marco interno validado; P1/F2-09 e Writer V2 permanecem abertos.

## Objetivo e funcionalidades

O leitor servidor prepara os novos IDs e referências dos itens já validados.
A identidade é estável em serviços novos e isolada por pedido/tipo/pai. Preserva
recursos históricos removidos sem recriar capítulos/cenas atuais, origens externas
sem grant e o texto integral sem substituições de IDs dentro da prosa.

Relações de lore são remapeadas em páginas de até 64 com prova transacional. IDs
locais parecidos com descriptors externos são resolvidos pelo índice validado.
Perfis usados compartilham ID custom novo e snapshot íntegro; ausentes não adotam
perfil da conta atual. Raw recebe identidade nova e mantém bytes/hash/provas M20.

## Aceites

- [x] IDs determinísticos, domínio versionado, tipos e pai de marco separados.
- [x] Todos os tipos JSON/raw e vínculos locais remapeados, singleton preservado.
- [x] Histórico de recursos removidos e rascunho não viram recursos atuais.
- [x] Perfis repetidos/presets preservados; ausência continua indisponível.
- [x] Prosa/traits/ranks/hash/datas fonte preservados; referências externas neutras.
- [x] Relações limitadas, com prova de presença e ausência e revogação de uso.
- [x] Leitor original compatível, sem writes ou novo endpoint.
- [ ] Inventário/esquema e escritores nativos de materialização/ledger/perfis/mídia.
- [ ] Reautorização/ativação, host/UI/roundtrip e validate integral P1.

## Arquivos alterados

Novo bookRestoreRemap e integração em bookRestoreContentRead. Check sintático
inclui o módulo. Helper de contêiner aceita bookId opcional mantendo o default;
novo collector exclusivamente de testes monta pacote remapeado e exercita provas.

Novos testes Node e SDK. README, arquitetura, testes, plano P1/execução, ADR e
AGENTS atualizados. Sem dependência, coleção, Rule, callable, escrita de livro,
Storage, perfil, direito ou crédito. A prova de consumo é um sentinela de teste.

## Testes Node dirigidos

Comando executado:

```bash
node --test functions/test/bookRestoreRemap.test.mjs functions/test/bookRestoreContentRead.test.mjs functions/test/bookRestoreValidation.test.mjs functions/test/bookRestoreLegacyValidation.test.mjs functions/test/bookContentMachine.test.mjs functions/test/bookBackupContent.test.mjs functions/test/bookBackupCursor.test.mjs
```

Resultado:

```text
tests 83
pass 83
fail 0
skipped 0
duration_ms 2418.7947
```

Quinze testes novos cobrem identidade/tipos/pedido/Unicode/IDs hostis, todos os
campos, histórico removido, snapshots/traits/overrides, origem e referências,
chaves nativas, capa/raw, pacote integral remapeado, seis legados, 130 relações
em páginas, ABA/ausência/cancelamento, estilo ausente e array vazio/ausente.
Demais testes são regressões dos sete módulos afetados pelo leitor/helper.

Depois de acrescentar um vetor SHA-256 independente calculado em Python, repetido
apenas o arquivo afetado: 15/15, sem skip, duration_ms 738.3973. Sem redução de
asserts/cobertura ou mudança do limite do arquivo.

A primeira execução dos novos testes tinha premissas incorretas: Own prose
pertence ao lore da fixture e v5/v6 incluem deliberadamente um estilo ausente.
Os casos estritos agora fornecem esse perfil; há teste separado que mantém
a ausência indisponível. Não se inventou perfil nem se relaxou o validador novo.

## SDK Firestore real

Emulador 1.22.0, JAR verificado, porta efêmera em loopback; dois casos novos:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 84771.8226
```

1. Arquivo novo passa por upload/integridade/validação; reader remapeia tudo,
   pacote reconstruído passa no validador completo com os mesmos totais/avisos,
   lore local parecido com universo ganha precedência, externo e descrição literal
   permanecem. verify aceita sentinela na mesma transação. Recriar índice idêntico
   depois bloqueia consumo e nova leitura. SDK de dono/outro/anônimo continua
   negado; raiz reservada permanece ausente.
2. JSON v6 conserva estilo ausente sob nova identidade sem perfil fabricado.
   Serviços novos produzem mesmos registros/valores; cancelamento bloqueia
   verificação de item preparado e novas leituras. Nenhum livro criado.

Runner privado run-book-structure-sdk.mjs, log m21-remap-emulator.log fora do Git,
processo final exit 0. Logs negativos SDK são esperados. Esses testes usam
Admin/Rules reais com emulador, não Auth/App Check de produção ou endpoint implantado.
Fixtures/collector não comprovam UI ou criação de documentos nativos.

## Outras validações e pendências

Lint dirigido, formato, check sintático de Functions, arquitetura, documentação e
diff passaram. Duas correções de lint restritas a testes: const para binding que
não é reatribuído e condição finita do collector. Sem mudança de produção após SDK.

Não houve mudança de UI/tipo TypeScript ou bundle: typecheck/build/navegador não
foram repetidos. Validate integral continua para o fechamento do grande bloco P1,
conforme orientação do operador. CI ignorada, sem push/PR/merge/deploy.

DTO remapeado ainda não é documento nativo. Crescimento pelos IDs novos, limites
de documentos, estilo legado ausente, contagens de relações derivadas distintas,
visibilidade de perfis/mídia e inventário de limpeza precisam ser tratados nos
writers. Não truncar textos/relações para satisfazer o armazenamento. Salvo e
rascunho diferente continuam separados pela decisão do operador, sem writer entregue.

## Como verificar

Executar o comando Node acima e o arquivo SDK bookRestoreRemap.rules.test.mjs com
emulador local. Conferir pacote remapeado, igualdade do raw, ausência da raiz
e rejeição da prova preparada após ABA/cancelamento. Não há fluxo final de
restauração pela UI neste marco.
