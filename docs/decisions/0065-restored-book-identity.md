# ADR 0065 — Identidade da cópia de livro restaurada

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M21](../tasks/writer-v2/execucao/54-remapeamento-da-identidade-restaurada.md).

## Decisão

bookRestoreRemap transforma identidades por um contexto fechado schemaVersion 1,
jobToken, sourceBookId e bookId reservado. SHA-256 canônico inclui o domínio
writer-book-restore-identity, contexto, tipo, pai e ID original. Prefixos restore-
e custom- produzem IDs limitados, sem mapa crescente do projeto. Um vetor SHA
independente fixa o contrato. Não usar esse hash como autorização.

Mapear atos, capítulos, cenas, lore local, arcos/eventos/marcos, versões, perfis
e capa. Marcos incluem arco original no domínio; versão de capítulo e cena com
mesmo ID continuam recursos distintos. Fontes de conversão usam o ID remapeado
do capítulo. Capítulos/cenas removidos recebem identidade histórica sem criar
documento atual. Singleton unassigned/current permanece literal.

Recalcular controles por sequenceKey, referências de cena por digest da referência,
vínculos narrativos por digest de source/reference, envelopes de recurso por
[kind,parentId,id] e vínculos de persona por [scope,ownerId]. Contagens e índices
nativos não são copiados. IDs derivados iguais convergem para a mesma relação
lógica; futuros writers devem conferir conteúdo e contar identidades distintas,
sem mesclar recursos com texto.

## Perfis e dados externos

M15 já recusa perfis de mesmo ID com conteúdo diferente. Cada perfil usado recebe
um único ID custom por pedido, inclusive snapshots de presets, conservando texto,
traits/overrides e estado. Assim não depende do preset atual nem reutiliza perfil
da conta de destino. Cópias globais de perfil e sua visibilidade só serão escritas
no materializador; este módulo não altera a biblioteca.

Persona ausente no legado conserva referência nova indisponível, sem inventar
perfil, aplicar default ou aproveitar um perfil atual. O teste de novo pacote
estrito usa perfis completos; ausência legada é validada separadamente e ainda
exige tratamento do protocolo nativo/exportador posterior, não é roundtrip final.

Universo/origem e referências a outros projetos mantêm IDs/procedência, sem
conceder acesso. Referência tipada book do próprio livro troca scopeId/entityId.
Relação textual de lore pode ter ID local parecido com universe:/adventure:.
Consultar ['node','lore','',id] do índice validado para dar precedência ao local;
na ausência, manter descriptor externo. Um ID inexistente local comum continua
uma referência local neutra sob a nova identidade.

## Leitor e limites por unidade

readMappedItem é interno ao leitor M20; readItem original continua disponível.
A projeção mantém metadados/prosa/hash/ranks/datas do arquivo para o futuro
escritor, sem confundir DTO com documento nativo de criação. IDs dentro de texto,
rótulos, descrições ou trait IDs não são substituídos. Decorações de lore do editor
são derivadas e não integram o HTML salvo; texto deve permanecer byte a byte.

Array de relações é separado da base: loreRelations null significa ausente;
count zero significa presente vazio. read(offset,limit) aceita até 64 relações,
com store/provas próprios de existência/ausência. verify(tx) confere M20 e índices
antes da escrita na mesma transação. Nenhum Set/lista de provas cresce com o total
das relações. Fluxo raw usa prova M20 e rawIdentity remapeada, sem mudar bytes.

## Pendências que permanecem obrigatórias

Nenhuma escrita, Rule, coleção, dependência ou endpoint. Antes dos writers,
ampliar inventário/compatibilidade de cleanup. Documentos nativos precisam
reconstruir autor/datas/revisões/ledger/índices e tratar o crescimento de tamanho
após remapear IDs, sem truncar ou reduzir o limite do arquivo. Não importar status,
grants, créditos ou credenciais.

Faltam escritores e esquema nativo, staging de perfis/mídia, reautorização/
ativação, host/UI/roundtrip/validate P1. O rascunho diferente deverá ser uma versão
separada; texto salvo continua manuscrito. A projeção não conclui restauração.
