# P3 — portabilidade privada de campanhas

- Data: 2026-10-29.
- Estado: primeiro incremento interno validado por testes direcionados; P3 aberto.
- Base: 25eb87f. Escopo aprovado pelo [contrato 25](25-lore-importacao-e-portabilidade.md).
- Predecessor técnico: [auditoria P2](200-auditoria-tecnica-da-portabilidade-de-aventuras.md).
- Macro permanece 8/35; não encerra F2-09, fase 2 ou Writer V2.

## Objetivo e requisitos

Salvar e restaurar uma campanha como nova cópia privada, preservando a edição
congelada usada pela mesa, notas próprias, sessões, pistas, missões, estados,
ordens, vínculos e variantes/legadas autorizadas. Conteúdo próprio permanece
recuperável quando a origem derivada não está disponível. A revisão explica
ausências; nenhuma edição ou revogação transforma derivado em nota própria.

O arquivo usa DTO fechado e versionado, manifesto/hash e prova de procedência
produzida pelo servidor. Não aceitar uma declaração de origin do cliente como
prova. Assinatura também não concede autorização vigente. Não substituir a
base antiga por recaptura da aventura atual. Não conceder compra, participação,
ownership ou acesso por meio do arquivo. A implementação do atestado e sua
retenção será fechada com o inventário da base, antes de habilitar exportação.

Texto e binários passam por unidades limitadas, com pressão de consumo e sem
truncagem; não reunir projeto completo em documento ou JSON gigante. Preservar
UTF-8 literal e corpus F1. Reutilizar apenas contratos neutros pertinentes do
framing/arquivo; não declarar contêiner de livro ou aventura como campanha.

## Inventário conferido no código atual

| Grupo              | Origem atual                                                                                     | Tratamento portátil e conferência necessária                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raiz               | campaigns/ID                                                                                     | Título, descrição, status e vínculo autorizado; nova identidade ao restaurar. Nascimento/updateTime nativos, schema e revisão próprios.                |
| Preparação privada | workProgress/current, workChecklist                                                              | Preferências/metas/checklist próprios; reconstruir controles, sem levar retomada ou clock global da conta.                                             |
| C1                 | notes, noteState/current                                                                         | Notas ativas com texto próprio exato; controle de coleção e prova por item, sem tombstones/recibos como conteúdo.                                      |
| S1                 | sessions, sessionState/current                                                                   | Sessões, resumo próprio, data civil, estado e ordem; reconstruir revisões e contadores.                                                                |
| S2                 | sessionReferences, sessionReferenceState/SESSION                                                 | Referências de cena/lore por sessão. Conferir cada controle, item e alvo; ausência da origem aparece na revisão.                                       |
| S3                 | preparationItems, preparationBodies, preparationState/current                                    | Catálogo privado de pistas/missões, corpos, estados e ordem. Item pertence à campanha.                                                                 |
| Vínculos S3        | sessionPreparationLinks, sessionPreparationState/SESSION                                         | Participação e ordem por sessão, distintas da ordem do catálogo; remapear IDs e preservar itens ao remover uma sessão.                                 |
| Base congelada     | users/UID/campaignBases/BASE: items, bodies, links, loreReferences, images                       | Edição exata com procedência verificável; reautorizar origem antes/depois de cada I/O e ao ativar. Imagens por geração/hash e uso nativo autorizado.   |
| Lore adaptado      | loreVariants/loreVariantBodies ou loreGenerations/GEN com esses filhos; loreVariantState/current | Variantes e legadas mantêm origem e autorização; verificar geração ready, bodyBinding, manifesto e corpos por unidade.                                 |
| Coordenação C3     | campaignAdoptionGuards, adoptions/comparisons/preparations e clocks                              | Controles operacionais não são conteúdo portátil; bloquear captura incompatível ou invalidá-la por provas, sem exportar jobs/leases/fences.            |
| Autorização        | campaignAuthorization/current e origens atuais                                                   | Conferir no servidor; nunca converter token/epoch/atestação em grant do arquivo.                                                                       |
| Exclusão C4        | campaignDeletionReservations e cleanup v1–v4                                                     | Reserva bloqueia captura/restauração no ID retirado. Antes de persistir novos jobs/prosa/pins, ampliar inventário com compatibilidade explícita v1–v4. |

