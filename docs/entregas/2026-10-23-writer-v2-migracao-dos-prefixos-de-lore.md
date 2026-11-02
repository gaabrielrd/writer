# Writer V2 — Migração dos prefixos inline de lore (P1 M38b2)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [tarefa 79](../tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md)
- Decisão: [ADR 0090](../decisions/0090-legacy-lore-prefix-migration.md)

## Funcionalidade e critérios

O preparador privado passa a retomar lores com páginas inline já gravadas.
Reconstrói todas as relações em payloads sem descartar o prefixo durante a cópia
ou contar suas relações duas vezes.

- [x] Origem nativa e base/tamanho/posição do prefixo conferidos.
- [x] Contagem inicial autenticada pelo último recibo imutável do prefixo.
- [x] Prefixo preservado até a troca final; metadata reconferida em cada unidade.
- [x] Somente o excedente aumenta loreRelationCount, incluindo outros lores anteriores.
- [x] Nascimento nativo e primeiro recibo/journal preservados no replace atômico.
- [x] Recibos antigos resolvíveis durante, depois e após cancelamento.
- [x] Rollback/CAS/retry e cancelamento em cada etapa; recriados preservados.
- [x] Jobs M38b sem legacy continuam compatíveis; sem namespace/inventário novo.
- [x] Raiz ausente e preparação privada, sem liberação de consumidores/UI.

## Arquivos

BookRestoreLorePrefix concentra captura, prova original e delta de contagem.
BookRestoreLorePayload integra o replay físico e o replace final; Contracts
aceita legacy opcional fechado. Functions check inclui o módulo. Fixture v6,
testes Node/SDK, plano, ADR, AGENTS e documentação registram comportamento/provas.

## Validação real

**60 testes backend distintos positivos**, em três arquivos afetados.
A regressão inicial reuniu os escritores inline, payload e migração:

```text
tests 58
pass 58
fail 0
skipped 0
duration_ms 17659.522
```

Depois passaram isoladamente dois cenários adicionais: cursor/contador inicial
adulterado antes da migração e avanço de um prefixo migrado por todas as fases
até inventário v14/preparação v12, com cancelamento e recibo antigo intactos.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 1563.3425
```

São 23 cenários novos e 37 existentes, sem somar repetições. Cobrem prefixos de
64/128, totais de 65/128/130/200, outros lores já contabilizados, replay a cada
unidade/reload, recriação de lore/journal/primeiro/último recibo, mudanças de
progresso e cancelamento antes, em partes, cabeçalho, relações e pronto para troca.
Falhas injetadas após preparar alvo/chunk e journal confirmam rollback; retry
do mesmo request e concorrência não duplicam o lote nem o contador.

**Dois cenários SDK reais positivos**, Firestore 1.22.0 verificado e loopback dedicado:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 255977.4694
```

O primeiro usa arquivo válido com 200 relações extensas, grava nativamente um
prefixo v6 de 128 e o migra para quatro páginas. Confere todo o texto/ordem,
nascimento do lore e primeiro journal preservados; última alteração igual ao
novo recibo. O total global vai de 130 a 202 porque outro lore já tinha duas
relações. Reconciliação e cancelamento passam, e recibos antigos ainda resolvem.

O segundo recria o prefixo durante a migração. O avanço falha sem aumentar
checkpoint; o cancelamento bloqueia e preserva a nova encarnação. Nenhuma raiz
sintética ou ativação é usada nesses testes.

A fixture reproduz o protocolo anterior em transações reais; não executa um
binário antigo e não fabrica timestamps nativos. As identidades são produto
dos commits reais de alvo/journal/job/recibo.

Sintaxe de Functions, arquitetura, lint dirigido, formatação, links e diff
passaram. Nenhum código cliente mudou; Vitest/tipos/build e jornadas visuais não foram repetidos.
Validate integral fica no fechamento de P1, conforme o usuário.

## Limitações e próximo passo

Ainda não há migração executada em produção nem restauração grande concluída
pela UI. Implantar parsers e drenar handlers anteriores antes de habilitar.
M38c deverá integrar leitura, assinatura, edição/exclusão, backup e exclusão de
livro ativo. Demais campos grandes, saída portátil ampliada, certificação
integral, capa/biblioteca, ativação, limpeza posterior e host/UI/roundtrip/validate
continuam pendentes. P1/F2-09 e Writer V2 abertos.

Somente commit local; CI ignorada, sem push/PR/deploy.
