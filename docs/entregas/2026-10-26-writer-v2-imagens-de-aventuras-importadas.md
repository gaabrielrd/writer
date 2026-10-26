# Writer V2 — imagens de aventuras importadas

Data: 2026-10-26. Branch codex/writer-v2. Base: 8279e78.
[Plano 157](../tasks/writer-v2/execucao/157-imagens-de-aventuras-importadas.md),
[ADR 0180](../decisions/0180-adventure-imported-image-authority.md).

## Problema corrigido

Auditoria do produtor real encontrou cenas anteriores à raiz: importação prepara
filhos e cria raiz somente na ativação. Exigência de nascimento do head no leitor
de imagens bloqueava esse caso legítimo. Agora head/cena dona precisam de
identidade válida/owner/schema/flags/backlink; autorização de bytes exige o uso
tipado exato nascido após a raiz atual, além das provas de library/Storage.

Nenhum job ou chave de importação vira grant. Biblioteca anterior é válida;
uso antigo de raiz recriada continua recusado. Nenhuma mudança no importador,
writer, RootSource, criptografia, formatos, Rules, runtime ou dependências.

## Validação dirigida real

Dois testes novos executados antes da correção falharam precisamente no guard
owned do reader, reproduzindo null e imagem vinculada após ativação.
Depois da correção, ambos + 35 regressões passaram (37/37 em 418,2595 ms).

Seleção final com terceiro caso de histórico e regressões do importador:

```text
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 470.411
```

Três novos + 35 de imagem + 12 do importador. Fixture usa serviço real completo:
start/chave/append/materialize/activate, com revisão sintética marcada como
application/pdf; não é nova extração do PDF pessoal do operador.
Comprova cena anterior à raiz, null, vínculo/uso posterior pelo writer normal,
ranges/bytes e prosa intactos; metadata de origem permanece importada.
Histórico manual posterior à ativação continua elegível pelo guard já existente.
Uso antigo de raiz recriada e demais recusas da 155 seguem positivos.

SDK real Firestore 1.22.0 + Storage 1.1.3 verificados, loopback/projeto demo:

```text
# tests 3
# pass 3
# fail 0
# skipped 0
# duration_ms 17191.64
M69 targeted adventure SDK passed
```

Os três cenários de imagem foram repetidos sobre aventura ativada pelo importador
real. Cena tem nascimento anterior à raiz; setter anexa principal/adicional após
ativação. PNG real, ranges/SHA, object generation/accepted ABA, Rules e revogação
após leitura real continuam comprovados. Avisos PassThrough MaxListeners do SDK
foram preservados; não houve redução de casos, volumes ou limite de listeners.

JVMs diretas limitadas e persistence privada conforme procedimento anterior.
Sem credencial/serviço de produção. Lint dirigido passou; sintaxe/docs/arquitetura/
styleguide/formatação/diff são conferidos antes do commit.
Validate integral será executado no fechamento do bloco dos leitores.

## Revisão e pendências

Correção restringe a comparação de idade à prova que autoriza o asset: uso
tipado atual. Não aceita origem/recibo de importação como autorização de imagem
ou muda o manifesto. Fonte própria/criptografia de revisão permanecem intactas.
Sem bloqueador identificado neste recorte; a auditoria de inventário/selo segue.

Inventário final, selo/pacote/revisão/restauração/UI/roundtrip e validate integral
pendentes. P2/P3/D, F2-09 e demais fases/gates abertos.
Somente commit local; sem CI/push/PR/merge/deploy/subagentes.
