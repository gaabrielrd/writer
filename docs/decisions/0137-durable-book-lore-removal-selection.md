# ADR 0137 — Seleção durável para retirada de lore

- Data: 2026-10-25.
- Estado: implementada internamente; interface/compêndio pendentes.
- Plano: [122 / M38c5x](../tasks/writer-v2/execucao/122-selecao-duravel-para-retirada-de-lore.md).
- Antecedentes: [ADR 0133](0133-recoverable-lore-removal.md),
  [ADR 0135](0135-atomic-lore-removal-batches.md) e
  [ADR 0136](0136-independent-book-lore-source-tokens.md).

## Decisão

Compor a seleção completa por retiradas individuais recuperáveis e suas provas
originais, conservando a semântica de progresso parcial. Não promover recibos
individuais a prova de transação conjunta. Unidade atômica de grupo continua
exigindo ADR 0135; não é necessária para limitar a seleção a 50.

O host deve capturar origens v2 explicitamente e apresentar a seleção antes de
apply. O coordenador aceita somente IDs/tokens originais, sem recaptura,
promoção de v1, nomes, prosa, bytes ou chaves. Token opaco não revela sua
versão: o host não deve adivinhá-la ou renovar fonte antiga após aprovação.

## Persistência

Banco próprio writer.book-lore-removal-selections v1, separado dos bancos
writer.book-lore-journal v3 e writer.book-lore-removals v1. Stores:
selections (manifesto/estado), pages (membros imutáveis até 50) e outcomes
(resultados imutáveis por membro). Manifesto inclui conta/livro/seleção,
ação remove, quantidade e hashes das páginas; cada membro fixa posição,
loreId/sourceToken e writeId derivado de toda a identidade original.

Inicialização grava cabeçalho e todas as páginas na mesma transação local,
antes de qualquer RPC filha. Não existe limite total de seleção; falha de
quota/abort impede expor criação parcial e não autoriza rede. Órfãos não são
adotados. Reusar ID com outro manifesto é conflito, sem sobrescrita.

Web Locks protegem somente transações locais, sem lock durante HTTP.
oncomplete precede confirmação; guardas de conta/host são conferidas nas
fronteiras e eventos. Finalizar membro confirma outcome, cursor e contadores
juntos, com CAS. Mesmo resultado é idempotente; outro token não o substitui.
Contadores e hashes locais não são prova remota.

## Execução, incerteza e cancelamento

Abrir/retomar/listar não envia RPC. advance prepara ou consulta e nunca inicia
retirada; apply inicia somente filho ready sem intenção destrutiva anterior.
Intenção incerta só consulta, mesmo por apply. Somente retry explícito pode
reenviar o wire original, sem recapturar fonte. Dívida local impede próxima
produção; ação seguinte só confirma a mesma gravação.

Falha definida de precondição sem retirada comprovada entra em fence.
Antes de registrar conflito e avançar, cancelar a inspeção original e conferir
se o pedido de retirada foi aceito. Falha de rede ou controle desconhecido não
vira conflito concluído. Se houve aceite, conservar removed/jobToken originais.

Cancel persiste intenção do pai independentemente de produtor retido. Depois
fecha todos os filhos por unidades, inclusive nunca iniciados; confirmar cada
fence e pedido original. Aceite não é desfeito. Handle fresco continua sem
esperar RPC antiga; geração de execução e CAS impedem ACK tardio de produzir
outro membro ou substituir intenção de cancelamento, inclusive dívida local.

Ao perder journal filho, metadata da inspeção nativa original pode reconstruir
a intenção somente para consultar o recibo. Não preparar, reenviar apply ou
adotar outra fonte por essa recuperação. Token esperado do evento permanece
fixado. Essa reconciliação não recompõe automaticamente o journal/coletor
filho perdido; inventários e protocolos servidor de limpeza são preservados.

Ao retomar resultado gravado, apresentar verifying até conferir cada recibo/
fence nativo original. Resultado completo/parcial/cancelado distingue aceites
e conflitos; não é certificado de coleta de bytes. Cleanup continua pelo
protocolo individual/inventário do livro, com controles locais preservados.

## Fronteira

Sessão Auth captura actor SDK e host, força UID e confere livro antes de
retomar. Exports públicos expõem sessão/tipos para futura composição.
Sem transporte/callable novo, alteração de sete métodos de retirada,
journals/cifras anteriores, Rules, índices, deps, env ou backend.

Interface de seleção/retomada, visibilidade nativa e composição final do
compêndio continuam obrigatórias. Não remover ações existentes para ativar
CRUD. Lifecycle na exclusão do livro, consumidores/backup/rollout/validate de
P1 e demais fases/gates da V2 permanecem abertos. Somente commit local.
