# Writer V2 — lore próprio no backup privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: b0015dd.
[Plano 151](../tasks/writer-v2/execucao/151-lore-proprio-no-backup-de-aventuras.md),
[ADR 0174](../decisions/0174-adventure-backup-local-lore-pairs.md).

## Escopo entregue

Novo adventureBackupLoreRead captura metadata e corpo atuais em duas famílias.
Comprova pares e tombstones pela identidade nativa da aventura, conta/revisão
e fonte no mesmo snapshot. Lista metadata sem texto; lê unidades até 64 KiB
com SHA integral. Corpo órfão/ausente, revisão divergente, raiz recriada e
marcadores externos falham, sem stub ou adoção por coincidência.

Prosa própria, estruturados e relações neutras permanecem literais mesmo com
universo/alvo indisponível. DTO exclui identidade operacional/revisões/recibos;
ficha removida mantém somente estado/datas, sem corpo nem prosa inventada.
Sem writer, Rule, runtime, frontend, persistência ou dependência novos.

## Validação dirigida real

Seleção final dos seis arquivos Node de leitores e produtor de lore:

```text
ℹ tests 204
ℹ pass 204
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 476.0763
```

37 novos casos de backup de lore, nove regressões do produtor nativo e 158
regressões de fonte/estrutura/cenas/narrativa. Inclui produtores reais, 53 pares,
tombstone, corpo grande Unicode/BOM, ausência/vazio, máscara sem prosa, relação
retida com alvo global removido, par/owner/schema/revisão/nascimento, root
recriado, corpo órfão/reaparecido, valores corruptos recusados sem normalização,
cursor/escopo/conta, intenção capturada, erro/retry e nenhuma escrita.

Seleções anteriores: 24 novos casos passaram em 160,1728 ms; depois 46 casos
(lore + produtor) passaram em 191,3183 ms. Não somar execuções como casos distintos.

SDK real no Firestore Emulator 1.22.0 verificado, loopback e projeto demo:

```text
# tests 2
# pass 2
# fail 0
# skipped 0
# duration_ms 12376.9785
M63 targeted adventure SDK passed
```

Dois cenários usam produtores reais para 52 fichas ativas e uma removida,
máscaras nativas, 53/52 membros paginados, bytes/hash/prosa/relações, nenhuma
leitura de universo/users, nascimento de head/corpo, recriação da raiz,
conta/Rules e falha/retry sem mudar updateTime.

Primeira seleção SDK teve um pass e uma falha (13.283,0171 ms): o teste buscava
tombstone somente na segunda página, mas ordenação por ID o posicionou na primeira.
Corrigida a seleção para ambas as páginas, mantendo assertions/ordem/Rules e
código de produção; os dois cenários foram repetidos. Runner final usa o mesmo
ID demo do teste para evitar o aviso de projeto diferente do emulador inicial.
PERMISSION_DENIED registrado nos casos negativos é esperado.

Lint dirigido passou; sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate de P1 não certifica esse código novo;
validate integral fica no fechamento do bloco P2, por orientação do operador.

## Revisão e pendências

Reuso explícito dos contratos nativos preserva nascimento e revisão do par,
sem lookup global. Listagem de corpos físicos também detecta órfão. Tombstone
é inventariado como removido; restauração futura não deve ressuscitar ficha.
Sem bloqueador identificado neste recorte interno; não é selo/backup integral.

Histórico/progresso/checklist/personas/mídia, selo/pacote/revisão/restauração/UI,
roundtrip de aventura e validate integral continuam pendentes. P2/P3/D, F2-09,
demais fases e gates abertos. Somente commit local; sem CI, push, PR, merge,
deploy ou subagentes.
