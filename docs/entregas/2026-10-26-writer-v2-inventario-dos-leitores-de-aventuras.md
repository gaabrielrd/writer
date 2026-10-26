# Writer V2 — inventário e fechamento dos leitores de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: 8c97714.
[Plano 158](../tasks/writer-v2/execucao/158-inventario-e-validacao-dos-leitores-de-aventuras.md)
e [inventário atual](../tasks/writer-v2/inventario-portabilidade-aventuras.md).

## Resultado e limites

Leitores internos 147–157 cobrem as fontes persistidas descritas no inventário.
A matriz identifica produtores, clocks/provas próprias, ausência, staging,
exclusões e rascunhos locais que ainda precisam de entrada explícita na interface.
A captura completa exige duas passagens e manifestos de histórico/assets fechados.

Isso encerra o bloco de leitores, não P2: arquivo integral, assembler/validador,
revisão, restauração/remapeamento/ativação, drafts, UI e roundtrip continuam
pendentes. Nenhum endpoint/Rule/runtime foi habilitado por este fechamento.

## Validação integral real

Última execução de `npm run validate`: código 0.

- Skills, arquitetura, documentação, styleguide, formatação e lint: passaram.
- Frontend: 312 arquivos, 4.096/4.096 testes; duração 426,85 s.
- Cobertura: statements 89,89%; branches 85,63%; functions 90,99%; lines 93,16%.
  Limites globais mantidos.
- Scripts: 87/87.
- Functions: 3.332/3.332, zero falhas/skips; duração 343.861,4414 ms.
- Sintaxe: 310 módulos; typecheck, bundle e smoke: passaram.

Dependências de functions estavam instaladas; manifests não mudaram desde o
fechamento de P1. Os SDKs Firestore/Storage dirigidos estão nas evidências
148–157; esta suíte integral não os substitui nem representa novo deploy.
Sem interface nova ou nova prova Chromium nesta entrega de inventário.

Avisos do bundle sobre chunk/import estático e dinâmico coexistentes foram
preservados. Warnings de Auth/AppCheck em testes usam tokens sintéticos recusados
pelos cenários negativos; suíte terminou positiva. Não foram suprimidos.

## Falhas encontradas e corrigidas

Primeiro validate: 4.095/4.096 frontend positivos; teste que percorre três
edições protegidas inline/v1/v2 atingiu 5.010 ms. Arquivo isolado com cobertura
reproduziu: 19/20. Nessa seleção parcial o limite global de cobertura também
falha por não executar o restante do frontend; não é uma cobertura integral.

O caso recebe timeout explícito de 30 s, mantendo assertions, formatos e volume.
Seleção sem cobertura: um positivo, 19 não selecionados; teste em 1,95 s.
Segundo validate: esse caso passou; outra corrida no teste de controle atingiu
5 s. O polling de 5 ms podia vencer antes da pausa e então aguardar a operação
que o próprio teste precisava liberar depois do loop. Substituído por Promise
de chegada explícita; timeout desse caso continua 5 s. Seleção dirigida passou
em 90 ms (um positivo, 41 não selecionados). Terceiro validate integral passou.

Alterações de código se limitam aos dois testes. Nenhuma regra de produto,
asserção, limite de cobertura ou quantidade de casos foi reduzida.
Logs preservados fora do Git no diretório privado writer-v2-portability-qa:
m70-validate.log, m70-lore-directed.log, m70-lore-fixed.log,
m70-validate-final.log, m70-control-directed.log, m70-control-fixed.log e
m70-validate-closed.log.

## Revisão e continuidade

Revisão do diff: inventário/links e correção de infraestrutura dos dois testes;
sem mudança de comportamento do produto, dependências, segredos ou arquivos
gerados. A Promise sinaliza chegada antes da suspensão e finally libera a
operação, preservando a verificação de cancelamento/estado original.
Checks de docs/formatação/diff são reconferidos após este registro.

Contagem histórica permanece 8/35 (22,9%), sem equivalência a esforço ou lançamento.
P2/P3/D, F2-09, fases 3–5 e gates humanos/comerciais permanecem abertos.
Somente commit local; sem CI, push, PR, merge, deploy ou subagentes.
Dev server respondeu HTTP 200 em 127.0.0.1:5173; isso não é nova validação visual.
