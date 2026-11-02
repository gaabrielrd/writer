# ADR 0036 — Exclusão permanente e retomável de campanhas

**Estado:** implementada e concluída tecnicamente em `0006a66`, com CI/regras verdes.
**Contrato:** [F2-07 C4](../tasks/writer-v2/execucao/20-exclusao-integral-da-campanha.md).

## Contexto

Uma campanha reúne notas próprias, preparação, bases capturadas, variantes em
gerações físicas distintas, candidatas e pins da biblioteca. Há pedidos antigos
com respostas incertas e rascunhos cifrados no dispositivo. Apagar somente a raiz
deixaria conteúdo órfão e permitiria que escritores antigos recriassem recursos.
A autorização da aventura original também pode ter sido revogada antes da exclusão.

## Decisão

Iniciar com confirmação explícita e CAS do token preciso/revisão observados. A
transação reserva globalmente o campaignId, cria job/recibo, marca a raiz como
deleting e retira o vínculo organizacional com contador conferido. A reserva
`campaignDeletionReservations/{campaignId}` é permanente e impede reutilização do
ID por qualquer UID. A exclusão dos recursos particulares não depende da origem.

O contrato público tem seis operações: getCampaignDeletionSource,
startCampaignDeletion, resolveCampaignDeletionStart, getCampaignDeletion,
listCampaignDeletions e advanceCampaignDeletion. O resolver inicial só aceita
intenção de cancelamento: um fence impede início atrasado sem recibo; um início
já confirmado retorna o mesmo job e não é desfeito. Recibos vinculam operação,
ação e checkpoint exatos; replay não repete limpeza nem decrementos.

O servidor executa fases limitadas: recuperação, controles, bases, gerações de
lore, filhos da campanha, retomada e certificação final. Seleciona metadados para
apagar documentos sem ler prosa. Cada etapa trata até 25 documentos; pins são
removidos um por transação, verificando chave derivada, tipo, campanha, base e
contador. Imagem pending sem pin não decrementa. Biblioteca e usos de outras mesas
permanecem. Finalização confere os certificados das fases e a encarnação da raiz;
raiz ausente permite retomar, outra encarnação interrompe a operação.

Sanitização substitui chaves, descriptors, relações, decisões e contexto dos
controles por whitelist mínima. Job terminal não conserva cursores ou prosa.
Recibos antigos sem campaignId consultável permanecem somente quando já contêm
hashes/IDs/resultados mínimos contra replay. O relógio de autorização do UID e
suas preferências pertencem ao usuário, não à campanha excluída.

Leitores e escritores conferem a reserva antes de servir conteúdo ou repetir uma
mutação. APIs roteadas por controles leem primeiro máscara de dono/campanha. Mídia
reautoriza antes e depois do I/O, inclusive derivação. O histórico B continua como
consulta separada de recibo mínimo, sem reconhecer ou recriar a campanha atual.
O SDK direto não lê nem escreve campanhas ou namespaces de exclusão.

No cliente, confirmações congelam o controle inteiro, com reserva/CAS sob Web
Locks e HTTP fora do lock. Uma resposta válida de revogação oculta a apresentação
antes da tentativa de limpar o journal; um controle mais novo continua preservado.
Consultas substituíveis têm proprietário por geração. Consulta, foco, recarga e
controle conhecido não iniciam limpeza automaticamente. Continuação explícita
para ao fechar, pausar, trocar conta ou receber conflito/resposta incerta.

Uma prova permanente própria por UID/campaignId permite oferecer encerramento
explícito de controles antigos, inclusive de outra encarnação, sem afirmar que
cada pedido foi executado. O coordenador congela cada snapshot e usa closers
públicos dos respectivos domínios; C2 compara também nonce/ciphertext e aguarda
oncomplete da transação IndexedDB. Nenhuma chave, decriptação ou transposição de descriptor é
necessária. Null, erro ou lista vazia não autorizam apagar rascunhos.

`campaign-deletions` permanece folha, importando apenas auth/shared. `campaigns`
compõe a capacidade e os closers; o Estúdio usa essa composição pública. O pulso
neutro de `shared/services` transporta somente ator/escopo e invalida apresentação;
não concede autorização, comprova exclusão ou encerra controles. Outros
dispositivos reconsultam o servidor; não há promessa de apagar sua RAM remotamente.

## Consequências

- Exclusão confirmada não possui restauração nem reutilização do ID.
- Metadados opacos contra replay permanecem; prosa e chaves não ficam no job final.
- Novos recursos privados de campanha precisam entrar no protocolo de limpeza
  antes de seus escritores serem habilitados; a lista de filhos v1 é explícita.
- Habilitação exige implantar guardas, escritores e regras em conjunto, drenando
  versões antigas. Manutenção Admin deve respeitar a reserva permanente.
- Os testes usam emulador demo e assets injetados; não comprovam Storage real,
  rollout, índices implantados ou produção. Compartilhamento, sessões e comércio
  continuam nas respectivas entregas.

## Verificação

Testes colocalizados cobrem pedidos incertos, proprietário das consultas, troca
de conta/controle e encerramento local. Cinco famílias SDK exercitam limpeza,
pins, concorrência, origem revogada, mídia tardia e regras privadas. Navegador e
validate global têm seus resultados registrados na
[entrega C4](../entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md);
esta ADR não substitui a evidência de entrega.