A raiz não é um clock de todo o projeto. C1, S1 e S3 possuem controles próprios.
Mutações S2 e vínculos S3 têm controles por sessão e podem ocorrer sem modificar
a raiz ou os controles globais. A captura completa terá inventário paginado,
provas por unidade e segunda conferência de todas as famílias e controles,
inclusive ausência/presença, inserções/remoções e troca de encarnação.
Não usar somente a âncora inicial como prova final do backup.

## Primeiro incremento: âncora privada de metadados

Adicionar functions/src/campaignBackupSource.mjs e teste dedicado. O serviço
interno aceita somente campaignId e expectedSourceToken opcional, valida dados
antes de I/O e congela os valores antes de await. UID obrigatório é conferido
como string/ID; o token opcional deve ser SHA-256 hexadecimal minúsculo.

Exigir tx.getAll com fieldMask antes de ler a reserva C4. Conferir reserva,
ownership, schema 1, revisão segura positiva e ausência de deleting da raiz,
antes dos controles. Não ler título, descrição, conteúdo, resumo, base ou
origem; não criar controles ausentes. Capturar nascimento e atualização reais,
com timestamps válidos e updateTime não anterior a createTime.

Conferir cinco controles singleton, preservando ausência:
workProgress/current, noteState/current, sessionState/current,
preparationState/current e loreVariantState/current. Validar schema de todos;
os quatro controles de domínio devem pertencer ao dono, ID e encarnação da
campanha, com revisão segura não negativa. Sessões/preparação exigem nextOrder
positivo e lore exige baseId hexadecimal. A âncora não certifica a relação
atual com essa base: isso pertence ao leitor autorizado da família.

Retornar somente schemaVersion, campaignId e sourceToken, derivado do escopo
root-fixed-controls, UID, ID e identidades nativas da raiz/controles. Alteração
observada contra token esperado resulta em campaign-backup-source-changed.
Metadados armazenados/porta inconsistentes resultam em
campaign-backup-source-inconsistent, sem fallback de leitura completa.

O contrato é interno, somente leitura, sem endpoint/UI, grant, chave, job,
pin, bytes ou reserva nova. Não altera C4 ainda. A indisponibilidade da aventura
original não impede conferir a âncora própria.

## Sequência de implementação

1. Âncora privada acima, testes de escritores reais e metadados sem prosa.
2. Inventário/DTOs fechados por domínio, leitor da estrutura/próprios, paginação,
   controles por sessão e provas finais de consistência, sem arrays ilimitados.
3. Contrato da procedência verificável da edição congelada, disponibilidade por
   recurso, autorização atual e tratamento explícito de variantes/legadas.
4. Base/lore/mídia por unidades com hashes e provas; compor captura consistente
   e arquivo temporário confirmado somente após selo e reconferência final.
5. Antes de produtores persistentes, integrar cleanup C4 versionado e reservas;
   depois, upload/validação de conteúdo privada com retry/cancelamento/retomada.
6. Restaurar próprios em nova identidade, mapear IDs por domínio/pai e reconstruir
   controles/contadores; derivados só da edição comprovada e ainda autorizada.
7. Revisão e ativação atômica, readback pelos serviços ordinários e preservação
   dos próprios quando derivados ficam indisponíveis.
8. Interface no Estúdio com estados explícitos, recuperação, catálogo de pedidos,
   download/revisão/cancelamento e fronteiras reais de autenticação.
9. Ciclo integrado rico/vazio, duas mesas independentes, origem antiga/removida/
   revogada, versões/formatos anteriores, falhas/retentativas e exclusão C4.
   Executar validate completo no fechamento, sem CI ou envio remoto.

A sequência pode ser dividida em incrementos menores, sem antecipar habilitação
de um produtor cujo inventário/consumidores/limpeza ainda estejam incompletos.

## Critérios de aceite do primeiro incremento

- [x] Só metadados mascarados, nenhuma query/alteração/prosa/URL/chave.
- [x] DTO mínimo estável; controles ausentes permanecem ausentes.
- [x] Escritores reais de notas, sessões, preparação e checklist invalidam token,
      mesmo quando a raiz não muda.
- [x] Nascimento/reescrita/recriação, dados inválidos, conta diferente, C4 e porta
      sem máscaras falham com segurança; valores do pedido ficam congelados.
- [x] Conferência própria funciona com origem derivada indisponível.
- [x] Limite da âncora demonstrado para vínculos por sessão; nenhuma alegação
      de captura completa ou autorização da edição.
