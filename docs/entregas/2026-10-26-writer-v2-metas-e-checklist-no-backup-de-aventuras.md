# Writer V2 — metas e checklist no backup de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: 5cac1f7.
[Plano 152](../tasks/writer-v2/execucao/152-metas-e-checklist-no-backup-de-aventuras.md),
[ADR 0175](../decisions/0175-adventure-backup-project-preparation.md).

## Escopo entregue

Duas definições do leitor existente capturam escolhas de progresso e checklist
privado. Codec conserva estado editorial, meta total nullable e data declarados;
tarefa conserva texto/conclusão/datas. Controle ausente segue explícito. Não
copia contadores/jobs nem preferências/atividade da conta.

Somente adventureBackupResources muda no código; leitor/writers/Rules/runtime/
persistência/UI/dependências permanecem. Novos testes Node e SDK, plano/ADR/docs.

## Validação dirigida real

Três arquivos Node selecionados (progresso, cenas/blocos e narrativa):

```text
ℹ tests 115
ℹ pass 115
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 414.6244
```

21 novos e 94 regressões. Produtores reais criam meta, tarefas, renomeiam,
concluem e removem; 53 membros, ausência/null/vazio/zero, contadores inválidos
omitidos, metadata sem título, nenhuma leitura de users/escrita, native change/
ABA do controle/item, owner/schema/flags, codec e autorização.

SDK real no Firestore Emulator 1.22.0 verificado, loopback/projeto demo:

```text
# tests 1
# pass 1
# fail 0
# skipped 0
# duration_ms 7311.7541
M64 targeted adventure SDK passed
```

Cenário usa produtores reais: controle inicialmente ausente, meta, 53 tarefas,
conclusão/renomeação/exclusão, 52 atuais em duas páginas, máscaras sem título,
valores próprios/hash, tokens antigos após criação/recriação, Rules/conta e
leituras sem alterar updateTime. PERMISSION_DENIED negativo esperado.

Lint dirigido passou; sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate completo somente no fechamento de P2,
conforme orientação do operador; resultado de P1 não certifica fonte posterior.

## Revisão e pendências

Reuso não adiciona caminho aberto ou necessidade de contador coerente. Campos
owner/schema não são inventados no documento legado de tarefa. Fuso/atividade
permanecem estado da conta; nova cópia reconstruirá controles derivados.
Sem bloqueador identificado neste recorte interno.

Histórico, personas/mídia, selo/pacote/revisão/restauração/UI, roundtrip e
validate P2 continuam pendentes. P2/P3/D, F2-09 e demais fases/gates abertos.
Somente commit local, sem CI/push/PR/merge/deploy/subagentes.
