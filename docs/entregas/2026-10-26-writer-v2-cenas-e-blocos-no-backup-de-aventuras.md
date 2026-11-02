# Writer V2 — cenas e blocos no backup privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: b520ac0.
[Plano 149](../tasks/writer-v2/execucao/149-cenas-e-blocos-no-backup-de-aventuras.md),
[ADR 0172](../decisions/0172-adventure-backup-scene-block-resources.md).

## Escopo entregue

Leitor interno acrescenta controles de ordem, cenas, corpos, planejamento,
referências e blocos adicionais. Lista metadata paginada e lê unidades de até
64 KiB. Cada leitura confere fonte/conta e identidades nativas do item e dos
heads necessários. Corpo exige SHA do próprio texto igual ao hash do head.

Codec preserva texto literal, ranks, arquivo, relação com parte retirada,
tipo/audiência/ordem e metadados neutros de imagem/persona. Referência não copia
labels ou prosa global. Presença opcional ausente é distinta de texto vazio;
corpo obrigatório ausente não vira stub. Classificação legada não é inventada,
nem agregado de palavras usado como requisito de preservação.

Arquivos: adventureBackupResources, adventureBackupResourceRead e exportação
interna do validador de parte já existente; testes Node e SDK próprios.
Sem frontend, callable, Rule, writer, dependência ou armazenamento novo.

## Validação dirigida real

Seleção final de fonte, estrutura e recursos:

```text
ℹ tests 118
ℹ pass 118
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 366.1354
```

São 54 casos novos de recursos e 64 regressões. Incluem produtores reais de
Estúdio/cenas/blocos, arquivo e retirada de parte em lotes, 53 cenas, máscaras
sem prosa, Unicode/BOM, faixas/hash/reabertura, ausências, vínculos neutros,
valores legados, autoria/escopo/cursores, mudanças/recriação das dependências,
hash/corpo externo, falha/retentativa sem escrita e intenção capturada.
A seleção inicial de 113 também passou; não somar como casos distintos.

SDK real em Firestore Emulator 1.22.0 verificado, loopback e projeto demo:

```text
# tests 3
# pass 3
# fail 0
# skipped 0
# duration_ms 11792.0326
M61 targeted adventure SDK passed
```

Cobre 52 cenas dos produtores reais, as oito famílias, projeções nativas,
paginação, corpo grande, bytes/hash, referência sem origem resolvida, nascimento
nativo de corpo/bloco/cena, planner ausente, Rules para outro/anônimo e escrita
direta, autorização no serviço, conteúdo adulterado e retry sem alterar
updateTime. PERMISSION_DENIED registrado é a recusa esperada de escrita.
Primeira execução SDK também passou (11.613,627 ms); após a captura única de
kind, a seleção foi repetida sobre a versão final. São três casos distintos.

Lint dirigido e sintaxe dos três módulos passaram. Checks de documentação,
arquitetura e styleguide passaram; formatação/diff são conferidos no preflight. Validate completo será executado no
fechamento do bloco P2, conforme orientação do operador. Validate de P1 não
certifica este código novo. Nenhuma nova prova visual ou de produção é alegada.

## Revisão e pendências

Captura kind uma vez e mantém parentId/índice/IDs/tokens anteriores a qualquer
espera. Dependência adicional liga bloco à cena dona, sem adotar órfão. Leitor
não resolve imagem, persona ou referência por coincidência. Parte retirada
permanece pista literal e não é recriada. Não há bloqueador identificado neste
recorte interno; as limitações abaixo permanecem explícitas.

Próximos: narrativa/lore e demais famílias, histórico/progresso/checklist,
personas/mídia, selo/pacote completo, revisão/restauração/UI e roundtrip.
P2/P3/D, F2-09, demais fases e gates continuam abertos.
Somente commit local; sem CI, push, PR, merge, deploy ou subagentes.
