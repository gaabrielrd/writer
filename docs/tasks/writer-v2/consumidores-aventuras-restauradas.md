# Consumidores das aventuras restauradas

Snapshot local de 2026-10-28, base fe49e9f mais
[plano 198](execucao/198-ciclo-normal-das-aventuras-restauradas.md).
Não é certificação de produção nem conclusão de P2/F2-09.

## Evidência de ciclo normal

adventureRestoredConsumers.test.mjs usa o produtor TypeScript real, 17 leitores
atuais, restauração/Storage/auditoria/ativação/mídia/coleta e consumidores normais.
Nenhuma raiz é inserida diretamente no destino. Após coletar a fonte, a cópia
é editada e recapturada; uma segunda restauração conserva as alterações.
Dados históricos de entrada (parte legada e pai ausente) são identificados como
fixtures, sem trocar o caminho real da restauração.

| Família                            | Escrita / leitura normais                                                                      | Evidência e exclusão                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raiz privada / Estúdio             | Studio cria/lê/lista; owner atual é conferido.                                                 | A cópia abre após coleta. Exclusão completa da aventura ainda falta.                                                                                                       |
| Partes / agrupadores               | Scenes cria/ordena; listSceneGroups/getSceneGroup; texto anterior é fonte preservada separada. | Fonte legada visível/sanitizada e conservada no segundo backup. deleteSceneGroups já destaca cenas para Sem parte; contrato/regressão de scenes.                           |
| Cenas / corpo / planejamento       | Scenes e ledger; getScene/listScenes, editor e composição existentes.                          | Edição na cópia, arquivo/restauração, referências e contadores. Corpo exato e original intacto.                                                                            |
| Parte ausente                      | Leitura por identidade conserva parentId; listOrphanScenes percorre heads paginados.           | Prévia privada; recoverOrphanScene confirma CAS/ausência, move para Sem parte e guarda formerParentId. Não cria parte. Recaptura e edição após recuperar comprovadas.      |
| Blocos / audiência                 | AdventureBlocks e ledger; list/get/update/delete.                                              | Reescrita e audiência gm na cópia. Exclusão conserva histórico sem recriar o bloco.                                                                                        |
| Referências de cena                | set/listSceneReferences e índices derivados.                                                   | Vínculo de lore remapeado para a aventura nova e resolução normal após coleta.                                                                                             |
| Arcos / marcos / eventos           | NarrativePlanning/Jobs, leitores e links.                                                      | Leitura de arco/marco/evento e link para cena remapeada; data textual preservada. Exclusão por jobs normais permanece no contrato anterior.                                |
| Lore próprio                       | AdventureLore metadata/corpo/CAS; list/get/save/delete.                                        | Leitura/edição na cópia e contexto de IA com texto alterado; sem converter referência externa em autoria.                                                                  |
| Persona                            | Bindings e biblioteca/lotes ativos; contexto e backup.                                         | Definição restaurada e complemento custom no contexto; permanece após coleta/recaptura.                                                                                    |
| Progresso / checklist / ledger     | WorkProgress e writers de texto/estrutura.                                                     | Contagem pronta, checklist, mudanças de corpo/bloco e recuperação. Preferências/fuso da conta não viram autoria portátil.                                                  |
| Histórico / rascunho               | WorkHistory; list/read/create/restore/delete.                                                  | Paginação de uma versão/chunk, duas manuais e rascunho; before-restore conserva texto anterior. Histórico de bloco removido não ressuscita recurso.                        |
| Imagem / uso / bytes               | Biblioteca, setters tipados, Storage por geração.                                              | Getter do vínculo e lista normal da biblioteca após ativação; bytes recapturados e nova restauração. Detach/exclusão de bloco preserva cópia própria sem vínculo indevido. |
| Universo                           | Universo/Studio, origem nativa e revisão final de ativação.                                    | Origem ausente no destino não copia prosa global, não cria universo e não concede vínculo. Casos de autorização/ABA/revisão continuam nos testes próprios.                 |
| Contextos e operações de IA        | EditorChatContext e provedores/aplicação separados.                                            | Prepare/advance/inspect normais após edição; lore/persona remapeados. Sem provedor ou débito neste ensaio. Chat/operação/chave não entram no arquivo.                      |
| Preparação / recuperação / recibos | Serviços de restauração e sidecars, transporte/journal próprios.                               | Fonte/chave coletadas antes do uso normal; job ativado e recibos preservados. Recibo histórico não concede acesso atual.                                                   |

## Limites e lacunas explícitas

- Falta exclusão completa de aventura, com reserva/fence, limpeza por famílias,
  universo/retomada, contextos, usos de imagens e preservação das cópias próprias.
  Não substituir pelo cleanup da preparação nem por deleteSceneBook.
- Campanhas a partir da cópia e duas mesas independentes no mesmo universo
  pertencem também ao fechamento integrado D; esta matriz não inventa esse ensaio.
- Comércio/publicação/permissões da compra pertencem às fases posteriores.
  Arquivo privado não concede direito comercial nem acesso externo.
- O corpus é sintético e usa doubles de metadata/Storage. Auth/App Check/SDK/
  chooser da jornada nativa são sintéticos; dados/navegador reais não foram usados.
- SDK real local prova exports/headers/limites e recusas sem Auth/App Check.
  Não comprova configuração/credenciais ou Rules de produção.
- Os endpoints novos precisam de implantação coordenada para uso com conta real.
  Nada foi enviado/deployado; o validate integral de fe49e9f é base anterior.
- O próximo validate integral fecha o bloco de exclusão/auditoria de P2.
  Neste incremento foram executados os testes e checks dirigidos da entrega.

Veja a [evidência local](../../entregas/2026-10-28-writer-v2-ciclo-normal-das-aventuras-restauradas.md).

## Preparação da exclusão — plano 199 aberto

Guards privados e Rules agora recusam origem permanentemente reservada,
inclusive raiz reaparecida, nas famílias integradas no
[avanço local](../../entregas/2026-10-28-writer-v2-reserva-e-fonte-da-exclusao-de-aventuras.md).
Inclui autores/importação/restauração, consumidores de autoria e campanha,
mídia pendente, catálogo e retomada. Fonte interna de confirmação usa carimbos
nativos, sem mutar. Não existe início público ou limpeza de projeto ainda.
Esta preparação não fecha a lacuna de exclusão completa nem P2/P3/D/F2-09.

O início interno agora grava reserva/job/recibo/revogação e desfaz o vínculo
do universo atomicamente; resolve tentativas sem resposta e prova identidades
nativas. Inventário limitado encontra filhos com pais ausentes.
Veja a [evidência](../../entregas/2026-10-28-writer-v2-inicio-privado-e-inventario-da-exclusao-de-aventuras.md).
Continua sem endpoint/UI de exclusão ou avanço da limpeza; o conjunto do
plano 199 permanece pendente.
