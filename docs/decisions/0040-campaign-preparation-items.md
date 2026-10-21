# ADR 0040 — Pistas e missões próprias da campanha

**Estado:** implementada e validada localmente; CI do novo head pendente.
**Contrato:** [F2-08 S3](../tasks/writer-v2/execucao/24-pistas-missoes-e-pendencias.md).

## Contexto

A preparação S1 pertence à sessão e as referências S2 resolvem material derivado
sob autorização. Pistas e missões precisam ter texto próprio reutilizável entre
sessões. Excluir uma sessão deve conservar esses itens; retirar a origem de uma
aventura não pode retirar a autoria da mesa. O operador escolheu propriedade da
campanha e os cinco estados de missão em 2026-10-21.

## Decisão

Criar campaign-preparation como folha de auth/shared. Campaigns compõe painel,
slot e closer pelas APIs públicas. O editor/journal vive por UID/campanha fora de
materialEpoch e de CampaignContent. O slot S1 transmite somente identidade salva
e guard, sem importar S3 ou transportar prosa.

Pistas têm texto, condição e destinatário textual, com estados Pendente/Tratada.
Missões têm descrição, consequências possíveis e os estados Disponível, Em
andamento, Concluída, Falhou e Abandonada. Toda transição/reabertura é explícita e
privada. Pendência deriva do estado; nenhum booleano paralelo. Condições e
consequências não publicam, enviam material ou alteram universo.

O catálogo pertence à campanha, com ordem por tipo e controle global. Vínculos
possuem ordem mista por sessão e não duplicam títulos/prosa. Retomar adiciona um
vínculo sem remover anteriores. Duplicidade ativa é recusada e replay do mesmo
pedido é idempotente. Excluir sessão revoga seus vínculos conservando os itens.
Excluir item apaga corpo e grava tombstone; vínculo neutro continua removível.
Ausência física sem tombstone é inconsistência, não desaparecimento normal.

Dez RPCs e seis ações conferem campanha própria/token/reserva C4. Apenas novas
operações de vínculo exigem sessão salva/revisão atual. Recibos/fences históricos
são reconhecidos antes do gate da sessão, mas depois do gate da campanha. Save e
movimentos usam CAS de item/vínculo e coleção; formulário congela sua revisão de
coleção, que listagens não rebaseiam. Cursores de vínculos prendem tanto a coleção
de itens quanto a de vínculos. Metadados usam páginas 25/50 e seleção explícita;
get confere revisão exata ANTES de ler corpo.

Corpos próprios ficam separados em preparationBodies, com até 150.000 caracteres
por campo e 512 KiB UTF-8 agregados, sem trim/truncamento. O mapa body não é
indexado. Listas, recibos e cancelamento não devolvem prosa. Cancelamento também
não ecoa pedido nem fingerprint. Nenhuma operação S3 lê a aventura/universo ou
copia apoio derivado S2 automaticamente.

Um journal por UID/campanha conserva o pedido próprio congelado antes do RPC.
Web Locks cobrem somente CAS local, nunca HTTP. Intenção cancel é persistida
antes do resolver/fence; limpeza compara integralmente o snapshot, incluindo
prosa. Confirmação histórica não adota texto posterior. GETs antigos perdem sua
identidade ao editar ou confirmar, evitando substituir rascunhos e listas atuais.
Controles permanecem fora do diálogo e são encerrados pelo closer C4 próprio.

Sete namespaces novos ficam fechados ao SDK direto: preparationItems,
preparationBodies, preparationState, sessionPreparationLinks,
sessionPreparationState, campaignPreparationOperations e campaignPreparationFences.
C4 passa a iniciar jobs v4: recovery 8, filhos 16, controls 4. Versões aceitas são
estritamente 1–4. Prefixos/checkpoints antigos 3/4/6 e 7/9/11 permanecem intactos;
v5 continua recusada. Sanitização retira hash/pedido/prosa dos controles. Limpeza
continua paginada em 25 documentos por etapa, preservando outra campanha.

## Consequências

A mesma missão tem estado/texto compartilhado pelas sessões vinculadas após
consulta explícita. Não se promete histórico imutável de execução. Mover catálogo
ocorre somente em Todos; links misturam tipos. Conflitos preservam o rascunho e
exigem consulta explícita. Texto próprio continua independente da autorização S2.

Escritores S3, C4v4, regras e índices devem ser implantados conjuntamente, drenando
instâncias antigas antes da habilitação. Emulador não comprova índices ou rollout
em produção. Jogadores, revelação, condução F3, automação de consequências, IA,
backup e histórico ficam nos incrementos próprios.
