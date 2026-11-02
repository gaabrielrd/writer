# ADR 0230 — catálogo, rotas e binding da exclusão de aventuras

- Data: 2026-10-29.
- Estado: integração local implementada; fechamento do plano 199 aberto.
- Base: 2dbfa02. Complementa a [ADR 0229](0229-adventure-deletion-boundary-and-dialog.md).

## Decisão

Compor a feature folha adventure-deletions somente por adventures e sua interface
pública no Estúdio. O catálogo reúne jobs remotos paginados e controles locais
metadata por UID, inclusive pedidos que podem nunca ter chegado ao servidor.
Não depende da existência da raiz nem guarda título ou prosa no journal.

Toda página remota passa pelo contrato fechado da feature: conta, limites,
identidades e cursor sem repetição. Sobreposição compara identidade e piso de
checkpoint, contagem e datas. Falha conserva linhas verificadas. Troca de conta
ou geração invalida respostas atrasadas antes de adotar conteúdo. Notificação
local atualiza a união sem consultar novamente o servidor a cada unidade.

Manter o diálogo fora do cartão e do ramo de conteúdo da aventura. Uma prova
válida de revogação esconde o original e invalida a lista da mesma conta, mas
preserva a sessão que confirma recibos e avança a limpeza. Página com operação
editorial pendente bloqueia nova confirmação, sem apagar seu rascunho. URL antiga
permite consultar o job após a raiz desaparecer. Reabrir só consulta; avançar
continua exigindo ação explícita.

A notificação da página precede pulsos opcionais de apresentação. Esses pulsos
têm orçamento menor que IDs documentais nativos: um ID longo válido não pode
impedir que a prova esconda o original. O pulso de coleção atualiza apenas
aventuras da conta atual; não modifica livros ou campanhas.

Exportar seis callables reais em index, com as opções fechadas da fronteira:
App Check obrigatório, região us-central1, 120 segundos, 512 MiB e até cinco
instâncias. UID vem de auth. Construir o serviço apenas depois dos guards,
usando createRestoredImageStorage(bucket) como porta existente de mídia.
Headers privados variam por Authorization/X-Firebase-AppCheck. Sem novo storage
fallback, dependência ou alteração de Rules.

## Evidência e limites

A evidência dirigida está no
[registro parcial](../entregas/2026-10-29-writer-v2-exclusao-de-aventuras-no-estudio.md).
O SDK real executa os seis exports contra banco de teste com relógios nativos
simulados. No HTTP, identidade sintética é conferida por um Auth Emulator mínimo
de loopback; App Check ausente/malformado é recusado antes do banco. Isso não
comprova credenciais reais nem um atestado válido de produção.

O Chromium usa rotas, providers, componentes, journal e Web Locks reais, com
auth/RPC fictícios. Transporte visual agora separa conta e aventura e compartilha
reserva permanente/remoção com o catálogo do Estúdio. A fixture de cenas recebeu
os exports de órfãos ausentes que impediam carregar as rotas; não houve mudança
adicional de comportamento de produção nesse domínio.

Ciclo rico restaurado, validate integral de 198–199 e política final das perguntas
do chat permanecem pendentes. O motor atual preserva perguntas próprias.
Não conclui 199/P2/P3/D/F2-09/V2; macro 8/35, pilotos e comércio permanecem abertos.
Sem CI, envio remoto ou implantação.
