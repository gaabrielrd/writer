# Writer V2 — Catálogo e normalização legados retomáveis (P1 M18)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, local.
- **Plano:** [contrato 51](../tasks/writer-v2/execucao/51-catalogo-e-normalizacao-legados.md).
- **Decisão:** [ADR 0062](../decisions/0062-legacy-book-normalization-checkpoints.md).
- **Estado:** marco interno; P1/F2-09 e a V2 inteira permanecem abertos.

## Objetivo e funcionalidades

Catálogo e normalização de backups JSON v1–v6 podem pausar e retomar por estados
serializados, sem guardar prosa no checkpoint. O leitor atual usa os mesmos
passos, preservando procedência, conteúdo próprio, vínculos, contagens e avisos.

Um passo aceita um span no catálogo ou valida um perfil/grupo/emite um registro
na normalização. Cenas e narrativa avançam entre referências, com testemunho
do item em andamento. Releitura de registro confere identidade/hash e consulta
índices existentes sem gravar ou recriar entradas ausentes.

## Critérios de aceite

- [x] Catálogo e descriptor serializáveis, metadata-only.
- [x] Normalizador único, com posições e unidade limitada.
- [x] Seis formatos preservam DTOs, avisos, ranks, perfis e origem.
- [x] Fanout retomável, sem lista/texto no cursor.
- [x] Item em andamento divergente e cursor incompatível recusados.
- [x] Falha/abort preserva cursor; host continua responsável pelos efeitos.
- [x] Releitura não escreve índice e recusa identidade/hash/entrada divergentes.
- [x] Regressões dirigidas e documentação.
- [ ] Integração ao job servidor, snapshot ampliado/versionado e provas SDK.
- [ ] Remapeamento/mídia/ativação, host protegido/UI/roundtrip e validate P1.

## Arquivos alterados

bookLegacyCatalog extrai estado/aceitação/finalização/item; bookLegacyNormalize
centraliza fases/projeções e readback; bookLegacyReview passa a ser o adaptador
do fluxo. functions/package.json inclui o módulo novo no check sintático.
A fixture dos seis formatos saiu do teste existente para helper compartilhado,
sem alteração dos dados. Novo teste de normalização cobre as retomadas.
Plano, execução, README/arquitetura/testes, ADR e este registro atualizados.

Sem dependência nova, callable, Rule, coleção ou interface. Nenhum livro,
histórico, mídia ou permissão foi criado por este marco.

## Testes Node

Comando:

```bash
node --test functions/test/bookLegacyNormalize.test.mjs functions/test/bookLegacyReview.test.mjs functions/test/bookLegacyJSON.test.mjs
```

Saída final real:

```text
tests 29
pass 29
fail 0
skipped 0
duration_ms 656.9814
```

Treze novos, onze de domínio e cinco de scanner. Descriptor e cursors passam
por JSON em cada unidade, com novo adaptador de índice/host semântico. Incluem
205 referências, grupo sem capítulo, fontes originais, ranks B, persona ausente,
corpo global de 9 MiB ignorado, falha de índice/abort, origem alterada, estados
inválidos, recibo fechado e readback de todos os registros. Recusa de índice
ausente não o recria.

Probe diferencial privado: **85 casos**, 41 aceitos/44 recusados, **540 ms**,
contra catálogo/normalização do commit d8f2657. Aceitação e códigos de erro,
relatórios completos e entradas do índice coincidiram. Fixtures incluem os
seis arquivos do exportador real, ordem/BOM/ausências, dados inválidos e fanout.
Não é verificação exaustiva ou integração servidor. Artefatos
m18-normalization-differential.mjs/json ficam fora do Git.

## Cliente e navegador

Vitest dirigido: **8/8**, dois arquivos em **1,56 s**, inspeção/interoperabilidade.
O exportador usa APIs autorais simuladas; não é prova de backend/Auth.

Chromium/File/OPFS real: **14 cenários**, **4.045 ms**, processo zero.
Seis arquivos v1–v6, futuro/corpo adulterado/abort com limpeza, cursor lexical,
catálogo/normalizador serializados e núcleo semântico em novas instâncias.
Releitura de todos os registros consulta o índice OPFS cifrado sem chamar add.
A composição independente coincidiu em totais/avisos com o leitor público.

Na amostra v6: **18 registros**, **23 passos**, cursor de até **618 bytes**.
O caminho público instrumentado fez 98 leituras, maior leitura 6.741 bytes.
Sem runtimeErrors ou blockedRequests; índice temporário removido.
Probe/JSON m18-legacy-native estão fora do Git; artefatos anteriores preservados.

Esses resultados não provam ativação de livro, endpoint de legado ou Auth/App
Check produtivos. Firestore/Storage e Rules não mudaram; SDK não foi repetido.

## Validações e revisão

Typecheck, lint dirigido, check sintático de Functions, bundle e smoke passaram.
Bundle mantém os avisos conhecidos de chunks grandes/imports dinâmicos ineficazes.
Formato, documentação, arquitetura e diff passaram; revisão sem bloqueadores
no escopo deste marco. Hooks mantidos habilitados.
Nenhum limite/asserção antigo foi reduzido; sem dependência nova.

Validate integral permanece para o fechamento P1, por orientação do operador.
Sem CI, push, PR, merge ou deploy. Checkout original E: preservado.

## Limitações e próximo passo

Os passos são internos e não autorizam a origem por si. Ligação ao servidor M16
ainda precisa preparar/confirmar efeitos e cursor atomicamente, revalidar todos
os chunks/índices lidos e ampliar/versionar snapshot antes de persistir estados.
O teto atual de 64 KiB não deve rejeitar cursores lexicais válidos de até 512 KiB.

A restauração integral e a política pendente de draft continuam no plano.
O endpoint de validação ainda retorna legacy-validation-pending para JSON antigo.

## Como conferir

Rodar o comando Node dirigido acima e os dois testes cliente registrados em
docs/testing.md. Não existe botão de restauração final neste marco.
