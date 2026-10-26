# Writer V2 — formato privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: b349b99.
[Plano 159](../tasks/writer-v2/execucao/159-formato-privado-de-aventuras.md),
[ADR 0181](../decisions/0181-adventure-private-archive-envelope.md).

## Entrega local

Extração literal do algoritmo de framing para fábrica pura e instâncias de livro/
aventura. APIs, declarações, erro e vetor binário de livro preservados. Aventura
tem assinatura WRITER-ADVN LF/versão 1 e erro próprio; decoder fresco recusa livro.

Envelope canônico independente exige oito seções em ordem, tipos conhecidos,
identidade adventure, counts/bytes/footer, selo e EOF. Report declara
envelope-only: não valida semântica autoral nem autoriza restauração/uso.
Cursor/index são de host confiável; não são arquivo assinado ou grant.

## Validação dirigida real

Seleção Node de container/indexed part/pacote/conteúdo de livro e novos testes
de aventura, com concorrência 2:

```text
ℹ tests 64
ℹ pass 64
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 687.5738
```

13 novos (oito framer/cinco pacote) e 51 regressões. Vetor aventura produzido por
Python hashlib/struct independente (394 bytes), chainHash
4aae1f44c7b1f4df509905eb3dd4272d6c65369d77097ce35cc4123dcf3d6091.
Vetor Python anterior de livro continua idêntico. Inclui ranges nos ordinais 9,
10 e 11; corrupção/truncamento/versão; captura abortada sem footer/novo pull;
cadeias de domínios intercaladas; pacote incompleto/estendido/fora de ordem ou
com identidade de livro e hashes externos válidos; checkpoints JSON de host.

Frontend: seis arquivos, 37/37 positivos em 4,24 s, casos em 442 ms. Consumidores
de captura/stream, inspeção de conteúdo/restauração, fingerprint e Blob source.
Lint dirigido passou; sintaxe de 313 módulos passou. Build com typecheck e
smoke terminou código 0. Avisos existentes de bundle/imports foram preservados.

Protótipos fora do worktree também foram conferidos antes da implementação;
os resultados acima pertencem aos arquivos efetivos após formatação, não aos
protótipos. Primeira execução do protótipo Node no sandbox recebeu spawn EPERM;
execução autorizada fora do sandbox passou, sem mudança no produto.

Logs m71-node.log, m71-frontend.log e m71-build.log estão no diretório privado
writer-v2-portability-qa fora do Git. Não há novo I/O/Rule/runtime; SDK/Chromium
não foram repetidos para esse contrato puro. O validate integral verde de 158
pertence ao estado anterior; suite completa volta no fim do próximo grande bloco.

## Revisão, limites e próximo passo

Diff confere migração do algoritmo, instâncias/erros separados, tipos, whitelist
de seções e testes observáveis. Sem dependências novas, endpoints, credenciais ou
mudança de acesso. Framer não transforma payload em autoria validada: relatório
provisório e checkpoints confiáveis permanecem explícitos. Checks de documentação,
arquitetura/styleguide, formatação e diff são conferidos antes do commit.

Próximo: captura/montagem completa com segunda passagem das provas, manifestos
de histórico/imagens, validador autoral e restauração/UI. P2/P3/D, F2-09 e gates
permanecem abertos, sem avanço da contagem 8/35. Sem CI/push/PR/merge/deploy/
subagentes; somente commit local.
