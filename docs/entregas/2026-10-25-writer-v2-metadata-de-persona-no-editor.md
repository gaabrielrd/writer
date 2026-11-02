# Writer V2 — metadata de persona no editor

## Resultado local parcial

GetBook/listBooksByAuthor e getChapter/listChapters preservam personaAvailability
fechada do vínculo atual. Livro aceita razão de ausência; capítulo também mantém
overrides antigos. Editor não perde mais a marca antes de exportar seu rascunho.
Marca velha é omitida; metadata inválida falha. Não consultar perfil, escrever
ou alterar texto/datas. Inputs de escrita permanecem sem propriedade nova.

Book/Chapter usam o tipo puro já compartilhado; BookDraftInput reutiliza o campo
público, sem depender do domínio de portabilidade. Listener mantém contrato mínimo.

[Plano 144](../tasks/writer-v2/execucao/144-metadata-de-persona-nos-leitores-do-editor.md)
e [ADR 0167](../decisions/0167-persona-availability-editor-dto.md).

## Validação dirigida

Sete casos novos: livro em get/list, duas razões de capítulo, vínculo novo,
marca malformada/extra, motivo inválido no escopo do livro e DTO real → produtor
de rascunho vazio sem consulta de perfil. Texto/valores/datas e ausência de escrita
conferidos. I/O Firestore simulado; funções de leitura/projeção e produtor reais.

Primeira seleção: 7/7, 62 não selecionados, 5.59 s. Como a projeção participa de
todos os leitores do serviço, regressões do arquivo foram executadas: 69/69,
5.21 s. Inclui as sete novas, sem contar duplicado. Typecheck e lint dirigidos
passaram. Formato, arquitetura, docs e diff passaram; revisão sem bloqueador no
escopo. Tipos de criação/edição não foram ampliados.

Nenhuma UI, formato, query, Rules, namespace, endpoint ou dependência mudou.
Provas nativas/browser anteriores não foram repetidas sem mudança em seus
contratos. Sem validate/build global neste incremento; P1/F2-09/V2, inventários,
exclusão/coleta, fontes v1/certificação, rollout e fases/gates continuam abertos.
Somente commit local; sem CI, push, PR, merge, deploy ou subagentes.
