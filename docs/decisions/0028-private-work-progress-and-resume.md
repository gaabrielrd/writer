# ADR 0028 — Progresso privado e retomada autorizada

- **Status:** Aceito e implementado; gates locais verdes, CI do incremento pendente
- **Data:** 2026-10-13

## Contexto

Autores e mestres precisam reconhecer o próximo trabalho e acompanhar a preparação.
O operador escolheu tamanho atual do manuscrito com meta total, checklist privado
por projeto e fuso configurável com padrão do dispositivo. Reescrita, remoção e
restauração devem ajustar o total; marcar uma obra pronta não deve publicá-la.

## Decisão

`features/work-progress` concentra painéis, contratos, serviços e hooks privados.
Estado editorial Rascunho / Em revisão / Pronto pertence a livros e aventuras,
independentemente do status público e do ciclo da campanha. Meta positiva ou nula
acompanha o manuscrito atual, sem quota, ranking ou produção diária. Aventura e
campanha recebem checklist paginado com contagens globais e revisão por tarefa.

O servidor mantém um ledger privado por identidade de fonte e agregado por grupo.
Cada escritor atualiza a contribuição atomicamente com a prosa; um marcador
protegido impede clientes antigos de alterar corpo/contagem diretamente após
ativação. A preparação anterior é explícita, limitada e retomável, sem baixar
todo o manuscrito no navegador, truncar texto ou impor novos limites ao legado.
Uma fonte processada pelo escritor não é somada novamente pelo checkpoint.
Excluir grupo desabilita o agregado uma vez; a limpeza posterior não repete a
subtração. Conversão substitui a contribuição legada pela cena no mesmo commit.

`parse5` é dependência explícita de Functions porque Node não fornece o DOM usado
pelo contador do navegador. O parser e o corpus de paridade preservam entidades,
formatação inline, blocos, texto alternativo e HTML malformado conforme o texto
visível existente. Não reescrever conteúdo nem trocar o sanitizer ou editor.

Escritores legados usam hash da base observada e recibo estável. Resposta incerta
preserva o pedido exato; a edição seguinte confirma esse pedido antes de usar o
resultado próprio como base. O servidor revalida autorização e corpo atual ao
confirmar replay, recusando uma edição posterior de outro dispositivo. Escolher
a versão já salva descarta o rascunho local sem trocar a base por esse rascunho.
Importação mantém pedido e recibo por capítulo e conserva a seleção depois de
iniciada, inclusive antes da primeira confirmação, para permitir retry seguro.

Atividade registra somente projeto/recurso/data do servidor, com CAS global por
usuário e fila local independente do autosave. Títulos são resolvidos no acesso
atual. Continuar reautoriza; recurso removido retorna ao projeto, e perda do
projeto não conserva nome ou navegação privados. Preferência de fuso inicializa
uma única vez por revisão, sem sobrescrita silenciosa por outro dispositivo.

## Consequências

Contagem incompleta precisa mostrar a ação de verificação e seu checkpoint.
Falhas de progresso ou atividade não bloqueiam escrever nem confirmam texto salvo.
Conflitos preservam o preenchimento e oferecem comparação explícita. Publicação
e exportação editorial mantêm a projeção de prosa e não recebem recursos privados.

Funções, regras e índices novos exigem implantação autorizada antes do uso real.
Os gates ficam no [contrato F2-04](../tasks/writer-v2/execucao/10-estados-metas-e-retomada.md).
Pilotos humanos, condições comerciais, sessões e restauração integral conservam
suas entregas próprias.
