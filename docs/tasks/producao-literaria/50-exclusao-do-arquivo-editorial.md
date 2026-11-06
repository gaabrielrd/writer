# Incremento 50 — exclusão do arquivo editorial do livro

## Estado

Implementação da integração de exclusão exigida por E5.5, antes de admitir a
restauração editorial em livros ativos. Usa a API existente deleteSceneBook;
não cria callable nem habilita ativação v15. O plano integral permanece ativo,
com as cinco etapas formalmente abertas.

## Inventário e autorização

`bookEditorialStorage` centraliza os quatro endereços compartilhados entre
preparo e exclusão: literaryArchiveParts, literaryArchiveBodies, literaryArchive
e literaryRestoreReviews. Contrato, planos e versões nativas permanecem nas fases
literárias já existentes da exclusão do livro.

`prepareBookEditorialArchiveDeletion` produz somente um plano de remoção. Confere
UID/dono, raiz existente em deleting e publicação revogada. Usa queries metadata-only
em ordem de ID, com limite de 1 a 50 registros. Não lê JSON, bytes, referências ou
prosa para excluir. Não resolve fontes externas nem toca biblioteca ou outros livros.

A autorização difere do cancelamento de uma restauração: aqui o autor exclui o
livro inteiro, incluindo filhos órfãos ou malformados daquele projeto. Não depende
de chaves, job de restore ou recibos de cada parte. O cancelamento de uma tentativa
privada continua usando seu inventário e provas nativas próprios. Apenas os
endereços de armazenamento são compartilhados entre esses protocolos.

## Ordem e atomicidade

A fase editorial-archive entra depois dos agrupadores e antes das coleções planas.
Em livros sem arquivo, o teste de vazio é feito na mesma unidade que já avançaria
para chapters. Com arquivo, cada unidade consulta primeiro partes, depois corpos,
registros e revisões pendentes. Não remove um header enquanto há partes físicas,
inclusive órfãs. O vazio é reconferido antes de sair dessa fase.

Remoções, contagem, checkpoint e recibo são confirmados na transação existente de
exclusão. O helper não apaga nada por conta própria e o contador não é reiniciado.
Falha após preparar uma remoção não confirma progresso. Repetição após o término
usa o resultado terminal já registrado, sem excluir outra cópia.

Antes de remover a raiz, finish também confere as quatro coleções. Um recurso
restante ou tardio redireciona para editorial-archive, sem declarar conclusão.
Isso cobre checkpoints antigos 1–3 já posicionados depois da fase nova. A limpeza
segue então pelas fases existentes, preservando o protocolo de lore e o marcador
literário que força outra passagem quando necessário. Não muda a versão do
inventário de lore nem o formato dos recibos de exclusão.

## Testes preparados, sem execução

São **oito casos Node e um SDK**:

- Mais de 50 partes, páginas limitadas e headers preservados enquanto há partes.
- Dono/UID, deleting, publicação revogada, limite e caminho validados.
- Exclusão pela API normal, com contrato/plano/versões e revisões pendentes.
- Biblioteca, metadata externa de restore e outro livro preservados.
- Recurso tardio em finish e retomadas dos checkpoints 1, 2 e 3.
- Rollback da remoção, contagem e checkpoint; retry e repetição terminal.

O teste SDK preparado usa Admin Firestore e Rules reais no emulador demo,
53 partes, API de exclusão, guarda de escrita direta e preservação de outra raiz
com sua cópia e da biblioteca. Ele parte de um livro próprio já em exclusão;
não comprova uma jornada de restauração v2 ativada nem a fronteira HTTP Auth/AppCheck.

Nenhum teste, syntax check, typecheck, lint, formatter, build, navegador, coverage,
validate ou diff-check foi executado neste incremento. A execução segue para o
próximo gate antes da integração, após conferir a principal. As aprovações antigas
não validam os incrementos 47–50.

## Continuação

Integrar revisão/ativação com o censo e flags/clocks nativos; expor histórico e
reconciliação de referências; concluir recaptura com origens explícitas e sem
duplicar correntes ou ampliar/truncar JSON histórico. Depois auditar E1–E5 e passar
pelos gates integrais, mantendo functions90% e Rules completas. Sem commit,
merge de volta, push, deploy, servidor ou runner iniciado neste incremento.
