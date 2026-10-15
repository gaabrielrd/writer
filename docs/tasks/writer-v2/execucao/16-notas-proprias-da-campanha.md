# F2-07 C1 — Notas próprias da campanha

**Estado:** implementado e validado localmente; CI pendente.
Contrato operacional revisado antes do código.
Captura B concluída tecnicamente em f97455d, com validate, CI e regras verdes.
**Origem:** [campanhas e variantes](14-campanhas-e-variantes.md),
[domínio D-02](02-modelo-de-dominio.md) e [permissões](03-permissoes-e-privacidade.md).

## Objetivo e sequência

Permitir registrar anotações autorais particulares de uma mesa e continuar lendo,
editando ou apagando essas notas quando a aventura/universo original fica
indisponível. Não converter conteúdo derivado em nota por editar seu nome.

Separar C em incrementos verificáveis: C1 notas próprias, C2 variantes de ficha de
lore inteira e C3 comparação/adoção explícita de uma nova base. Exclusão integral
continua posterior. C1 estabelece o recurso separado cuja preservação C2/C3 devem
provar. Não antecipar código de variantes ou troca de activeBaseId nesta entrega.

## Descoberta e suposições

- Campanhas já têm descrição e checklist, mas não uma coleção de notas autorais.
- CampaignPage compõe APIs públicas e aceita campanhas independentes/originais.
- O gate de metadados em campaigns.mjs exige dono/schema/procedência suportada e
  não depende da disponibilidade da aventura. Reutilizar essa regra explicitamente.
- Filhos de campanhas já têm SDK direto negado; não abrir leitura/gravação direta.
- Suposição de implementação: nota tem título e texto simples, salvamento manual,
  sem audiência pública, rich text, anexos, IA, ligação automática ou histórico.
  Essa escolha evita introduzir outro editor antes das sessões.
- Notas novas começam vazias. Nenhum botão de base/variante copia campos para elas.
  Trocar universo organizacional ou perder a origem não muda sua autoria/visibilidade.

## Requisitos e persistência

Coleções exclusivamente no servidor:

- campaigns/{campaignId}/notes/{noteId}: nota própria schemaVersion 1, ownerId,
  campaignId, revision, title, content, createdAt, updatedAt e deleted false.
- campaigns/{campaignId}/noteState/current: schemaVersion 1, ownerId, campaignId,
  campaignToken e revision global da lista, monotônica; cada mutação real incrementa uma vez.
- users/{uid}/campaignNoteOperations/{operationId}: fingerprint, alvo/ação,
  revisão confirmada e hash da confirmação; sem cópia de título/texto.

Título obrigatório até 300 caracteres, trim somente no título. Texto até 150.000
unidades UTF-16 e 512 KiB UTF-8, preservado exatamente, inclusive vazio/quebras de
linha/Unicode; texto simples é mostrado escapado. Valores incompatíveis falham sem
truncamento. ID de criação é o próprio operationId (UUID pelo cliente), sem root
visível antes da transação. Revisão inicial 1 e datas monotônicas pelo servidor.

Exclusão explícita remove título/corpo e conserva tombstone mínimo com identidade,
revisão e datas; não reutilizar o ID apagado. Não há Arquivo ou restauração de nota
neste incremento. O tombstone impede replay de criação/edição sobre um ID removido.
Exclusão integral da campanha limpará também tombstones/recibos em sua etapa própria.

Estado de lista ausente equivale a revisão zero somente sem notas existentes;
presença de filhos sem controle é inconsistência explícita, não reiniciar versão.
Essa prova limitada inclui tombstones, sem filtrar deleted false. Não criar estado
ao ler. Controle e nota/recibo mudam na mesma transação. Cada pedido novo válido de
save incrementa revisão da nota e coleção uma vez, mesmo com conteúdo idêntico;
replay não incrementa. Novo delete de nota já apagada falha sem incrementar.

