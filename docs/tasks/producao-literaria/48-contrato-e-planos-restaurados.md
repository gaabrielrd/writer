# Incremento 48 — preparo do contrato e dos planos restaurados

## Estado

Implementação interna de E5.5 na worktree `codex/producao-literaria`. Complementa
[o materializador privado](47-materializacao-editorial-privada.md). Nenhum livro é
ativado e nenhum método novo foi exposto ao cliente. O plano integral continua
ativo; as cinco etapas não estão formalmente encerradas.

## Cópias no formato de edição

`projectBookRestoreEditorialHead` aceita somente artefatos incluídos de contrato
ou plano com linhagem explícita `current`. Versões anteriores, indisponíveis e
registros sem declaração de corrente permanecem no arquivo histórico. Não há
inferência de corrente pelo maior timestamp ou por ordem arbitrária de captura.
A validação semântica já recusa dois contratos correntes. O preparador mantém
uma defesa adicional contra candidatos duplicados e não adota recursos existentes.

Contrato e planos usam o formato dos escritores atuais, com revisão nativa 1 e
horário do preparo no servidor. Datas/revisão da fonte ficam na pendência histórica;
não são promovidas a datas de nascimento do novo documento.

- Contrato: dados e relações entre decisões são preservados. IDs dessas decisões
  são locais ao contrato da nova cópia; preservá-los evita aumentar um payload de
  180 KiB e conserva o grafo de substituição. Identidades de livro, artefato e plano
  continuam novas. Política explícita de colaboração passa a orientação; seu
  valor histórico fica separado. Ausência da política continua ausência, inclusive
  no limite de tamanho. Não são copiados jobs, recibos ou consentimentos executáveis.
- Plano: título/campos são preservados e a cópia corrente começa como proposta.
  Referências portáteis remapeadas ficam em `pendingReferences` na revisão privada;
  `plan.references` começa vazio. Nenhum sourceToken é inventado. A vinculação futura
  exige seleção/autorização atual e confirmação explícita. O estado histórico
  original permanece no arquivo e na metadata de revisão.
- Cada cópia recebe sua primeira versão e um registro privado de revisão. A revisão
  fixa a identidade do artefato histórico, seu estado e as referências pendentes. Fixa também revisão/hash da cópia nativa
  inicial, para não atribuir essas pendências a uma edição posterior sem CAS.
  `execution: disabled`, `publication: private` e `review: required` não são grants.

Isso prepara documentos compatíveis com edição. Ainda não comprova a jornada
real dos leitores/escritores após ativação: a raiz permanece ausente e esses
consumidores continuam sujeitos à autorização normal do projeto.

## Escrita e provas

`advanceBookRestoreEditorialHeads` é interno, fora de `BOOK_RESTORE_METHODS` e do
catálogo público. Exige fonte v2, estado content-verified, base auditada e cópia
histórica `materialized`. Reusa o transporte/job privado e os recibos existentes.

O scan é limitado a 16 itens de metadata e no máximo um candidato corrente por
unidade. Apenas contrato/plano é decodificado, dentro do limite existente de um
item; não se monta o histórico inteiro. Fonte, registro histórico, IDs, tamanho,
hash semântico e token nativo são conferidos antes de derivar os estados.

Corrente, versão, revisão, controle, contador e recibo compartilham a transação.
Todas as provas são consumidas por verify(tx) antes dos writes. Os três novos
recursos têm nascimento confirmado na unidade seguinte, com igualdade do commit,
hash e pares tipo/ID/versão. A cadeia de provas e o cursor são privados. Replay
consulta o recibo antes de produzir; erro não dispara reenvio automático.

`bookRestoreEditorialRead` centraliza a leitura autenticada comum aos dois
preparadores. O contador integral inclui as cópias editáveis, sem reiniciar o
ledger da materialização. Controles v15 anteriores sem o campo heads continuam
legíveis; o campo opcional novo tem schema fechado e só existe após materialized.
O getter devolve somente fase, posição e contagens dessa preparação.

## Inventário antes dos recursos

O inventário privado v15 ganha tipos/endereço fechados para:

| Tipo                       | Destino sob o livro reservado                   |
| -------------------------- | ----------------------------------------------- |
| editorial-contract         | literaryProduction/current                      |
| editorial-contract-version | literaryContractVersions/1                      |
| editorial-plan             | literaryPlans/restore-HASH                      |
| editorial-plan-version     | literaryPlanVersions/HASH                       |
| editorial-review           | literaryRestoreReviews/contract ou restore-HASH |

Os namespaces devem estar vazios antes do primeiro preparo. Um recurso estranho
não é sobrescrito nem contado como adoção própria. Journals e recibos autenticam
cada nascimento. Cancelamento fecha personas e capa, remove partes históricas
antes dos cabeçalhos e limpa também correntes, versões e revisões pelo mesmo
inventário. Ausência física é reconferida antes de certificar conclusão.
Essa evolução permanece interna, anterior a qualquer rollout público do v15.

## Testes preparados

Foram preparados **18 casos dedicados**: 16 de projeção/jornada nativa, um adicional
de endereços do inventário e um SDK. Cobrem compatibilidade dos DTOs, decisões e
políticas históricas, referências pendentes, identidade por job, ausência de
corrente implícito, limite de 180 KiB sem política acrescentada, preservação do
arquivo, escrita atômica, replay, rollback, recriações, fonte ambígua, recursos
estranhos e cancelamento. O contrato de métodos internos também foi atualizado.

A fixture da jornada executará upload/validação/materialização reais, sem semear
uma raiz ativa. O double transacional não substitui a prova SDK. O teste SDK
preparado usa Firestore real para helper/journal/recibo/Rules e limpeza, mas não
certifica sozinho a jornada v2 inteira nem a ativação.

**Nenhum teste ou check foi executado neste incremento.** Syntax, typecheck, lint,
formatter, build, navegador, cobertura, validate e diff-check continuam adiados
até o próximo gate de integração, precedido de conferência da principal. As
aprovações da rodada anterior não validam os incrementos 47–48.

## Trabalho seguinte

Concluir o censo físico e seus certificados; integrar revisão e ativação atômicas,
inclusive flags/clocks literários da raiz; expor a revisão das referências e a
leitura privada do histórico; integrar recaptura e exclusão do livro antes de
admitir recursos em livros ativos. A recaptura deve distinguir os novos correntes
das linhagens históricas preservadas, sem duplicar um contrato current.

A preparação local não resolve a portabilidade em restaurações repetidas nem
substitui a auditoria E1–E5. O fechamento continua exigindo cobertura de functions
de 90% e Rules completas, sem ampliar limites para aprovar. Sem commit, merge de
volta, push, deploy, servidor ou runner iniciado neste incremento.
