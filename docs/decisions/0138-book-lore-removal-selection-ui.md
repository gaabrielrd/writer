# ADR 0138 — Revisão e interface da retirada de seleção

- Data: 2026-10-25.
- Estado: implementada/exportada; compêndio e visibilidade nativa pendentes.
- Plano: [123 / M38c5y](../tasks/writer-v2/execucao/123-interface-da-retirada-de-selecao.md).
- Antecedentes: [ADR 0136](0136-independent-book-lore-source-tokens.md) e
  [ADR 0137](0137-durable-book-lore-removal-selection.md).

## Revisão autorizada

BookLoreRemovalSelectionDialog recebe livro/alvos id/token ou selectionId.
Congela os alvos da tentativa; atualização das props não troca a seleção
aberta. Actor SDK/livro/selectionId mudam o host; perfil conserva revisão.

Abrir não cria operação nova nem consulta prosa. Retomar somente abre o
manifesto local. Conferir seleção cria o manifesto durável e depois lê as
fontes; não inicia retirada. A revisão usa leitor Auth configurado para emitir
token v2, compara essa emissão ao token original e captura C1 com o token
fixado. Token divergente não é adotado; V1 não é promovido implicitamente.

Extrair name literal de dados completos validados, sem usar stub/DTO
normalizado. Nomes ficam somente em RAM durante a revisão. Conferir origem
de todos os membros pendentes ao terminar e reler o pai contra cancelamento.
Membros já encerrados não são reabertos nem têm nomes reconstruídos.
Captura completa por ficha conserva limites reais do dispositivo e não
introduz teto de autoria; falha preserva a tentativa, sem nome vazio fictício.

## Confirmação e execução

Apresentar nomes conferidos e aviso irreversível/publicação. Confirmação
separada dirige apply por unidades, conservando origens e progresso parcial.
Parar em erro, pedido incerto ou dívida. Verificar usa advance, sem start
destrutivo. Dívida local só grava na ação seguinte, sem próximo produtor.

Reenvio fica disponível somente após consulta que mantém o mesmo pedido
incerto, sem dívida. Exige nova revisão e confirmação; retry aplica apenas
esse pedido. Preparar/verificar a ficha seguinte não autoriza sua retirada.

Cancel invalida o driver visual e abre handle fresco do pai original, sem
esperar produtor/crypto/leitura de nome. Fecha IDs por unidades e conserva
aceites. Falha mantém repetição explícita. ACK/erro tardio não toma a UI nem
envia próximo pedido. Fechar é sempre permitido e conserva recuperação;
não há texto editável ou aviso de draft.

Callback exige resultado terminal com todas as provas conferidas, sem
dívida, e reconcilia IDs/outcomes de todas as páginas com o mesmo manifesto/
conta/livro/seleção. Notificar uma vez por seleção durante a vida do host.
Só IDs retirados são devolvidos; conflitos/cancelados não viram sucesso.
Conclusão da retirada não certifica coleta de recursos.

## Descoberta e interface

BookLoreRemovalSelectionRecoveries lista metadata por conta, filtra livro,
pagina até 50 e preserva estados carregando/vazio/erro/sucesso. Mostra
registros locais com rótulos neutros e ação Abrir; não carrega fonte ou roda
jobs. Lista não comprova disponibilidade nem resultado nativo.

Componentes são exportados e usam o kit/temas existentes, sem CSS global novo.
Erros, aviso e conclusão recebem foco; Voltar e fechamento devolvem foco ao
gatilho. Nomes longos quebram linha, corpo rola e footer permanece acessível.
Tab/Escape e retorno ao botão de retomada foram conferidos no Chromium.

## Fronteira

Não montar no compêndio antes de visibilidade nativa e composição completa.
Não remover ações existentes para habilitar CRUD. Sem mudança de backend,
Rules, transporte, formatos cifrados, deps ou env. Demais lifecycle/
consumidores/backup/rollout/validate de P1, fases 3–5 e gates humanos/comerciais
permanecem abertos. Somente commit local; sem CI/envio remoto/deploy.