Vincular a identidade lógica da campanha ao campaignToken opaco SHA-256 de
{version:1,uid,campaignId,createTime:{seconds,nanoseconds}} do snapshot Firestore.
CreateTime é imutável; edição de metadados, vínculo ou checklist não troca o token.
Não substituir por updatedAt/createdAt numérico de campos ou por ID reutilizável.
Snapshot sem createTime preciso falha antes de corpo/escrita. Apagar/recriar root
no mesmo ID muda token e impede journal antigo de escrever na campanha nova.
Notas/tombstones/controle/recibos guardam também esse token interno; validá-lo antes
de projetar campos. Filhos deixados por um root apagado não pertencem à encarnação
nova, mesmo com o mesmo UID. Inconsistência bloqueia em vez de reutilizar/adotar filhos.

## API fechada

| Operação           | Entrada                                                                          | Saída                                    |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| listCampaignNotes  | campaignId, campaignToken?, cursor?, limit?                                      | envelope, items de resumo, nextCursor    |
| getCampaignNote    | campaignId, campaignToken, noteId                                                | envelope, note completa ou null          |
| saveCampaignNote   | campaignId, campaignToken, noteId, operationId, expectedRevision, title, content | envelope, note confirmada                |
| deleteCampaignNote | campaignId, campaignToken, noteId, operationId, expectedRevision                 | envelope, noteId, revision, deleted true |

Envelope flat obrigatório em todas as respostas: ownerId, campaignId,
schemaVersion:1, campaignToken e collectionRevision inteiro seguro >=0. Note
completa usa id (não noteId), ownerId, campaignId, schemaVersion:1, revision >=1,
title, content, createdAt e updatedAt. Get retorna note:null quando ausente;
save retorna note não nula. Delete não retorna título/corpo. Resumo contém somente
id, title, revision, createdAt e updatedAt. Nenhum DTO devolve campos internos.
Token de lista é opcional só na primeira abertura; quando informado deve conferir.
GET/mutações sempre exigem o token observado, sem rebase implícito do journal.

Campos fechados em todos os inputs. UID, dono, datas, flags e revisões gravadas
nunca vêm do cliente. Em criação expectedRevision zero e noteId igual operationId;
em edição a revisão é a observada no GET/DTO confirmado, maior que zero. Salvar em
nota apagada não a recria; excluir nota ausente não fabrica tombstone.

Cada leitura/mutação/replay autoriza campanha própria disponível, schema e
procedência suportada independent/original canônica. Não consulta aventura,
universo, ficha ou base para permitir nota própria; campanha removida/deleting ou
transferida falha. Nota também precisa confirmar identidade/dono/schema. Nenhuma
operação grava original, base, lore, vínculo de universo, crédito, checklist ou meta.

CAS compara revisão real. Mesmo operationId/outro payload falha; replay reautoriza
e só confirma se o estado da nota ainda corresponde à confirmação. Edição posterior
produz conflito, sem devolver conteúdo antigo como atual. Exclusão repetida com o
mesmo pedido confirma seu tombstone; outro pedido com revisão velha conflita.
Retornar collectionRevision atual observada, não uma revisão antiga de recibo.
ConfirmationHash cobre somente a nota/tombstone, sem collectionRevision: editar
outra nota não invalida um replay legítimo. Token da campanha faz parte do
fingerprint e é conferido inclusive no replay antes de ler o corpo da nota.

Conflito da nota usa failed-precondition com details.reason revision-conflict;
cursor usa cursor-invalidated; token de campanha incompatível usa campaign-changed.
Não transformar falha transitória/identidade de resposta incompatível em confirmação
definitiva. Inputs inválidos, falta de acesso e conflitos não gravam nada.

## Lista e orçamentos

Resumos sem corpo: id, title, revision, createdAt e updatedAt. Padrão 25, máximo
50, resposta até 4 MiB. Ordem createdAt DESC, `__name__` ASC; editar não muda posição.
Query filtra deleted false; acrescentar índice composto real e correspondente
teste SDK. Desabilitar índice de content. Não declarar índice implantado.