- [x] Testes direcionados, lint/sintaxe, documentação/formato e revisão do diff
      registrados. Validate integral reservado ao fechamento do bloco P3.
- [x] Commit somente local, sem interferir no dev server da porta 5173.

## Riscos, suposições e não escopo

A autorização técnica já permite avançar sem piloto humano/habilitação
comercial concluídos. A política final de retenção de perguntas no plano 199
permanece aberta e não é alterada aqui; chats não entram no backup.

Não há decisão nova sobre marketplace, preços, regras comerciais, persona,
licenças ou compartilhamento. Nenhuma dependência nova, Rules, segredo,
migração ou implantação neste primeiro incremento. Um token consistente
não certifica disponibilidade da base ou compatibilidade completa da campanha.
Os portões humanos/comerciais e provas em credenciais reais continuam distintos
da evidência dos bancos/portas de teste.

## Passo 2 — inventário próprio por unidade e sessão

O [plano 202](202-inventario-proprio-da-portabilidade-de-campanhas.md) implementa
o inventário interno de nove famílias, com lookahead, provas nativas por recurso
e controles/dependências por sessão. 20 testes novos e 18 da âncora passaram.
Sessão/item excluído mantém vínculos observáveis; cursor/página não certificam
o projeto completo. Ainda faltam DTOs/texto em chunks e composição/segunda
passagem do arquivo, além da procedência/base, restauração e interface P3.
Não fecha o passo 2 inteiro, P3/D/F2-09 ou a macro 8/35.

## Passo 2 — conteúdo próprio em partes verificadas

O [plano 203](203-conteudo-proprio-da-portabilidade-de-campanhas.md) acrescenta
nove DTOs próprios e leitura por partes de até 65.536 bytes após a prova de
unidade/dependências. 57 testes dirigidos passaram, incluindo 19 novos.
Controles/tombstones e vínculos de pais inativos são omitidos explicitamente;
itens/corpos ativos permanecem próprios. Ainda faltam composição/segunda
passagem integral do arquivo e os demais passos de P3/D/F2-09; macro 8/35.

## Passo 2 — captura incremental e segunda passagem dos próprios

O [plano 204](204-captura-incremental-dos-proprios-de-campanha.md) transmite as
partes próprias com pressão de consumo, hashes integrais e reconferência das
nove famílias desde o início. Prova own-data-only apenas no término natural;
não é arquivo/selo/procedência ou grant. 21 testes novos e 57 regressões backend
passaram. Sem persistência nova; base/variantes/mídia e demais passos P3/D/F2-09
continuam pendentes; macro 8/35.

## Passo 3 — origem autorizada da base congelada

O [plano 205](205-origem-autorizada-da-base-congelada.md) implementa primeiro o
gate privado de metadados/encarnação. Editar a origem mantém a edição antiga;
origem recriada/deletada não autoriza essa base. Lore global tem disponibilidade
separada; guard/clock/geração conferidos. 20 testes direcionados positivos.
Manifesto/atestado, gates individuais, variantes/legadas/mídia e demais passos
P3/D/F2-09 continuam pendentes; macro 8/35. Token não é procedência portátil.

## Passo 3 — itens e campos congelados

O [plano 206](206-itens-e-textos-da-base-congelada.md) acrescenta inventário
lógico dos sete tipos e campos de texto da base exata, com hierarquia,
autorização individual de fichas, partes limitadas e fluxo SHA no cliente.
20 Node novos, 11 regressões e 29 Vitest positivos. Não fecha o passo 3:
inventário físico completo/cobertura/órfãos, variantes/legadas, imagens e
manifesto/atestado servidor seguem obrigatórios. Arquivo/restauração/UI/ciclo
P3/D/F2-09 continuam abertos; macro 8/35. Somente commit local.

## Passos 3–4 — inventário físico e auditoria por item

O [plano 207](207-inventario-fisico-e-auditoria-da-base.md) inventaria quatro
famílias físicas e lê snapshot, com provas de vínculos e auditoria servidor dos
bytes de cada campo. Detecta corpos/pins ausentes e órfãos em passes opostos.
26 testes Node novos, 31 regressões e 29 Vitest positivos. Ainda é necessário
compor segunda passagem/reconciliação integrais, variantes/legadas/bodyBindings,
binários/Storage e atestado nativo antes do arquivo/restauração/UI/ciclo P3.
Não fecha passos 3–4 nem P3/D/F2-09; macro 8/35, somente commit local.

