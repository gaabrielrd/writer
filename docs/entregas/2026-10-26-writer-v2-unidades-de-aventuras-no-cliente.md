# Writer V2 — unidades de aventura por partes no cliente

Data: 2026-10-26. Branch codex/writer-v2. Base: 46dc6b2.
[Plano 161](../tasks/writer-v2/execucao/161-leitura-limitada-das-unidades-de-aventuras.md),
[ADR 0183](../decisions/0183-adventure-client-unit-stream.md).

## Entrega e limites

Leitor JSON por ranges de até 64 KiB, com identidade/escopo/presença fechados,
base64 canônico, manifesto estável e SHA incremental de todo o corpo.
Fonte/item/options/port são fixados antes de next; somente término natural
devolve prova unit-bytes-only. Sem buffer do corpo/projeto inteiro ou cap autoral.
Essa prova não certifica semântica do pacote/histórico/PNG ou autoriza grants.

return resolve sem aguardar RPC pendente, sinalizando encerramento agora e
observando conclusão interna. Próxima parte depende do consumo da anterior;
conta/abort/falha impedem emissão tardia ou prova. Manifesto congelado não retém
base64/prosa. Whitelist recusa propriedades herdadas do registro.

## Validação dirigida real

Seleção completa do arquivo novo:

```text
Test Files  1 passed (1)
Tests       24 passed (24)
Duration    2.73s
Tests time  866ms
```

Primeiro bloco tinha 23 positivos (937 ms em 2,96 s). Revisão acrescentou
encerramento que resolve antes da liberação do RPC e erro explícito do consumidor.
24/24 passaram. Depois, novo assert de nomes herdados reproduziu uma falta de
checagem de propriedade própria: um negativo/um positivo, 22 não selecionados.
Object.hasOwn no contrato corrigiu; seleção final de whitelist + todos os
readers nativos: dois positivos, 22 não selecionados, 132 ms em 1,83 s.

Cenário nativo compõe unidades de raiz, parte, cenas/blocos/controles/planner,
narrativa, lore/corpos, persona e versões/chunks pelos produtores/leitores reais.
Hash Node independente confere bytes emitidos, Unicode/JSON e ranges. Outros
casos cobrem cabeçalho extra/fonte/escopo/ID/token/ordinal/manifesto/presença,
base64 não canônico/maior, corrupção, I/O, mutação de input/port/
response/buffer, backpressure, return antes/depois/durante RPC, conta, abort,
erro do consumidor e persona null sem RPC.

Primeiro typecheck apontou narrowing/definite assignment: helper never em arrow
não era reconhecido para todos os caminhos. Declaração de função explícita
resolveu sem casts permissivos ou relaxar tipos. Lint/types finais passaram.
Bundle isolado do índice público para navegador passou; artefato/log fora do
Git. Não há nova UI/Chromium, SDK ou teste remoto: nenhum handler/writer/Rule/
storage foi alterado. Logs m73-frontend*.log, m73-own-kinds*.log,
m73-types*.log e m73-browser-bundle*.log em writer-v2-portability-qa.

O validate integral de 158 é do estado anterior e não é atribuído a esse código
posterior. Suíte completa volta no fim do grande bloco de captura.

## Revisão e continuidade

Diff confere identidade capturada sincronicamente, DTOs fechados, estado constante,
hash integral antes da última emissão, hasher encerrado e retornos tardios
observados. Nenhuma credencial/dependência/armazenamento local ou fallback vazio.
Checks de docs/arquitetura/formatação/diff são conferidos antes do commit.

Ainda faltam composição das seções, manifestos de história/Storage, drafts,
validação autoral, selo, UI/restauração e roundtrip. P2/P3/D, F2-09 e demais gates
permanecem abertos; contagem 8/35 não muda. Somente commit local, sem
CI/push/PR/merge/deploy/subagentes.
