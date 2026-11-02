# Writer V2 — fonte interna do backup de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: 3cf8823.
[Plano 147](../tasks/writer-v2/execucao/147-portabilidade-privada-de-aventuras.md),
[ADR 0170](../decisions/0170-adventure-backup-root-progress-anchor.md).

## Escopo entregue

Serviço interno lê somente metadata autorizada da raiz/progresso. Âncora nativa
é estável sem mudança e recusa token antigo após alteração/recriação, mesmo com
datas lógicas iguais. Controle ausente é explícito; conta errada, exclusão,
schema futuro, timestamp inválido e port sem máscaras falham sem conteúdo parcial.
Universo indisponível não impede a leitura do próprio; nada de lore global é lido.

Não é backup completo, não certifica cenas/personas/lore/histórico e não foi
conectado ao runtime/cliente. Sem novo endpoint, Rule, dependência ou escrita.

## Testes e validação dirigida

node --test functions/test/adventureBackupSource.test.mjs:

```text
ℹ tests 26
ℹ pass 26
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 110.1388
```

Produtor real do Estúdio com banco em memória, máscaras exatas, nenhum write,
autorização, entrada fechada, raiz/controle alterados e recriados, nascimento
nativo isolado, outra aventura, ausência de controle, mundo indisponível e
metadata inválida. Caso de cena demonstra explicitamente o limite da âncora.
A primeira seleção de 22 também passou; a revisão acrescentou máscara obrigatória,
controle versionado e quatro casos antes da seleção final.

Lint dirigido de módulo/teste passou. Sintaxe/checks de docs/arquitetura/estilo,
formatação e diff são verificados antes do commit. Validate global será executado
no fechamento do bloco P2, conforme instrução de testes necessários por ajuste.
O validate de P1 em 3cf8823 permanece evidência daquele código, sem atribuição a
este incremento. Nenhuma nova prova SDK/Chromium ou de produção.

## Revisão e pendências

Sem bloqueador remanescente neste recorte interno. Próximo: inventário/DTO dos
recursos e captura coerente de estrutura/cenas/blocos; depois demais famílias,
pacote/leitor/restauração/UI e roundtrip. P2/P3/D e fases/gates permanecem abertos.
Este registro é parcial, não uma conclusão da portabilidade de aventuras.
Sem CI, push, PR, merge, deploy ou subagentes.
