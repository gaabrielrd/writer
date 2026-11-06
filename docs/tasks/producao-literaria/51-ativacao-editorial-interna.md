# Incremento 51 — revisão e ativação editorial internas

## Critérios e limite

Ligar o censo físico do incremento 49 ao protocolo existente de revisão,
retirada de pedido incerto e ativação. Uma nova cópia precisa nascer privada,
com contrato/planos no formato que os escritores normais conseguem editar,
sem transformar execuções históricas em consentimento ou publicação.

Este incremento prepara o caminho interno com `editorialActivation: false`
por padrão. A opção pertence ao host de `createBookRestoreUploadService`, não
aos DTOs do cliente. Nenhuma opção foi habilitada no boot ou na interface;
`editorialPreparation` continua independente e desligada por padrão. Não foram
adicionados métodos públicos, callables, dependências ou privilégios de SDK.

## Revisão e ativação

`bookRestoreEditorialActivation` compõe a prova nativa do censo completo com
as decisões de ativação existentes. A revisão exige C1, source archive v2,
inventário 15, base auditada, cabeçalhos editáveis prontos, censo integral,
contagens conferidas, personas preparing e capa preparada sem fence.

A revisão retorna somente contagens de artefatos, vínculos, contratos, planos
e revisões necessárias. Ela não devolve os corpos históricos ou as referências
pendentes. O `reviewToken` inclui a prova editorial, além das fontes, capa,
universo, lote e artefatos que o protocolo já reconferia antes/depois do I/O.

A confirmação mantém raiz, work control, lote de personas, universo/capa quando
presentes, retirada da chave, job e recibo no commit existente. O registro de
ativação v15 acrescenta um certificado fechado com versão, contexto do censo,
token nativo do controle e token nativo do selo. Esses valores são calculados no
servidor e não são aceitos no pedido de ativação. Ativação v14 mantém o formato
anterior e não admite esse certificado.

A raiz usa `hasLiteraryResources`, `literaryRevision`,
`literaryContextRevision` e `literaryDependencyRevision` já protegidos nas Rules.
O clock inicial é 1 quando há contrato/plano corrente materializado, ou 0 quando
só há histórico. Isso é uma adoção nativa da nova cópia, sem copiar revisões
antigas. A política de publicação explícita conserva `hasLiteraryPublications`;
ela não cria publicação nem muda `status: draft`.

O contrato conserva a política de colaboração em orientação; planos continuam
propostas sem referências operacionais. As revisões privadas retêm política,
status e referências históricas para revisão posterior. O arquivo original e
suas partes não são regravados ao ativar ou editar os estados nativos.

## Pedidos incertos e confirmação histórica

A retirada de um pedido de ativação v15 preserva o selo base v14. Ela substitui
somente `control.census.sealOperationId`, atualizando controle, journal, job e
recibo na mesma transação, sem aumentar o ledger de artefatos. O verificador do
censo aceita a retirada como novo selo nativo, com todas as demais provas e a
conferência do commit. Uma revisão anterior deixa de servir para nova ativação.

A retirada permanece disponível quando a opção de novas ativações é desligada.
O mesmo ID fica fechado pelo recibo de `retireBookRestoreActivation`: uma chamada
posterior de activate com o mesmo pedido retorna essa retirada histórica e não
cria a raiz. Nova ativação exige outra operação e revisão atual.

A confirmação de uma ativação concluída também continua disponível com a opção
desligada. O loader exige os nascimentos originais do job, reserva e recibo;
a confirmação não consulta nem recria o livro atual, e não concede leitura
atual de conteúdo após edição, exclusão ou perda de autorização.

## Arquivos e testes preparados

Produção: módulos de activation/review/effects/contracts, upload/contracts,
editorial audit, artifacts e o novo `bookRestoreEditorialActivation.mjs`.
Fixtures editoriais existentes passam a receber a opção privada; há helper
completo até censo/revisão, sem grants ou raiz semeados.

Foram preparados **17 casos Node e 1 caso SDK**, sem execução:

- Opção padrão fechada e rejeição de flags/certificados no pedido.
- Preparo sem censo não ativa; revisão só revela contagens.
- Prova vinculada ao controle/selo, raiz privada e commit conjunto.
- Edição de contrato e plano pelos escritores normais após ativação.
- Retirada com opção desligada, revisão velha recusada e confirmação histórica.
- Duas retiradas com replay original e selo base preservado.
- Recriação do controle ou selo impede adoção da revisão anterior.
- Cancelamento, rollback integral e retry do pedido exato.
- Histórico após editar/remover raiz, sem reativação.
- Certificado obrigatório para v15 e shape fechado.
- Arquivo somente histórico não fabrica corrente nem revisão.
- Política de publicação preservada sem publicação efetiva.
- Exclusão normal do livro ativado remove o arquivo e preserva o recibo histórico.
- SDK nativo percorre preparo/ativação/edição/exclusão, confere timestamps de
  commit, rejeita mutação direta de clock e leitura direta do arquivo.

O teste SDK usa a opção interna com Admin/Firestore real e Rules no emulador
demo. Não comprova HTTP Auth/AppCheck, interface ou jornada pública v2.
Nenhum teste, syntax/type/lint/formatter/build/browser/coverage/validate ou
`diff --check` foi executado neste incremento. A rodada 5.898/5.480 é anterior
a estas alterações; não prova o código novo.

## Continuação

Implementar leitor privado autorizado do arquivo e das pendências com CAS da
revisão atual, incluindo o ciclo de limpeza da origem de restauração. Concluir
recaptura sem duplicar correntes ou expandir JSON de até 8 MiB, integrar a
interface e só então habilitar o protocolo público. Auditar E1–E5 e executar os
gates antes da integração, reconferindo a principal. Permanecem pendentes
cobertura de funções de 90% e Rules completas. Não houve commit, mergeback,
push, deploy ou servidor iniciado. As cinco etapas continuam formalmente abertas.
