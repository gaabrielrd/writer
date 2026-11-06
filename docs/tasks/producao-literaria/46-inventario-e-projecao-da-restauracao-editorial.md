# Incremento 46 — inventário e projeção da restauração editorial

## Objetivo preservado

Implementar integralmente as cinco etapas do [plano aprovado](plano-integral.md),
na worktree `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`, branch
`codex/producao-literaria`. Base incorporada: `master` em `b666233`.

A restauração final precisa devolver contrato e planos editáveis e preservar o
histórico privado, sem reativar execuções antigas. Este incremento prepara a
projeção nativa e o inventário de limpeza antes de introduzir seus produtores.
Não substitui a restauração útil por um arquivo histórico isolado.

## Inventário privado v15

`bookRestoreEditorialInventory` registra quatro tipos fechados:

| Tipo              | Destino                                                    |
| ----------------- | ---------------------------------------------------------- |
| editorial-record  | books/bookId/literaryArchive/CID                           |
| editorial-body    | books/bookId/literaryArchiveBodies/CID                     |
| editorial-part    | books/bookId/literaryArchiveParts/CID:índice               |
| editorial-control | users/uid/bookRestores/restoreId/preparedEditorial/current |

IDs são hashes hexadecimais de 64 caracteres. Partes usam índice decimal de quinze
dígitos, menor que 128. Nenhum caminho é aceito do arquivo. O journal existente
continua por tipo/ID, vinculado ao dono, restoreId, jobToken e operações originais.
O registro e sua atualização precisam compartilhar os nascimentos precisos dos
respectivos recibos. Reconhecimento de tipo não concede acesso a conteúdo.

A ampliação de v14 para v15 confere schema 13, base em activation-ready com auditoria
done, estado content-verified e ausência física das quatro famílias e de seus
journals. Os layouts anteriores não passam a possuir esses recursos por coincidência
de nome. Uma escrita editorial após o job entrar em cancelamento é recusada antes
de qualquer novo byte ou journal. A versão v15 não é produzida por um endpoint novo
neste incremento; tampouco altera o começo dos jobs v1 existentes.

## Cancelamento e cleanup

A revogação do lote de personas permanece primeiro. Para v15 ela encaminha à fase
editorial antes de cover-storage e dos demais passos anteriores. A fase tem unidades
até cinquenta artefatos e só prepara deletes; o caller existente aplica deletes,
cursor/contadores e recibo no mesmo commit, após terminar todas as leituras.

Partes são removidas primeiro, somente com provas de origem do journal e recibo.
Quando não há partes registradas, a coleção física de partes precisa estar vazia
antes de remover qualquer header. Parte estrangeira ou sem registro conserva os
headers e impede avançar. Só depois são retirados registros, corpos e controle.
Uma unidade separada sem deletes certifica ausência física de todas as famílias e
journals antes de seguir a cover-storage. Contadores continuam monotônicos; não
há declaração de vazio por inferência de contagem.

O cleaner genérico de artefatos recusa os novos tipos para impedir ordem incorreta.
Sua conferência final também inclui os namespaces editoriais. Os cleaners de corpos,
filhos, validação e integridade reconhecem v15 para completar o restante da retirada.
Fonte, bytes, chave e reservas permanentes mantêm seus protocolos anteriores.
Nada é limpo em outro livro ou operação. Recriação de documento/recibo não herda a
prova anterior, e uma falha antes do commit não consome a unidade.

## Projeção pelo leitor verificado

`createBookRestoreRemapper.mapJSON` reconhece book-editorial-artifact,
book-editorial-link e book-editorial. Confere ID do frame contra DTO, exige parte
zero e compõe o remapeador editorial puro. Referências de capítulos, cenas,
arcos/marcos e versões usam o mesmo projetor nativo dos demais recursos restaurados.
Linhagens, decisões e vínculos recebem identidades editoriais próprias e coerentes.
Contagens e aceites permanecem declarações históricas; não viram execução ou grant.

O host usa hash de domínio vinculado ao job para gerar os novos IDs. O contrato
puro continua recusando jobToken e demais contexto operacional como argumentos
extras: o token não é serializado no arquivo ou nos registros remapeados. IDs
anteriores dos recursos não editoriais não mudam. Referências indisponíveis,
externas de universo e da biblioteca permanecem indisponíveis; não há busca de
uma origem atual com mesmo ID para autorizá-las.

`readMappedItem` preserva a política execution disabled, publication private,
review required e historical true. Mantém a prova verify(tx) do leitor existente:
ela precisa ser reconferida pelo futuro materializador na transação de cada unidade,
antes de escrever. A projeção pura não concede disponibilidade física, autorização
ou permissão para instalar um corpo.

## Fronteiras ainda fechadas

A admissão de arquivo v2 continua recusada no cliente e servidor. jobShape,
audit/activation-review e ativação continuam recusando v15 como entrega ativável.
Não há novo método setorial ou Function, alteração de IAM, instalação ativa de
contrato/plano, leitor público, cobrança ou geração de IA neste incremento.
A raiz continua ausente durante os testes de staging preparados.

Antes de habilitar o protocolo faltam:

1. Materializador de corpos/partes e sua certificação, consumindo unidades
   verificadas com fonte/índice/checkpoint/recibo ligados na mesma transação.
2. Estado editável de contrato e planos, com vínculos remapeados e pendências
   explícitas para fontes sem autorização atual. Não copiar tokens antigos nem
   inventar grants antes de conhecer o nascimento da nova raiz.
3. Manifesto e prova de ativação próprios, revisão e confirmação autoral, incluindo
   contagens/provas editoriais sem reabrir a execução de jobs antigos.
4. Leitor privado após ativação, recaptura em backups subsequentes e inventário
   de exclusão do livro, antes de permitir esses novos recursos em livros ativos.
5. Conferência dos limites de bytes após expansão de IDs: a projeção atual ainda
   aplica o limite portátil, e o inventário comporta até 128 partes. Um item próximo
   ao limite pode crescer no remapeamento. Não truncar texto nem declarar o caso
   resolvido por estes testes de metadata; resolver essa fronteira antes da admissão.
6. Jornada real v2 pelo upload, validação, preparo, cancelamento e ativação, além
   dos testes das unidades. Nenhum fixture de helper prova essa jornada completa.

## Testes e revisão

Preparados **20 casos Node e dois SDK**, sem execução. Os casos cobrem endereços
fechados, migração, ausência física, parte estrangeira, ordem de retirada, mais de
cinquenta unidades, metadata, recriação, rollback, isolamento, escrita tardia,
remapeamento de relações e IDs, ausência de grants e permanência da recusa de v2.
O SDK preparado usa somente emulador demo local e testa nascimento comum,
privacidade direta, limpeza e recriação; não é um upload/restore v2 habilitado.

Revisão manual por leitura. Nenhum teste, sintaxe, typecheck, lint, formatter,
build, navegador, coverage, validate ou diff-check executado neste incremento.
O estágio do [incremento 45](45-produtor-e-arquivo-editorial-provisorio.md) e estes
arquivos aguardam o próximo gate. Os resultados da
[rodada anterior](validacao-atual-principal-b666233.md) não os validam; cobertura de
funções de 90% e Rules completas continuam exigidas antes da integração.

Sem commit, merge de volta, push, deploy, servidor ou runner iniciado. Objetivo
integral ativo; **0/5 etapas formalmente encerradas**.