Cursor fechado/versionado vincula UID, campanha, collectionRevision e última
posição (createdAt/id). Mudança da lista invalida cursor antes de devolver corpo
ou compor páginas de revisões diferentes; UI oferece recarregar. Páginas lidas
no mesmo estado deduplicam por identidade. Não calcular total por varredura.
GET de nota removida retorna null, sem conteúdo/título do tombstone.
Cursor também vincula campaignToken. Após save/delete próprio ou GET em revisão
de coleção diferente, invalidar páginas acumuladas; manter DTO próprio no editor e
recarregar somente a lista, sem substituir campos digitados por leitura automática.

## Cliente, recuperação e interface

Nova feature campaign-notes, com modelo/serviço/transporte/adaptador/controlador e
painel públicos. CampaignPage compõe somente CampaignNotesPanel({campaignId})
para ambas procedências suportadas, sem importar seus internos ou alterar o leitor.

Listagem com loading, vazio, erro/retry e sucesso; novo/editar em Dialog com
Input/Textarea públicos, título persistente, salvar manual e cancelar. Excluir
exige confirmação explícita. Não exibir marca de publicação nem usar seletor de
lore. Formulário inicial vazio; editar lê somente a própria nota selecionada.

Preservar UID, campanha, noteId, operationId, método, payload e revisão antes da
rede no adaptador privado. Este recurso contém somente texto autoral próprio:
seu pedido pendente pode ser preservado integralmente, como a gestão A. Essa
permissão não se estende a futuras variantes/corpos derivados. Nenhuma cópia de
base/lore entra automaticamente no journal de notas.

Fila por UID/campanha, uma mutação incerta por campanha. Reserva/escrita/limpeza do
journal usam Web Locks da plataforma no adaptador, com chave UID/campanha, para
check+write atômicos também entre abas. Não manter lock durante HTTP; o journal
preservado bloqueia novos pedidos. Limpeza compara operationId sob o mesmo lock.
Revalidar identidade ao adquirir lock; observar storage para pendências de outra
aba. Sem reserva segura disponível, não enviar mutação nem apagar campos/pedido;
leitura continua disponível. Não usar compare/set localStorage como lock atômico.
Testar corrida entre duas abas e journal preservado com locks reais no Chromium.

Pedido desconhecido bloqueia
novo salvar/excluir até repetir exatamente o mesmo payload. Fechar/reabrir/reload
mantém recuperação visível mesmo quando uma criação já ocorreu ou a exclusão
retirou a nota da lista. Não depender de GET da nota apagada para recuperar delete.
Journal inválido ou falha de persistência bloqueia envio sem apagar silenciosamente.

Identidades de resposta são conferidas: UID/campanha/noteId/schema, ação de delete
e revisão. Resposta tardia de outra conta/alvo não atualiza UI nem limpa o pedido
antigo. Confirmado o próprio pedido, aceitar seu DTO; não obter revisão nova e
reaplicar texto automaticamente. Conflito conserva campos e exige descarte explícito
antes de carregar a nota atual. Cancelamento anterior ao envio não escreve.
Beforeunload protege pendência; não introduzir agregador global de locks.
CampaignToken também é conferido antes de adotar DTO/paginar. Troca de encarnação
da campanha exige reabertura explícita; nunca substituir token de pedido pendente.

Três temas, teclado, foco e 320 px, títulos/textos longos sem overflow. Tokens,
Lucide e componentes shared/ui conforme styleguide. Sem nova dependência.

## Tarefas e arquivos previstos

1. Fechar este contrato antes do código e revisar seus casos de identidade/CAS.
2. Backend em functions/src/campaignNotes*.mjs; exportação limitada do gate próprio
   de campaigns.mjs se útil, index.mjs/package.json, unitários e SDK dedicado.
   Se necessário, ampliar somente createTime imutável no helper studioDb de testes,
   sem usar timestamps de conteúdo como identidade substituta.
3. Frontend em src/features/campaign-notes e integração mínima CampaignPage/teste.
   Servidor e cliente podem trabalhar em paralelo com o contrato fechado.
4. Fixture somente do transporte novo e spec nativo próprio, sem simular autorização
   real. Usar campanhas existentes da mesma store, isolamento UID e reload reais.
