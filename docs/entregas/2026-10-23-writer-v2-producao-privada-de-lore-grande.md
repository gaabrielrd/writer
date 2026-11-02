# Writer V2 — Produção privada de lore grande (P1 M38b)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [produção](../tasks/writer-v2/execucao/78-producao-privada-de-lore-grande.md)
- Decisão: [ADR 0089](../decisions/0089-private-paged-lore-payloads.md)

## Objetivo e resultado

O preparador privado agora preserva lores cujos nomes, aliases, textos ou
relações não cabem num documento Firestore. Dados gerais e páginas de relações
são materializados em partes, reconciliados e canceláveis sem criar a raiz do
livro. Ainda não há restauração de lore grande acessível pela UI.

## Critérios atendidos

- [x] Seleção conservadora da representação sem rejeitar/truncar campos.
- [x] Dados gerais e relações remapeadas, em páginas de 64, com quantidade livre.
- [x] Partes em lotes de até 16; cabeçalho posterior; ponteiro com birth nativo.
- [x] Stub somente ao terminar; sem lista parcial/truncada no documento principal.
- [x] Fonte/CAS/journals/recibos, replay, concorrência, rollback e retry.
- [x] Reconciliação de base e uma página por chamada antes de avançar o item.
- [x] Cancelamento limitado, inclusive partes sem cabeçalho; recriados preservados.
- [x] Raiz ausente e countReady false; nenhum endpoint/Rule/dependência novos.
- [ ] Migração de prefixos inline antigos: [próxima tarefa](../tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md).
- [ ] Consumidores/edição/backup e exclusão de livro ativo: M38c.

## Arquivos e contratos

BookRestoreLorePayload/Contracts/Read cuidam da preparação, progresso e
reconciliação. Lore/ContentRead escolhem a representação; Counts/CountEffects
mantêm o item aberto até verificar todas as relações. Upload/Contracts validam
capacidade/cursor e monotonia dos recibos. Artifacts amplia prova/cleanup com
metadata nativa, sem ler bytes quando só a identidade é necessária.

ResourcePayloadPaths centraliza coleções planas de corpos/partes; emenda de
ADR 0088 antes de qualquer dado de produção. Fixtures e SDK do codec usam os
caminhos novos. Functions check inclui os módulos. AGENTS e documentação
registram a habilitação exclusivamente privada e as condições restantes.

## Testes reais

Regressão dirigida de 35 arquivos: **486 testes backend distintos aprovados**.

```text
tests 486
pass 486
fail 0
skipped 0
duration_ms 48776.1135
```

Inclui inicialmente 15 cenários novos de produção de lore: campos acima de 1 MiB,
ausência/vazio, aliases e detalhes estruturados, descrição grande de uma relação,
5000 relações em 79 páginas, progresso pequeno e até 34 writes por lote de
partes/journals/job/recibo. Também cobre colisões nos três namespaces,
cancelamento antes do cabeçalho, recriação, CAS/replay, rollback, retry e segmento
ausente na reconciliação. A repetição inicial expandida teve 13/14 porque a fixture
de 4097 relações ainda era selecionada corretamente como inline; ela foi aumentada
para 5000. Nenhuma redução de limite ou relaxamento de asserções foi necessário.

Depois, um cenário adicional passou sozinho (1/1, 1862.6234 ms), cobrindo a
capacidade por todas as fases seguintes até inventário v14/preparação v12 e
cancelamento final. Total: **487 backend distintos**, incluindo 16 novos,
sem somar repetições da mesma execução.

Quatro cenários SDK distintos aprovados, Firestore 1.22.0 verificado e loopback
dedicado: dois do codec com caminhos novos e dois da produção de lore.

```text
tests 4
pass 4
fail 0
skipped 0
duration_ms 231291.5212
```

O codec continua preservando objeto sintético acima de 8 MiB em 141 partes.
O fluxo de lore percorre upload/validação/produção/reconciliação/cancelamento
com 130 relações e conteúdo acima de 1 MiB, provas nativas e contagens exatas.
Acesso direto a corpo/parte e escrita do corpo pelo cliente são recusados pelas
Rules atuais. A mensagem PERMISSION_DENIED dessa asserção é esperada.

Uma raiz sintética existe somente durante o harness de Rules e é removida antes
do cancelamento real. Não representa ativação. O outro cenário recria uma parte
antes do cabeçalho, confirma bloqueio de progresso/cleanup e preserva a nova
encarnação. O cancelamento positivo de partes sem cabeçalho também é coberto em
Node; não confundir esse caso com a recusa de recriação no SDK.

Sintaxe de Functions, arquitetura, lint dirigido, formatação, links e diff
passaram. Sem alteração cliente; Vitest/tipos/build e jornadas visuais não foram repetidos.
Validate integral permanece no fechamento de P1, conforme o usuário.

## Limites e continuação

A migração de listas inline antigas já iniciadas permanece aberta. Esses jobs
recebem erro explícito de migração no avanço, sem perder o prefixo/recibos ou
contadores, e continuam canceláveis. Não declarar compatibilidade integral.

Não houve produção real, deploy, ativação ou exposição do stub a consumidores
prontos. Implantar parsers/cleanup e drenar handlers antigos antes de habilitar.
M38c, demais campos grandes, saída portátil ampliada, certificação integral,
capa/biblioteca, ativação, limpeza posterior e host/UI/roundtrip/validate seguem
obrigatórios. P1/F2-09 e Writer V2 abertos; somente commits locais, CI ignorada.
