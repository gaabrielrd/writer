# Inventário da portabilidade privada de aventuras

Snapshot histórico: leitores 147–157, base 8c97714, 2026-10-26. Fontes conferidas
no código; grafo indisponível naquela leitura. Inventário de views de captura,
não quantidade de módulos ou percentual de implementação. Arquivo, restauração
e interface avançaram nos planos seguintes; veja a atualização 197 ao final.

## Fontes persistidas e provas

| View / path sob adventures/ID                           | Writer normal e relógio                                      | Leitor / prova da captura                                       |
| ------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Raiz, procedência importada                             | Studio/update; scenes/narrativa/lore/progresso/histórico     | 147/148: owner/schema/flags e createTime/updateTime nativos     |
| workProgress/current                                    | workProgress/Ledger, checklist; import start/materialize     | 147/152: presença e identidade; choices somente no DTO          |
| parts/ID, incluindo content legado                      | scenes/createSceneGroup, deleteSceneGroups                   | 148: parte legado/schema/dono presente, unidade e native token  |
| parts/ID rankSlot                                       | scenes/rebalance/delete                                      | 149: controle mínimo, sem revisão/contagem                      |
| sceneControls/unassigned                                | scenes/move/archive/rebalance                                | 149: singleton opcional explícito e rankSlot                    |
| scenes/ID, incluindo arquivo/sem parte                  | scenes/update/move/archive; blocos aggregate; import prepare | 149: head owner/schema/flags, ranks e hint sem recriar parte    |
| scenes/ID/body/current                                  | scenes text write; history restore; chat apply; import       | 149: head + corpo obrigatório, texto/hash coerentes             |
| scenes/ID/planning/current                              | scenes/updateScene planning; import                          | 149: head + planner opcional/presença própria                   |
| scenes/ID/references/ID                                 | scenes/setSceneReference, índices derivados                  | 149: head + ref nativa, endereço neutro sem label global        |
| sceneBlocks/ID                                          | adventureBlocks create/update/archive/reorder/delete         | 149: head dono/schema e sceneId/cena dona autorizada            |
| sceneBlocks/ID/body/current                             | adventureBlocks text write; history restore; chat apply      | 149: bloco + cena dona + corpo obrigatório, hashes coerentes    |
| arcs/ID / timelineEvents/ID / arcs/ID/milestones/ID     | narrativePlanning/Jobs; root narrativeRevision em cada passo | 150: kind/dono/schema, pai e arcId coerentes                    |
| narrativeControls/sequenceKey arc/event/milestone       | narrativePlanning/rebalance; root clock                      | 150: somente controles conhecidos, ausência explícita           |
| narrativeLinks/ID                                       | narrativePlanning/setReference + remoção por Jobs            | 150: source e ancestrais próprios; alvo neutro não resolvido    |
| lore/ID, incluindo tombstone                            | adventureLore save/delete; root loreVersion + updatedAt      | 151: UID/ID/birth token/revisão e par metadata/corpo            |
| loreBodies/ID                                           | mesmo write atômico de adventureLore                         | 151: metadata ativa e revisão igual, sem órfão; contratos puros |
| workChecklist/ID                                        | workProgress checklist; controle atualiza na mesma transação | 152: todos os itens por ID, title/completed/datas               |
| workVersions/ID                                         | workHistory create/restore/delete; root historyRevision      | 153: target/resource/manifesto/nascimento e native token        |
| workVersionBodies/digest(versionId,index)               | history capture atômico; cleanup de versão marcada deleting  | 153: parentToken, ID/ordinal/UTF-8 e native token               |
| personaId da raiz / personaComplement da cena           | editorChatContext/setAdventurePersonaBinding                 | 154: vínculo com identidade própria; cena não muda raiz         |
| Perfil usado em users/UID/aiPersonas/ID ou preset       | biblioteca privada / definições puras                        | 154: preset hash ou perfil/lote ativo; sem listar biblioteca    |
| mainBlockImage / image do bloco                         | adventureBlocks/setImage, com uso tipado                     | 155/157: head/dono/backlink + library/uso atual                 |
| users/UID/imageLibrary/ID e uses/adventure-block:digest | library e setter; uso só após raiz existir                   | 155/157: ativo/count/path canônico; uso posterior à raiz        |
| PNG canônico no Storage                                 | geração/aceitação do asset, não URL de download              | 155: geração/metageração/accepted fixados, stream/range e retry |
| universeId e universo declarado                         | Studio/link/unlink; universes metadata/privacidade           | 156: none/unavailable/reference por birth, sem duplicar ou lore |

## Relógios, presença e staging

Criação/mudança de membership de cenas/partes/referências/blocos/narrativa/lore
atualiza raiz por writer/ledger; histórico incrementa historyRevision. Checklist
muda workProgress/current, que já pertence à fonte. Exclusão parcial marca
deleting e o reader recusa fonte/membro até o fluxo concluir; não captura metade.

Persona de cena é exceção: atualiza apenas head. A prova desse head é necessária
em resources, bindings de persona e imagens; comparar só RootSource não basta.
Perfis/library/uso/Storage/universo têm clocks independentes e precisam de seus
tokens, incluindo birth para impedir ABA por recriação.

Importação deixa raiz ausente enquanto prepara corpo/cena/parte e cria a raiz
na ativação. Reader remoto recusa raiz inexistente. Depois da ativação os filhos
anteriores são legítimos; imagem exige uso tipado atual criado após a raiz,
não head posterior. Histórico manual só nasce depois da ativação (157).

