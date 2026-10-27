# Writer V2 — validação semântica de arquivos de aventuras

Data: 2026-10-27. Entrega técnica local do
[plano 167](../tasks/writer-v2/execucao/167-validacao-semantica-do-arquivo-de-aventuras.md).
[ADR 0189](../decisions/0189-adventure-independent-content-validation.md).
Base d937c96; sem CI, push, PR, merge, deploy ou subagentes.

## Resultado implementado

Leitor independente das oito seções do arquivo privado: DTOs fechados,
identidades/tuplas, pares head/body, hashes de prosa e vínculos obrigatórios,
controles/ranks, lore próprio/tombstones, perfis usados, origem neutra do universo,
histórico completo, draft explícito separado e vínculos/PNGs por recurso.
Reconfere contagens e manifestos com SHA independente; envelope válido sozinho
não aprova conteúdo. O relatório content-only não autoriza acesso nem restauração.

JSON fica limitado a uma unidade de 8 MiB; texto/PNG passa em partes de até
64 KiB. Máquina mantém checkpoint de até 16 KiB e fecha relações em lotes de
até 64. SHA retomável usa hash-wasm 4.12.0 existente; engines/streams não
compartilham prefixos. UTF-8 histórico permite continuação entre partes e
checkpoints, sem confundir contagens nativa e portátil.

shared/validation extrai o índice OPFS cifrado já usado por livros: nomes HMAC,
valores AES-GCM e chaves efêmeras. Namespace/API de livro preservados. O wrapper
público de aventuras fixa fonte/signal e limpa seu diretório após sucesso/erro;
falha de limpeza impede aprovação e preserva os dois erros quando necessário.
Registro de campos de resources foi extraído literalmente para configuração pura,
sem modificar o conteúdo dos serializers ou importar codecs Node no navegador.

## Testes dirigidos e correções

38 Vitest distintos positivos em seleções: 23 leitor/máquina, sete wrapper e
oito índice de livros. Corpus usa produtores/leitores reais, com aventura vazia,
importação nativa, arquivo, histórico de recurso removido, PNG e draft.
Adulterações novamente seladas por Node crypto independente exercitam campos,
pais/IDs, hash de corpo, tombstone, persona, manifesto, UTF-8 histórico, draft,
PNG e duplicação; há truncamento, abort, I/O e limpeza.

66 Node distintos positivos nas seleções de codecs/primitives/hash/schema.
A primeira seleção de schema tinha fixture com apenas 15 famílias: a fixture
passou a criar referências reais de cena/narrativa e as 17 famílias permaneceram
exigidas. O fixture de duplicação inicialmente convertia Buffer em Uint8Array,
falhando antes do domínio; preservados os bytes Buffer, o envelope foi conferido
e a duplicação recusada pelo leitor. Erro inicial de lint preserve-caught-error
foi corrigido com cause da limpeza, mantendo ambos em AggregateError.errors.
Não foram relaxadas asserções, limites ou contratos para aprovar os casos.

Chromium real passou pela API pública compilada: SHA em WASM, nomes HMAC e
conteúdo cifrado em OPFS observados, zero arquivos da operação após sucesso
e após falha de leitura injetada. Bundle isolado: 39 módulos, 202,63 kB,
51,86 kB gzip. Prova funcional de módulo, sem alegar jornada visual/a11y da UI.

## Validação integral do bloco

npm run validate terminou com exit 0 em 2.209,65 s. VITEST_MAX_WORKERS=1 somente
no ambiente do subprocesso, sem alterar configuração, regras ou thresholds.

- Skills, arquitetura, documentação, styleguide, formatação e lint integral: verdes.
- Frontend: 322 arquivos, 4.259/4.259 casos, 1.511,93 s.
- Cobertura: 89,94% statements, 85,71% branches, 91,12% functions,
  93,24% lines; limites 85/75/90/85 preservados.
- Scripts: 90/90, 18.525,262 ms.
- Functions: 3.379/3.379, 348.671,9456 ms, sem falhas/skips/cancelamentos.
- Sintaxe: 323 módulos.
- Typecheck/build/smoke: verdes; 3.028 módulos, bundle em 2,82 s.
  Avisos de chunks/imports dinâmicos ineficazes continuam explícitos.

A primeira tentativa de 167 foi interrompida sem resumo da cobertura. A sessão
e a árvore de processos foram conferidas ausentes antes da repetição. Essa
tentativa permanece sem resultado verde. A repetição usou processo independente,
log e status final persistidos. O snapshot SHA dos 31 arquivos permaneceu idêntico
após a validação; depois só foram atualizadas evidências/documentos de fechamento.

Esta rodada fecha também a pendência formal de validate de 166. Não converte
retroativamente o exit 1 anterior em sucesso: o resultado verde é desta execução,
incluindo o timeout individual corrigido e a validação semântica nova.

## Revisão, limites e continuidade

Revisados encerramento/abort, intenções fixadas, erro primário/limpeza, tamanhos,
checkpoints do host, identidade/presença, resolução limitada de relações e
distinção entre hash/envelope/conteúdo/autorização. Primitive neutra não importa
features; namespaces e contratos de livro preservados. Hooks normais e staging
restrito fazem parte do commit local. Servidor Vite local preservado para testes.

Não há nova UI, endpoint ou Rule; nenhuma nova prova SDK é atribuída ao recorte.
Transporte, índice persistente/revisão, restauração/remapeamento/mídia, recuperação,
ativação privada, UI, roundtrip e consumidores continuam pendentes.
P2/P3/D, F2-09 e gates humanos/comerciais permanecem abertos.
Contagem histórica continua 8/35 (22,9% de tarefas, não esforço nem lançamento).
