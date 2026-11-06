# 24 — Dependências dos ciclos, sequências, inspeções e publicações

Incremento de implementação, ainda sem validação. O mapa completo continua pendente.
A rodada anterior de testes foi progresso verificado; seus resultados não validam
os arquivos acrescentados neste incremento.

## Composição

`literaryImpactProcessInventory.mjs` define as projeções fechadas dos registros
existentes. O inventário de livros passa a incluir ciclos, sequências, inspeções,
publicações, candidatas, capítulos selecionados, unidades, corpos, retiradas,
confirmações e metadata de guia/versões/provas. Não há nova coleção, callable,
dependência ou mutação de manuscrito.

O vocabulário do grafo ganhou workflow, sequence, inspection e publicationPart.
Cada parte usa a identidade composta coleção/ID: candidatas e capítulos com o
mesmo ID físico não se confundem. O token de registro continua incluindo a
encarnação do livro, nascimento/versão nativos e a projeção exata.

As leituras não pedem instruções, credenciais, autorizações de fase, limites,
HTML, prosa ou relatórios. A lista nativa de capítulos de uma sequência contém
metadata de títulos, mas ela não é devolvida: somente nós e capturas tipados.
O número de registros por página permanece um. Sequências nativas já são limitadas
a 25 capítulos por execução; seu registro admite até 128 arestas, para preservar
capítulos, atos e ciclos completos sem truncar aos 64 vínculos anteriores.
Isso não limita o livro. O motor de gravação mantém lotes de 32 arestas; a futura
orquestração precisa repartir um registro em passos, sem promover append parcial
a inventário completo.

## Provas e limites

`artifact-origin` usa autor, livro, nascimento do livro, tipo, ID e nascimento do
recurso. Prova identidade, com versão desconhecida. Mudança de prosa não aparece
como leitura ou revisão do manuscrito. Recriação do livro, processo ou recurso
não reautoriza capturas antigas. O registro próprio de workflow/sequence confere
também seu nascimento salvo quando presente; registro em preparação pode ainda
não ter esse campo.

`integration-chapter` preserva a captura metadata nativa do capítulo e distingue
identidade de versão. `publication-integration` reconfere o snapshot metadata
exato da integração aceita. Um token opaco que mudou não permite afirmar se a
mesma integração foi editada ou recriada: a identidade histórica fica desconhecida.

Revisões de política sem nascimento do contrato podem sinalizar revisão divergente,
mas não são promovidas a prova da encarnação original do guia. As partes de publicação
reautorizam o livro e o token do pai, sem adotar o nascimento atual desse pai como se
fosse a observação histórica da parte. Seu vínculo ao pai continua não verificado
quando a captura original não registrou esse nascimento.

A verificação pelo ponteiro continua reconstruindo registro e aresta na transação.
Arestas que partem do próprio registro usam o token nativo exato; esse resultado
se refere à metadata, nunca à integridade ou leitura dos corpos.

## Pendências explícitas

- O ciclo atual de uma sequência registra ID sem nascimento do filho no pai;
  sua origem fica pendente, sem inferência pelo ID reutilizado.
- Unidades de cena publicadas ainda exigem verificador metadata específico de
  sua identidade nativa; o hash de corpo não é usado como substituto.
- As evidências e relações do guia público estão em arrays com texto literal.
  Este incremento registra contenção e declara essas dependências não inventariadas.
  Falta índice produzido junto ao guia e backfill autorizado das versões antigas.
- Faltam orquestração pública paginada, cobertura/fence integral, resolução de
  pendências com evidência e interface do mapa.
- Portabilidade editorial e auditoria integral dos demais aceites continuam no
  objetivo; nenhuma das cinco etapas foi formalmente encerrada.

## Testes preparados

Dez casos em `functions/test/literaryImpactProcessInventory.test.mjs`: identidade
sem leitura; alvo e recriação do registro; origem de outro livro/autor e dados
inválidos; sequência de 25 capítulos; inspeção alterada/recriada; IDs homônimos
entre partes; pai de publicação inválido; cobertura incompleta de guia; integração
aceita substituída; revogação de autoria.

Nenhum teste, lint, typecheck, formato, build, navegador, cobertura ou validate foi
executado neste incremento. Fontes novas precisam de formatação e verificação no
próximo fechamento. Revisão manual de máscaras, namespaces e limites realizada;
ela não substitui execução. Sem commit, merge de volta, push ou deploy.