5. Testes afetados após ajustes, revisão independente, validate completo no
   fechamento. Depois documentação, evidência, commit/push e CI em paralelo.

Root mantém índices/docs/AGENTS/Git; backend não altera frontend/fixture; frontend
não altera servidor/índices; QA só integra fixture/spec após o fluxo do cliente.

## Critérios de aceite e testes

- Criar/editar/recarregar/excluir nota preserva exatamente Unicode/quebras de linha.
- Cancelar formulários/confirmação não escreve; erro mantém campos/pedido.
- Dois pedidos concorrentes não sobrescrevem; replay não duplica ou restaura nota.
- Perda de resposta em criação/edição/delete e reload recupera o mesmo pedido.
- Nota apagada não reaparece por replay; edição posterior não aceita recibo antigo.
- Duas campanhas/UIDs isolam conteúdo; resposta tardia não altera o alvo atual.
- Duas abas não substituem o journal reservado; corrida usa Web Locks reais no
  Chromium. Sem lock disponível, mutação não sai e campos permanecem.
- Root apagado/recriado no mesmo ID não adota notas/recibos/journal da encarnação anterior.
- Aventura/universo indisponível ou vínculo trocado não bloqueia nota própria;
  campanha indisponível bloqueia. Nenhuma escrita em original/base/lore global.
- SDK direto nega lista/corpo/controle/recibo inclusive para dono; funções reautorizam.
- Lista sem corpos, paginação/ordem/cursor e limites reais, sem truncamento.
- Navegador cobre gestão, recuperação, isolamento e teclado/320 px/três temas.
- Validate, revisão, documentação/entrega/Git e CI conforme definição de concluído.

## Riscos e não escopo

Não reutilizar indiscriminadamente o journal com payload para variantes futuras:
elas precisam autorização antes de recuperar qualquer conteúdo derivado. Não
atrelar notas ao getCampaignBase ou copiar descrições do original como rascunho.
Tombstone não é histórico; exclusão é explícita. Controlar lista sem reiniciar
versão quando faltar o documento de controle. Functions/índices não serão implantados.

Fora: rich text, versões de nota, referências/links automáticos, promoção de cânone,
IA, busca global, anexos, compartilhamento, sessões, variantes, atualização/exclusão
integral de campanha, backup e comércio.

## Evidência intermediária do servidor — 2026-10-15

- Unitários dirigidos: notas 8/8 e regressão de campanhas 7/7; lint/sintaxe verdes.
- SDK real novo: 4/4, zero skips/falhas, 8.777,6044 ms; emulador encerrado.
- SDK confirma CAS/replay, tombstones, negação direta, listagem sem corpos,
  limites/UTF-8, identidade real createTime e notas acessíveis sem a origem.
- Índice correspondente e dispensa de content declarados; não implantados.

## Fechamento local — 2026-10-15

- Frontend dirigido inicial: 40/40; após ajustes de fechamento/resposta tardia,
  somente os sete afetados foram repetidos e passaram. Três negativos falharam
  antes das correções, preservando campos, foco e revisão observada.
- Chromium: 24/24, 68.230,421 ms, sem falhas, skips, flaky ou retries; CRUD,
  teclado/320 px/três temas, duas abas reais, isolamento e recuperação após reload.
  Fixture de controle 5/5. Inspeção dos seis PNGs finais nos três temas.
- Validate final: 1.581 testes frontend/165 arquivos, 77 scripts e 297 Functions;
  cobertura 90,88% statements, 84,58% branches, 90,28% functions, 93,43% lines.
  Arquitetura, documentação, estilo, formato, lint, tipos, sintaxe, build e smoke verdes.
- Primeira tentativa parou apenas na formatação do novo teste SDK, antes de lint/testes;
  arquivo formatado e validate final executado integralmente. Sem repetição do SDK
  por alteração exclusivamente de formato.
- Revisões independentes sem P0/P1/P2 remanescente. Sem dependências novas ou deploy.
- [Evidência da entrega](../../../entregas/2026-10-15-writer-v2-notas-da-campanha.md).
  Git/CI registrados separadamente após publicação; F2-07 completo continua pendente.