## Passos 3–4 — variantes e âncoras congeladas

O [plano 208](208-variantes-e-ancoras-do-lore.md) inventaria variantes da geração
declarada e lê corpo/âncora por bindings exatos. Removed/inactive/legacy são
preservados, com autorização da âncora e da base do corpo antes de conteúdo.
74 Node e 29 Vitest dirigidos positivos. Ainda faltam inventário físico do grafo
de bindings, reconferência conjunta, binários/imagens, manifesto/atestado e
arquivo/restauração/UI/ciclo. P3/D/F2-09 abertos; macro 8/35, commit local.

## Passos 3–4 — corpos físicos das variantes

O [plano 209](209-inventario-fisico-das-variantes.md) acrescenta inventário de
lojas/corpos, cobertura por binding e sonda de órfãos da encarnação, sem prosa.
Resíduo operacional não vira conteúdo portátil. 25 testes novos e 28 regressões
dirigidos positivos. Reconferência/reconciliação conjuntas, imagens, atestado e
arquivo/restauração/UI/ciclo seguem obrigatórios. P3/D/F2-09 abertos; macro
8/35, somente commit local. Não é certificado de vazio de árvore arbitrária.

## Passos 3–4 — imagens congeladas por geração exata

O [plano 210](210-imagens-congeladas-do-backup.md) lê PNG/hash/ranges com a
geração decimal exata, reautoriza antes/depois de I/O e oferece fluxo cliente
com SHA integral, pressão de consumo e interrupção. 117 testes Node distintos
e 38 Vitest dirigidos positivos. Prova parcial não atesta arquivo completo.
Seguem reconferência/reconciliação conjuntas de todas as famílias, manifesto/
atestado nativo, framing, persistência/cleanup, restauração e UI/ciclo.
Ampliar C4 v1–v4 e consumidores antes de produtores persistentes. P3/D/F2-09
abertos; macro 8/35, somente commit local, validate integral no grande bloco.

## Passos 3–4 — auditoria nativa conjunta

O [plano 211](211-auditoria-conjunta-do-backup.md) reúne todas as famílias,
conteúdos e provas em duas passagens completas com fontes finais, mantendo
somente páginas/unidades limitadas, hashes e contadores. Cobertura/órfãos,
âncoras antigas e imagens exatas são revalidados. 116 Node e 38 Vitest dirigidos
positivos. campaign-native-audit não é assinatura nem arquivo. Seguem manifesto/
atestado portátil, framing, persistência/cleanup C4 v1–v4, restauração e UI/ciclo.
P3/D/F2-09 continuam abertos; macro 8/35, commit local, sem CI.

## Passos 3–4 — manifesto e procedência assinada

O [plano 212](212-manifesto-e-procedencia-assinada.md) acrescenta raiz de
nascimento das origens e assinatura de manifesto produzida somente após a
auditoria real. Verificação de emissão dispensa as bases antigas e não é grant.
31 testes novos e 119 regressões Node positivos. Faltam framing/arquivo,
cobertura de conteúdo/evidências, reautorização por nascimento, persistência/
cleanup, restauração/UI/ciclo. Chaves reais não foram configuradas. P3/D/F2-09
abertos, macro 8/35; somente commit local, validate integral no grande bloco.

## Passos 3–4 — arquivo por fluxo e integridade completa

O [plano 213](213-arquivo-nativo-de-campanha.md) publica unidades/bytes/evidências
para destino temporário, com contêiner próprio e manifesto assinado após
reconferência. Validação independente cobre cadeia/EOF, unidades e ambas as
raízes, inclusive arquivos reencadeados. 29 testes novos e 81 regressões Node
positivos. Integridade não autoriza origem atual ou restauração. Seguem
consumidores de vínculos/nascimento, cleanup C4 v1–v4, persistência/retomada,
restauração/UI/ciclo. P3/D/F2-09 abertos; macro 8/35, somente commit local.

## Passos 3–4 e 6 — revisão atual das origens

O [plano 214](214-revisao-autorizada-das-origens.md) verifica evidências do arquivo
com índice autenticado e confere acesso atual sem depender de campanha/base
antigas. Origem recriada, C4 e alterações observadas recusam a revisão ou marcam
ausência. 35 testes novos e 60 regressões Node positivos. A prova não ativa
restauração; faltam vínculos semânticos e consumidores ordinários de procedência,
cleanup C4 v1–v4, persistência/retomada, materialização/ativação e UI/ciclo.
P3/D/F2-09 abertos; macro 8/35, somente commit local, validate no grande bloco.

