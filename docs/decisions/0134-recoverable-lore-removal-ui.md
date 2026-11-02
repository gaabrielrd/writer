# ADR 0134 — Interface da retirada recuperável de lore

- Estado: aceita e implementada localmente; composição no compêndio pendente.
- Data: 2026-10-24.
- Plano: [119 / M38c5u](../tasks/writer-v2/execucao/119-interface-da-retirada-recuperavel-de-lore.md).

## Decisão

BookLoreRemovalDialog/RemovalRecoveries são exportados por lore e usam a
sessão/executor da ADR 0133. Novo alvo exige token da captura C1; nome serve
somente à apresentação e não entra no journal. Metadata é conferida pela mesma
origem antes de preparar/revisar, sem buscar token substituto.

Preparar para em ready. Revisar e confirmar são explícitos; só a confirmação
destrutiva chama apply. Start incerto oferece verificar primeiro. Reenvio só
aparece após GET sem confirmação e nova revisão da origem original.
Salvar dívida não consulta como se já tivesse verificado nem produz outra
unidade na mesma ação.

## Actor, concorrência e prova própria

Retomada confere conta/livro/ficha/writeId antes de operar. Abrir não produz.
Callback único depende de removed/verified e recuperação local confirmada.
Conclusão ou limpeza registradas somente no dispositivo são apresentadas
como registros a conferir. Durante apply incerto, a UI não afirma presença
da ficha nem sucesso.

Cancel funciona com RPC pendente. Invalida o driver antigo e compõe handle
fresco para conferir fence/evento original sem esperar a resposta antiga.
Se cancelamento perdeu resposta, o handle fresco permite verificar; dívida
local de cancel oferece repetir cancelamento, preservando o controle antigo
quando a intenção ainda não foi gravada. Retirada aceita permanece.
Resposta velha não atualiza UI nem inicia unidade seguinte.

Fechar não pede aprovação de saída: não há prosa em edição e pedidos são
duráveis antes da rede. Actor SDK diferente remonta/fenceia; perfil preserva
estado. Avisos/erros recebem foco e voltar/fechar restauram o acionador.

## Lista e integração

Descoberta pagina metadata até 50 por conta, filtra livro/cancelamentos
encerrados e cobre loading/erro/retry/vazio/sucesso. Não abre prosa nem produz.
Conclusão local é registrada, sem alegar nova prova remota. Nomes literais
longos quebram linha no modal/lista; não truncar o dado.

Compêndio ainda tem criação/edição/visibilidade/exclusão em lote pelo caminho
legado. Antes da ativação conjunta, congelar origem e revisar essas ações
pelos escritores nativos. Não aprovar uma seleção antiga e capturar outra
origem atual só depois para aplicar. Não remover o recurso de lote para
viabilizar a integração.

67 Vitest distintos positivos em rodadas (24 novos), quatro jornadas Chromium,
temas/mobile/foco e build/tipos/smoke/lint positivos. Browser usa UI/serviços/
executor reais com SDK/Auth/banco em fixtures; sem prova de produção,
leitor de tela, zoom físico ou segundo dispositivo.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates abertos.
Somente commit local; sem CI/remoto/deploy.
