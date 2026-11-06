# Incremento 47 — materialização editorial privada

## Escopo e estado

Continuação de E5.5 na worktree `codex/producao-literaria`, sobre a principal
`b666233`. Implementação interna; não há interface pública, novo callable, raiz
ativada ou aceitação final. O [plano integral](plano-integral.md) permanece ativo,
com cinco etapas abertas. A rodada anterior é evidência histórica em
[2026-11-04](validacao-final-2026-11-04.md); seus resultados não validam este incremento.

## Preservação do corpo e identidades

`bookRestoreEditorial` reserva o corpo e o controle pelo inventário v15 antes de
copiar bytes. Cada unidade consome no máximo uma parte lógica de 64 KiB do leitor
nativo, preservando o JSON original. O corpo conserva UTF-8, escapes, CRLF e a
representação numérica da fonte. O SHA incremental é do wire original; o hash
semântico permanece separado e vem do índice autenticado. Não há montagem de um
DTO remapeado de até 8 MiB para gravá-lo novamente. O limite não foi ampliado,
nenhum campo é truncado e os IDs novos ficam nos descritores fora desse corpo.

Esse desenho evita crescimento do corpo pela expansão dos IDs, mas não conclui
a recaptura de arquivos restaurados: o futuro consumidor/exportador ainda precisa
projetar os vínculos externos ao corpo, preservar agrupamento/proveniência e
suportar restaurações repetidas sem promover tokens ou antigas autorizações.
O mapper JSON completo existente continua limitado; não deve ser usado para
reescrever registros históricos grandes.

O leitor `openEditorialItem` confere ponteiro, índice, nascimento da validação,
job e bytes físicos. Não espera `valueHash` no ponteiro nativo: esse campo pertence
ao normalizado legado. Artefatos e links obtêm o hash no índice semântico privado;
o resumo usa os totais certificados. O token interno fixa essas provas, sem ser
serializado no backup. Um último frame físico maior que 64 KiB é lido em partes
lógicas limitadas, sem ampliar o limite integral do item.

## Transações e confirmação

Uma parte só é escrita depois de `verify(tx)` na mesma transação consumidora.
Controle, job, journal e recibo são gravados juntos. A parte anterior tem nascimento
e hash reconferidos antes de avançar a cadeia de provas. Após a última parte há
uma unidade de fechamento separada: confere o último ACK nativo, fecha o SHA e
cria o registro apenas com o corpo completo. A próxima unidade confirma o nascimento
do registro e incorpora sua prova. Recriação de corpo, parte ou controle não
herda o testemunho da tentativa original. O ledger de artefatos permanece monotônico.

O estado `materialized` significa somente que a cópia histórica interna terminou.
Não substitui o censo físico final, a preparação dos estados editáveis, a revisão
de vínculos ou a ativação. SHA parcial e corpos permanecem privados no servidor;
`getBookRestoreEditorial` retorna somente fases e contadores.

## Integração com o preparo existente

A opção interna `editorialPreparation` é booleana e começa em `false`. Input cliente
não habilita essa opção. A reserva de um novo v2 é recusada antes de qualquer
recurso ser criado quando a opção está desligada. Reservas nativas já existentes
podem ser consultadas, retomadas e canceladas sem depender da admissão de novos
jobs. Os dois métodos editoriais continuam fora de `BOOK_RESTORE_METHODS` e do
registro de ações públicas. O padrão do backup e a interface continuam v1; v15
continua sem ativação.

`readMappedDraft` usa ordem e totais certificados para descontar a cauda editorial
antes de localizar o rascunho. Confere tipo/ID e preserva a prova da leitura. Assim,
a preparação de personas não confunde o rascunho com um registro editorial. O
comportamento de arquivos v1 e JSON legado conserva a posição canônica anterior.

## Cancelamento

A ordem v15 agora é: revogação do lote de personas, barreira permanente da capa,
limpeza editorial, filhos de recursos e restante do protocolo existente. Isso
corrige a sequência inicial da ADR 0294: a fase editorial já exige a barreira da
capa instalada no contrato do job. A correção preserva essa exigência, sem relaxar
o verificador. V1–v14 mantêm a ordem anterior.

A limpeza editorial continua retirando partes antes de cabeçalhos, exige ausência
física antes de retirar headers e certifica vazio em uma unidade própria. Depois
avança para `resource-children`. Cancelar durante I/O impede o uso posterior da
prova; o cliente não recebe grants de leitura ou retomada operacional por histórico.

## Testes preparados, sem execução neste incremento

`bookRestoreEditorialFixture` faz upload v2 real, integridade, validação semântica,
preparo de estrutura/lore/recursos/contagens/personas/universo/histórico/rascunho/
capa/índices e auditoria da base. Não semeia um job validado nem grants de restauração.
Usa o double transacional existente com nascimentos e updates por commit; isso
não substitui o teste SDK/emulador.

São **15 casos novos preparados**, incluindo três variações de recriação:

- Admissão padrão fechada e ausência dos métodos na fronteira pública.
- Reserva antes dos bytes, ledger, raiz ausente, metadata sem SHA privado/prosa.
- Preservação literal do texto UTF-8/CRLF/escapes em JSON canônico e conferência dos hashes semântico e físico.
- Original próximo de 8 MiB que não cabe no caminho de DTO integral remapeado.
- Índice semântico real sem um campo fictício no ponteiro nativo.
- Retomada de reserva existente com admissão desligada e replay após resposta perdida.
- Rollback atômico e rejeição de corpo, parte ou controle recriados.
- Prova consumida na transação e invalidada por cancelamento.
- Cancelamento pelo inventário real, com personas/capa fechadas antes do editorial.
- Rascunho com persona exclusiva antes da cauda v2.
- Item JSON maior que 64 KiB dividido em frames válidos de até 64 KiB.

A [revalidação posterior](revalidacao-incrementos-47-50.md) corrigiu duas
expectativas inválidas dessas fixtures: JSON não canônico e frame acima de
64 KiB são recusados pelo formato, antes da materialização. O arquivo passou
a ter 17 casos, incluindo essas duas rejeições explícitas.

As expectativas dos testes de inventário e SDK foram atualizadas para a nova fase
seguinte. Nenhum teste, syntax check, typecheck, lint, formatter, build, navegador,
cobertura, `validate` ou diff-check foi executado depois destas alterações. Essa
validação permanece para o próximo gate antes da integração, com a principal
reconferida primeiro. Houve somente leitura/revisão manual e edição de arquivos.

## Continuação obrigatória

Preparar contrato e planos editáveis com revisão explícita e identidades nativas;
concluir o censo físico e os certificados; integrar revisão/ativação atômicas e
leitura privada do histórico; implementar recaptura editorial e inventário de
exclusão antes de admitir livros ativos. Depois auditar E1–E5 e executar os gates
integrais, mantendo cobertura de functions de 90% e a suíte completa de segurança.
Sem commit, merge de volta, push, deploy ou servidor iniciado neste incremento.