### Contrato do universo organizacional

A revisão 214 cobre origens derivadas. A raiz conserva universeId, que pode ser
distinto do universo congelado ou existir sem base. O [plano 215](215-universo-organizacional-no-backup.md)
acrescentou evidência project com nascimento próprio, provenanceVersion 2 e
revisão separada. Arquivos v1 permanecem legíveis com vínculo unproven; não religar
apenas pelo ID ou substituir pelo universo da base. 21 testes novos e 117
regressões passaram; vínculos semânticos completos, consumidores, cleanup C4,
persistência/retomada e restauração/UI/ciclo continuam pendentes.

## Passo 6 — semântica própria antes da materialização

O [plano 216](216-semantica-dos-dados-proprios-da-campanha.md) prepara a leitura
dos próprios com DTOs canônicos, joins de sessão/preparação/corpo/controles e
organização raiz/project. Índice MAC temporário não guarda prosa, preserva
omissões legítimas e não autoriza o alvo derivado. 47 novos e 157 regressões
Node positivos. Semântica completa da base/lore/imagens e consumidores
ordinários continuam pendentes, seguidos por C4 antes de produtores persistentes,
upload/retomada, materialização/ativação e UI/ciclos. P3/D/F2-09 e macro 8/35 abertos.

## Passos 3–4 — correção necessária dos campos UTF-8

O [plano 217](217-campos-utf8-no-arquivo-de-campanha.md) remove uma falha real
descoberta ao inspecionar os derivados: chunks nativos de texto não são sempre
fixos em 65.536 bytes. Emissão contentVersion 2 conserva as fronteiras e leitor
mantém v1 original, com versão/domínio assinados. 19 novos e 231 regressões
positivos, inclusive campo que exige três partes para 131.072 bytes e lore legado.
Não encerra a semântica completa dos derivados ou os passos 5–9; P3/D/F2-09
e macro 8/35 permanecem abertos, validate no fechamento do grande bloco.

## Passos 3–4 e 6 — semântica derivada e revisão composta

O [plano 218](218-semantica-dos-derivados-da-campanha.md) confere os derivados
presentes e suas ausências explícitas, com DTOs fechados e joins de campos/
corpos, pais, links/ledger, imagens e âncoras. A revisão composta exige a mesma
cadeia/tamanho/manifesto para próprios/derivados/origens. Referências de âncora
externas são não resolvidas e não concedem acesso. 62 novos e 151 regressões
dirigidas positivos; validação integral local do bloco passou (npm run validate,
código 0).

Faltam leitores/consumidores de procedência e referências opacas restauradas,
inventário/cleanup C4 v1–v4 antes de persistir, upload/retomada, nova cópia/
materialização/ativação e interface/ciclos. Não encerrar P3/D/F2-09 ou macro 8/35.

### Leitores de origem restaurada — incremento 219

[Plano 219](219-identidade-das-fontes-nos-leitores.md) e
[ADR 0249](../../../decisions/0249-campaign-restored-source-readers.md) preparam
base/item/referências, lore/âncoras retidas e comparação com provas privadas por
base e autorização por nascimento original. 31 novos e 122 regressões dirigidos
positivos. Não habilita produtor persistente: backup/reexportação, referências
opacas e inventário/cleanup C4 v1–v4 continuam antes da materialização.

### Backup das cópias restauradas — incremento 220

[Plano 220](220-backup-das-campanhas-restauradas.md) e
[ADR 0250](../../../decisions/0250-campaign-restored-backup-readers.md) integram
a prova original a fontes/itens/âncoras/corpos do backup. Emissão assinada e
revisão completa de cópia rica passaram sem base antiga e sem substituir
conteúdo congelado por revisão viva; 20 novos e 373 regressões positivos.
Referências opacas e inventário/cleanup C4 v1–v4 ainda antecedem qualquer
produtor persistente; upload/retomada, materialização/ativação e UI/ciclos pendem.

### Referências lógicas da base — incremento 221

[Plano 221](221-referencias-portateis-da-base.md) e
[ADR 0251](../../../decisions/0251-campaign-portable-base-references.md) preparam
a leitura/reexportação de links/ledger sem reconstruir origem por hash.
21 novos e 251 regressões positivos, com emissão assinada/revisão completa.
Vínculos de sessões e relações externas de lore/variantes continuam necessários;
depois inventário/cleanup C4 v1–v4 antes de materializar dados persistentes.

