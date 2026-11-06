# Incremento 52 — leitor privado do arquivo editorial

## Escopo implementado

Ler o arquivo histórico de uma cópia editorial ativada, inclusive depois da
limpeza da origem de restauração. A leitura exige a raiz atual do livro, dono
atual, ausência de exclusão, vínculo original e certificado nativo da ativação.
Um recibo histórico isolado nunca autoriza conteúdo atual.

Foram criados `bookEditorialHistoryOrigin`, `bookEditorialHistoryContracts` e
`bookEditorialHistory`, compostos internamente em bookRestoreUpload. Os métodos
não entraram em BOOK_RESTORE_METHODS nem no registro público de callables.
Nenhuma opção de produção, interface ou Rules foi habilitada. O incremento 51
continua com a ativação editorial desligada por padrão.

## Prova que sobrevive à limpeza

A limpeza de origem existente remove journals, chunks enviados e índices/estado
de validação. O leitor não depende desses recursos temporários. Ele confere o
controle metadata `preparedEditorial/current` e o selo vinculados pelos tokens
do recibo de ativação, além do job/reserva/recibo nativos já exigidos no loader.
O controle está materialized, heads prepared e census done, com origem, ledger
e contagens exatas. O selo é imutável, tem o checkpoint anterior à ativação e
pertence ao mesmo commit da última atualização do controle.

O protocolo de archive reconfere esse testemunho a cada unidade de cleanup v15.
Ele preserva o controle e os recibos históricos, sem alterar os contadores ou o
layout v14. Esse controle contém metadata, não prosa, partes, chave ou grants de
fontes externas. Sua persistência não concede leitura: a autorização da raiz
continua obrigatória em todas as entradas de conteúdo.

A raiz atual deve ter o mesmo nascimento do commit da ativação e o mesmo
restoreOrigin. Recriar raiz/job/controle/selo com dados iguais não transfere essa
identidade. Um livro removido ou deleting, mudança de dono, vínculo diferente
ou testemunho ausente interrompe a leitura.

## Paginação e leitura por partes

- Lista por ID, somente metadata, páginas de 1 a 50 e cursor fechado ligado ao
  livro/contexto nativo. Edições normais da prosa não invalidam um arquivo imutável.
- Descritor selecionado confere header/body, hash e nascimento próprio do corpo,
  identidade remapeada ligada ao job e limite de 8 MiB/128 partes.
- Headers precisam ser imutáveis e anteriores ao selo. Corpo e header foram
  selados no mesmo commit; o nascimento do corpo precisa corresponder ao header.
- Parte de até 64 KiB exige ID/índice/tamanho exatos, nascimento imutável anterior
  ao header e SHA dos bytes. Alterar bytes e recalcular o hash não preserva o
  timestamp nativo original.
- O token de leitura vincula a origem atual, header e corpo. A API não devolve
  caminhos ou tokens de origem física nos DTOs normais.
- O port interno openVerifiedBookEditorialHistory entrega partes, hashes e prova
  nativa de cada parte, além da raiz agregada. verify(tx) reautoriza o consumo no
  commit do caller; a reconferência usa metadata sem reler o payload da parte.

Um consumidor deve conferir tamanho total, SHA integral e cadeia das partes
antes de aceitar o conteúdo, e reautorizar ao final. `done` da última parte é
somente fim do transporte; não certifica sozinho a semântica ou uso do conjunto.
O port preserva JSON original sem expandir IDs nem truncar texto. Não resolve
referências externas ou transforma política histórica em consentimento.

## Base de revisão das pendências

getBookEditorialRestoreReview lê a revisão original imutável e seu artefato
histórico. Ele compara revisão/hash e nascimento da corrente com a primeira
versão nativa, que também deve ser imutável e anterior ao selo. Retorna estado
unchanged, changed ou missing e um reviewToken ligado aos snapshots atuais.

Um estado recriado com o mesmo texto não recupera a condição unchanged. As
referências portáteis históricas continuam sem sourceTokens atuais. A indicação
canUseOriginalDraft fica falsa após mudança/remoção/recriação. O token identifica
a base de comparação; **a aceitação persistida e seu CAS de escrita ainda não
estão implementados neste incremento**. Nenhuma pendência é aplicada ou marcada
como resolvida por leitura, e nenhum corpo atual é reescrito.

## Testes preparados e limites da evidência

Foram preparados **22 casos Node e 2 casos SDK**, sem execução:

- Fronteira interna, raiz ausente, paginação/metadata e entradas fechadas.
- UTF-8/BOM/CRLF/escapes, leitura em partes, SHA integral e cadeia nativa.
- Leitura após limpeza real dos journals/chunks/índices da origem.
- Cleanup histórico após remoção da raiz sem acesso ao conteúdo atual.
- Quatro recriações da origem e três recriações de recursos do arquivo.
- Alteração de bytes com hash recalculado, perda de dono e deleting.
- Consumo de prova retida recusado antes de gravar o consumidor.
- Escritor normal muda o plano e invalida a base pendente, preservando arquivo.
- Corrente removida/recriada, primeira versão recriada, cursores cruzados e índices/tokens incorretos.
- Testemunho recriado impede cleanup antes de remover recursos restantes.
- SDK real percorre ativação, leitura e cleanup; confere privacidade Rules e
  leitura posterior. Outro cenário confere revogação/recriação sem write parcial.

O SDK usa somente emulador demo com Admin/timestamps reais, não HTTP
Auth/AppCheck nem interface pública. Nenhum teste, syntax/type/lint/formatter,
build, browser, coverage, validate ou diff-check foi executado neste incremento.
Os resultados 5.898/5.480 anteriores não validam os incrementos 51–52.

## Continuação do plano integral

Implementar aceite/reconciliação explícitos com CAS e a interface de revisão;
concluir recaptura com origens agrupadas sem duplicar correntes nem expandir
JSON de até 8 MiB; integrar o cliente e habilitar somente depois dos gates.
Auditar E1–E5 contra o plano original e executar a validação antes da integração,
reconferindo a principal primeiro. Cobertura mínima e Rules completas continuam
pendentes. Sem commit, mergeback, push, deploy, servidor ou runner iniciado.
O objetivo permanece ativo e as cinco etapas continuam formalmente abertas.
