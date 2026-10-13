# ADR 0027 — Arcos, marcos e cronologia privada

- **Status:** Aceito; implementação, regras, QA completo, validate final e produção aprovados localmente; CI do incremento pendente
- **Data:** 2026-10-13

## Contexto

Autores e criadores de aventuras precisam acompanhar a evolução dos personagens e
os acontecimentos sem rearranjar o manuscrito. O operador confirmou ordem manual
e datas textuais livres, como “3º dia do inverno”. Um marco de arco pode representar
a repercussão de um acontecimento compartilhado, com notas próprias.

## Decisão

`features/narrative-planning` oferece uma interface contextual comum para livros e
aventuras. Arcos, marcos de cada arco e eventos têm sequências independentes. Datas
livres não são convertidas nem ordenadas como datas operacionais. Não há calendário
avançado, campanhas ou inferência de cânone neste incremento.

`functions/src/narrativePlanning.mjs`, `narrativeContracts.mjs` e `narrativeJobs.mjs`
centralizam autorização por projeto, revisão observada, recibos estáveis privados,
listas paginadas leves e exclusão/rebalance retomáveis. Recursos usam ranks em dois
slots; texto continua editável durante reorganização. Operações estruturais não
alteram cenas, capítulos, contagem ou prosa. Recibos não duplicam o texto de trabalho.

Referências tipadas ficam em documentos individuais de `narrativeLinks`, por
identidade, permitindo múltiplos vínculos sem arrays crescentes. Rótulos resolvem
somente origens atualmente autorizadas. A perda de origem conserva identidade e
remove navegação/nome resolvido. Consultas de entidades revalidam a origem em cada
página; menções lexicais da cena aberta continuam distintas de vínculos explícitos.

O índice privado `sceneLoreLinks` permite consultar cenas explicitamente vinculadas
sem buscar todos os seus corpos no navegador. `setSceneReference` atualiza referência,
índice e marcador narrativo atomicamente. Referências anteriores são preparadas
explicitamente por checkpoint; a consulta não se declara completa antes do término.

`hasNarrativeResources` e `narrativeRevision` são protegidos e independentes da revisão
de cenas. A exclusão de livro utiliza o protocolo existente `deleteSceneBook`, com
limpeza dos filhos novos antes do pai, inclusive quando só há narrativa. Excluir um
arco limpa seus marcos/vínculos próprios e preserva os eventos independentes.

Backup privado JSON usa v6 quando há recursos narrativos, incluindo campos de autor
e referências originais. Captura páginas, detalhes e vínculos; confere identidade,
revisões de narrativa/cenas e raiz antes/depois. Não baixa captura parcial durante
exclusão. O arquivo não contém UID, jobs ou índice derivado. Livros sem recursos
narrativos conservam v1–v5. Exportações editoriais e publicação continuam pela prosa
e projeções públicas existentes. Restauração integral permanece na tarefa própria.

## Consequências

Abrir uma cena e retornar conserva aba/arco pela URL contextual. As duas jornadas
usam os mesmos contratos de privacidade e ordenação. Novas funções, regras e índices
exigem implantação autorizada antes do uso real; implementação local não é deploy.

Os gates e o estado real estão no [contrato F2-03](../tasks/writer-v2/execucao/09-arcos-e-cronologia.md).
O CI distribui a suíte visual completa em seis shards, conforme a revisão da
[ADR 0024](0024-test-pipeline-sharding.md), sem reduzir os portões existentes.
