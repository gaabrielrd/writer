# Writer V2 — narrativa no backup privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: d5efcd2.
[Plano 150](../tasks/writer-v2/execucao/150-narrativa-no-backup-de-aventuras.md),
[ADR 0173](../decisions/0173-adventure-backup-narrative-resources.md).

## Escopo entregue

Sete famílias acrescentam arcos, cronologia, marcos, controles determinísticos
de ordem e links narrativos ao leitor interno de recursos. Prosa inline,
data livre e ranks permanecem literais. Marco/link dependem de seus heads
autorizados; alvo indisponível não vira fallback global. Ausência de controle
é explícita, sem inventar A. Índices derivados não entram no DTO.

Arquivos alterados: adventureBackupResources e adventureBackupResourceRead;
novos testes Node e SDK específicos, plano/ADR/docs/evidência. Sem novo writer,
Rule, endpoint, frontend, namespace persistido ou dependência.

## Validação dirigida real

Seleção de quatro arquivos Node de fonte/estrutura/recursos/narrativa:

```text
ℹ tests 158
ℹ pass 158
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 576.7703
```

40 novos casos e 118 regressões, sem somar execuções. Produtores reais criam
arco/evento/marco e três tipos de referência; alvo global é retirado sem perder
vínculo neutro próprio. Inclui 53 eventos, rebalance em lotes para rank B,
texto grande Unicode/BOM, vazio/ausência/zero, ordem nativa, controles ausentes,
mudança/recriação de item/source/arco, schema/dono/backlink, recusa de marcador
externo, índices derivados fora, intenção capturada e falha/retry sem escrita.

SDK real no Firestore Emulator 1.22.0 verificado, loopback e projetos demo:

```text
# tests 5
# pass 5
# fail 0
# skipped 0
# duration_ms 11673.5812
M62 targeted adventure SDK passed
```

Dois novos cenários de narrativa + três regressões de cenas/blocos. Narrativa
usa 52 eventos dos produtores reais, reorganização concluída, sete famílias,
projeções sem prosa, datas, SHA integral, ancestrais físicos, nascimento do
controle opcional, autorização/Rules e retry sem mudar updateTime.
PERMISSION_DENIED nos casos negativos é esperado. Nenhuma nova prova visual
ou de produção é alegada.

Lint dirigido passou. Sintaxe, docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate completo fica no fechamento de P2, conforme
orientação do operador; validate de P1 não certifica fonte posterior.

## Revisão e pendências

Somente ordens conhecidas são endereçadas; milestone-order usa coleção raiz,
sem inventar subcoleção sob arco. Source de link é lido com máscara de campos
estruturais e exige mesma origem autorizada; seu alvo não concede nada. Codec
projeta endereços neutros e omite chaves derivadas e labels.

Não identificado bloqueador neste recorte interno. Lore/demais famílias,
histórico/progresso/checklist/personas/mídia, selo/pacote/revisão/restauração/UI
e roundtrip ainda pendentes. P2/P3/D, F2-09 e demais fases/gates seguem abertos.
Somente commit local; sem CI, push, PR, merge, deploy ou subagentes.
