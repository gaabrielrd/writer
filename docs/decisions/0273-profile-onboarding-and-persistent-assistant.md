# ADR 0273: Perfil explícito, guia e assistente persistente

Status: implementada em 2026-11-02 e validada localmente em 2026-11-03; piloto e rollout pendentes.

## Contexto

A primeira experiência precisa distinguir autores, criadores de aventuras e
mestres, sem prender a conta a um papel. O assistente anterior remontava por
projeto e ficava no canto da tela. O novo ciclo prioriza escrita e preparação,
sem dependência das fases comerciais.

## Decisão

Persistir interesses e progresso do guia em documento privado fechado, isolado
de saldo e permissões, com CAS por transação e revisão monotônica nas Rules.
Compor onboarding em app e consumir sua API pública nas features existentes.
Adaptar prioridades e atalhos, mantendo todos os tipos e projetos acessíveis.
Usar React, componentes compartilhados, Pointer Events, ResizeObserver e
visualViewport existentes, sem adicionar dependências.

Manter uma única barra flutuante de PageAssistant por conta. Geometria e modo
são locais por usuário/dispositivo; texto fica só em memória. Pedidos conservam
escopo e origem ao navegar. Respostas derivadas exigem prova atual da origem ao
retornar ou focar a janela. A inspeção usa a action interna inspect da callable
pageAssistant, roteada pelo setor generationApi; não é uma Function nova.
Perguntas próprias são separadas e ações antigas nunca são reconstituídas.
Leitura pública não recebe um alvo privado. A concepção permanece inline e
pode assumir o escopo do modal; nesse período a barra global fica suspensa.

## Consequências

A escolha de perfil não é autorização nem critério de publicação. Atualização
remota do perfil exige leitura explícita; conflitos não sobrescrevem escolhas.
Reload não recupera o chat global, que não substitui o histórico nativo do editor.
O guia usa dicas e destaque, sem criar conteúdo demonstrativo automaticamente.
Os testes técnicos não substituem o piloto humano nem autorizam um rollout de produção.
Servidor e Rules devem preceder o cliente em um rollout futuro.

Detalhes e cobertura: [primeiro acesso](../first-use.md).

## Validação autorizada — 2026-11-03

O operador autorizou testes, commit e integração local na master. Os resultados
estão na [evidência](../entregas/2026-11-02-primeira-experiencia-e-assistente-persistente.md);
a validação técnica não substitui piloto humano, merge remoto ou implantação.
