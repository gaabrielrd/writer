# Writer V2 — origem do universo no backup de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: a94e95f.
[Plano 156](../tasks/writer-v2/execucao/156-origem-do-universo-no-backup-de-aventuras.md),
[ADR 0179](../decisions/0179-adventure-backup-universe-origin.md).

## Escopo entregue

Novo adventureBackupUniverseRead registra origem none/unavailable/reference
pela fonte e identidade nativa no mesmo snapshot, sem copiar nome/prosa/lore
global. Universo indisponível não bloqueia conteúdo próprio nem concede acesso
por coincidência. Criado nativo permite distinguir outro universo com mesmo ID.

Validador portableUniverseOrigin foi extraído literalmente; alias público do
livro continua e payload das três formas permanece idêntico.
Sem writer/Rule/runtime/UI/persistência/dependência novos.

## Validação dirigida real

Node de origem de aventura e regressões do leitor de livro:

```text
ℹ tests 24
ℹ pass 24
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 142.0615
```

16 novos e oito regressões. Produtores reais de universo/Estúdio, masks sem
prosa ou consulta de lore global, origem none/ativa/ausente/foreign/deleting, tokens nativos
repetíveis, edição/recriação sem mudar raiz, nascimento preciso, autoria,
ID/input inválidos, intenção capturada e falha/retry sem escrita.
Alias puro é a mesma função, com mesmas saídas para as três formas.

SDK real no Firestore Emulator 1.22.0 verificado, loopback/projeto demo:

```text
# tests 1
# pass 1
# fail 0
# skipped 0
# duration_ms 11602.3315
M68 targeted adventure SDK passed
```

Produtores reais, projeções nativas sem prosa, identidade de criação precisa,
nenhuma alteração de updateTime durante leitura, exclusão/recriação do universo,
troca de autoria e leitura íntegra da própria aventura após revogação, além de
conta/Rules. PERMISSION_DENIED negativo esperado. JVM direta limitada conforme
procedimento QA anterior; nenhuma credencial/serviço de produção.

Lint dirigido passou; sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate completo no fechamento de P2, conforme
orientação do operador. Não alegar novo roundtrip integral de livro.

## Revisão e pendências

Getter usa somente vínculo autorizado, captura expectedUniverseToken antes de
espera e distingue nascimento nativo. Universo inacessível emite só hint do ID;
não certifica autoridade ou permite adotar outro de mesmo nome/ID. A extração
compartilha validação pura, não contexto/hash ou payload de outro domínio.
Sem bloqueador identificado neste recorte interno.

Inventário final/selo/pacote/revisão/restauração/UI/roundtrip e validate integral
continuam pendentes. P2/P3/D, F2-09 e demais fases/gates abertos.
Somente commit local; sem CI/push/PR/merge/deploy/subagentes.