### Materiais de sessão da cópia — incremento 222

[Plano 222](222-materiais-restaurados-nas-sessoes.md) e
[ADR 0252](../../../decisions/0252-campaign-restored-session-materials.md) conferem
a prova por cena/bloco nos caminhos S2, inclusive candidatos e mídia.
16 novos e 27 regressões positivos. Não muda o DTO próprio de vínculo nem
o contrato de adoção explícita. Relações externas e inventário/cleanup C4 v1–v4
continuam antes do produtor persistente; materialização/ativação/UI/ciclos pendem.

### Relações lógicas do lore congelado — incremento 223

[Plano 223](223-relacoes-portateis-do-lore-congelado.md) e
[ADR 0253](../../../decisions/0253-campaign-portable-frozen-lore-relations.md)
preparam relações da base em leitura/C2/backup sem reconstruir IDs/descritores.
20 novos e 179 regressões positivos, incluindo save/discard e âncora retida
após adoção/restauração. Corpos opacos de variantes, inventário/cleanup C4 e
restauração persistente/Estúdio/ciclos continuam necessários.

### Formato das relações não resolvidas — incremento 224, etapa A

[Plano 224](224-corpos-de-variantes-com-relacoes-opacas.md) e
[ADR 0254](../../../decisions/0254-campaign-unresolved-relation-format.md) versionam
conteúdo/raiz lógica em 3 para conservar relação não resolvida independentemente
da disponibilidade do alvo. Leitura 1/2 continua estrita. 22 novos e 542 regressões
positivos. Etapa B de codec privado e ciclo completo de edição/adoção/reexportação
continua obrigatória, seguida por inventário/cleanup C4 antes de persistência.
P3/D/F2-09, ativação/Estúdio/ciclos e macro 8/35 permanecem abertos.

### Ciclo das variantes portáteis — incremento 225, etapa B

[Plano 225](225-ciclo-das-variantes-com-relacoes-nao-resolvidas.md) e
[ADR 0255](../../../decisions/0255-campaign-portable-variant-body-lifecycle.md)
integram o codec privado aos leitores, save/remove/restore/discard, adoção e
backup. Preservação de chaves/ordem e reexportação assinada/revisada positivas;
41 novos e 627 regressões passaram. A entidade do cliente permanece nativa.
Próximo: inventário/cleanup C4 v1–v4 e validate do bloco de leitores/cleanup
antes de produtor persistente, upload/retomada, materialização/ativação e
Estúdio/ciclos. P3/D/F2-09 e macro 8/35 continuam abertos.

### Inventário C4 dos dados materializados — incremento 226

[Plano 226](226-inventario-c4-das-campanhas-restauradas.md) e
[ADR 0256](../../../decisions/0256-campaign-versioned-deletion-inventory.md)
centralizam layouts 1–4 e provam exclusão de prova/codec/corpos emprestados e pins,
sem prosa, autorização da origem ou reinterpretação de job antigo. 11 novos e
57 regressões positivos; validate integral 219–226 verde com 9.710 testes.
O [inventário físico](../inventario-portabilidade-campanhas.md) não declara jobs,
uploads ou índices futuros como coletados: integrar seus contratos de coleta,
cancelamento e reservas antes de qualquer produtor. Depois upload/retomada,
remapeamento/materialização/ativação e Estúdio/ciclos. P3/D/F2-09 permanecem abertos.

### Upload temporário antes de ativação — incremento 227

[Plano 227](227-upload-privado-retomavel-de-campanhas.md) e
[ADR 0257](../../../decisions/0257-campaign-private-resumable-upload.md) acrescentam
job reservado/cifrado com retomada e coleta própria v1 antes do append. Marcador
sem ownerId não é mesa ativa: C4 público não inicia nele; mutações ativas do
upload consultam sua barreira e a criação nativa consulta a reserva do upload.
Não alterar inventários C4 1–4; integrar os recursos a C4 antes da futura ativação.
49 novos e 50 regressões, mais 19 casos SDK/Rules distintos, positivos. A fonte
persistida já foi composta com revisão completa real assinada. Revisão persistida,
remapeamento/materialização, mídia, ativação e Estúdio/ciclos continuam pendentes.
