# P1 / M30 — Reconciliação dos recursos preparados

## Objetivo e requisitos

Recalcular contagens e prontidão do índice de referências antes de continuar a
restauração para personas, preservando raiz ausente e countReady false.

- Novo escritor interno advanceBookRestoreCounts, sem API pública ou UI.
- Varrer os recursos por cursor independente pelo leitor verificado, conferindo
  item.verify(tx) e os pares nativos/journals antes dos derivados.
- Cenas contam seu corpo integral; agrupador conta todas as cenas, inclusive
  arquivadas, mas suas palavras somente quando ativas. Sem capítulo e pai
  removido não contribuem ao manuscrito. Não inventar capítulos removidos.
- Reutilizar createWorkProgressLedger, preservando contribuição legada já M22,
  com buffer de escritas e guardas de artefatos. Não atualizar a raiz.
- Preservar fonte congelada, ponteiro/pins de corpos, ordem A/B e datas novas
  fixadas na preparação. Campos derivados usam baseline de revisão 1 quando
  houver estrutura; não copiar revisões operacionais antigas.
- Recontar referenceCount por vínculo nativo único; duplicatas portáteis não
  incrementam duas vezes. Não resolver origens externas nem inventar fonte
  narrativa removida. Consultas do journal são limitadas e com cursor validado.
- Preparação v4, inventário v8 e controle tipado entity-index-control antes de
  criá-lo. Preservar leitura/cleanup v1–v7. Certificar controle/journal ausentes
  na migração; fase final grava complete true no índice só após recursos conferidos.
- Reutilizar artefato e journal quando qualquer substituição v8 for idêntica,
  preservando updateTime real do Firestore e prova do recibo.
- Cursor/contagens/artefatos/journal/recibo atômicos e clone por tentativa;
  confirmar replay histórico e permitir cancelamento em todas as etapas.
- Encerrar em phase personas sem consumir o primeiro item seguinte.
  Prontidão do manuscrito só muda junto da ativação futura, não nesta etapa.

## Tarefas e aceites

1. [x] Leitura autenticada dos artefatos e compatibilidade v8/no-op.
2. [x] Reconciliação de cenas/agrupadores/ledger e vínculos únicos.
3. [x] Finalização privada do índice, progresso v4 e replay/cleanup.
4. [x] Testes dirigidos Node/SDK, revisão, documentação e commit local.

## Suposições, riscos e não escopo

A origem portátil já passou pela validação integral e materialização M22–M29.
A raiz permanece ausente. Faltam personas, histórico/rascunho/capa, representação
dos campos grandes, autorização final e certificação integral de ativação,
host/UI, roundtrip e validate de P1. Nenhuma dessas validações é declarada pronta.

A contagem deriva dos textos nativos comprovados contra hashes do item validado.
O índice sinaliza apenas completude estrutural; a consulta continuará reautorizando
a origem. Controles derivados não constituem permissão de publicação ou acesso.
A implantação futura exige leitores/cleanup antes de habilitar o produtor.
Sem nova dependência, Rule, crédito, push, CI ou deploy.