Ausência de planner/controle é explícita; corpo obrigatório ausente falha.
Tombstone é remoção sem corpo, não ficha ativa. Vínculos null não inventam
perfil/asset. Marcadores externos desconhecidos, inclusive null, não viram
fallback inline. Não há produtor atual de sceneSources de aventura; conversão
de capítulo e suas fontes preservadas pertencem ao domínio de livro.

## O que não é autoria portátil

Contadores/revisões derivadas, índices entity-scenes e chaves de relação,
word ledger, jobs/fences/reservas/recibos, chaves de revisão importada,
downloadtokens/URLs, provider/model/key/chat e lote operacional de persona
não entram como conteúdo. Podem ser consultados como prova quando o contrato
exige, mas não viram payload nem concedem acesso por si.

Somente lore próprio é copiado. Referência de universo/lore externo é neutra;
origem indisponível não adota outro ID, nome ou perfil por coincidência.
Fuso/preferências e atividade/retomada de users são estado da conta.

Rascunhos de cena (sceneDraftStorage/useSceneAutosave), de bloco adicional
(useAdventureBlockDraft) e edições locais de lore não são registros remotos.
A entrada visual precisa definir captura explícita do contexto atual, autoria,
divergência do salvo e recuperação, preservando texto salvo e cópia separada
conforme política aprovada. Não enumerar armazenamento de outra conta nem
afirmar que esses drafts já entram no leitor remoto.

## Condições antes de selar um arquivo

- Inventário de todas as views obrigatórias e unidades, sem cap silencioso.
- Provas completas em segunda passagem, IDs/tokens/presenças iguais; RootSource
  reconferido no fim. Contagem isolada ou última página não certificam conjunto.
- Manifesto histórico fechado por ordinais únicos/quantidade/bytes/SHA.
- Asset deduplicado só com mesmo conteúdo e todos os vínculos autorizados.
- Framer/formato de aventura próprio, preservando bytes/contratos do livro;
  validador de domínio independente, nenhuma ativação parcial utilizável.
- Abort sem footer em fonte alterada, erro, revogação ou família desconhecida.
- Fonte de perfil/asset autorizada revalidada; origem indisponível é hint
  conservador e não fotografia de autoridade/prosa de terceiro.

## Pendências de produto e operação

Selo/assembler/pacote completo, revisão/restauração/remapeamento/mídia da nova
cópia privada, drafts explícitos, recuperação/cancelamento/limpeza, interface,
roundtrip, consumidores/exclusão e validate integral dos próximos blocos.
Nova entrega remota precisa coordenação de Rules/cliente/Admin conforme fase.

O validate do bloco de leitores é evidência local do código testado, sem
concluir P2/P3/D, F2-09, fases 3–5 ou gates humanos/comerciais. Contagem histórica
permanece 8/35; não é estimativa de esforço nem declaração de lançamento.

## Avanço de captura e validação — 2026-10-26

Os planos 159–166 acrescentaram formato, inventário/segunda passagem e captura
integral das oito seções, incluindo histórico/PNG/draft explícito. O plano 167
acrescenta leitor semântico inerte: content-only, sem acesso ou ativação.
As pendências acima de assembler/draft são históricas; agora faltam transporte,
revisão/restauração/remapeamento/mídia, recuperação/UI e roundtrip/consumidores.
A origem externa e o acesso precisam de nova conferência na restauração.

## Fechamento local 195–197 — 2026-10-28

A captura integral agora tem 17 leitores públicos e ação na página da aventura
e editores de cena/bloco. Salvo é o padrão; o texto aberto entra somente por
escolha e é congelado antes do seletor. O arquivo é escrito por partes e só
confirmado após prova/selo e close. Abort preserva o arquivo anterior.

A restauração pelo Estúdio inclui inspeção, revisões explícitas, nova cópia,
recuperação/pausa/cancelamento e finalização de mídia/coleta. O corpus nativo
gerou e restaurou Unicode grande, lore/persona, duas versões manuais, rascunho
separado e duas imagens por uso. Os handlers/serviços são reais; Auth/App Check/
SDK/chooser e bancos/Storage são doubles/sintéticos. OPFS e recuperação local
usam APIs nativas. Seletor do SO e produção não estão comprovados.

[Evidência e validate integral](../../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md):
4791 frontend/359 arquivos, 90 scripts, 3798 Functions, sintaxe de 393 módulos,
tipos/build/smoke e limites verdes. As pendências históricas acima de
transporte/restauração/UI foram atendidas nesses recortes; falta consolidar
matriz ampla de consumidores/exclusão, compatibilidade/corpus e gates de P2.
P3/D/F2-09 e macro 8/35 continuam abertos. Sem implantação nem operação remota.

## Consumidores e compatibilidade — 198

[Matriz atual](consumidores-aventuras-restauradas.md) prova o ciclo normal após
coleta, com edição/histórico/contexto/recaptura e cinco casos de corpus.
O texto legado agora é fonte visível e sanitizada; cenas sem parte têm localização/
prévia e recuperação explícita idempotente para Sem parte, sem criar agrupador.

[Entrega dirigida](../../entregas/2026-10-28-writer-v2-ciclo-normal-das-aventuras-restauradas.md)
registra 35 Vitest distintos, 30 Node/SDK e nove verificações Chromium.
Falta exclusão completa de aventura antes de P2; P3/D/F2-09 e macro 8/35 continuam
abertos. Validate integral no fechamento desse bloco; sem operação remota.
