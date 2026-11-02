# Filtros compactos e consistência das configurações de IA

Os filtros de projetos usam altura de 28 px e fonte menor em ponteiros
precisos, com grupos compactos junto ao título quando há espaço. Grupos
quebram linhas em viewports menores; toque conserva alvos de 44 px.
Seleção e parâmetros de consulta foram preservados.

Configurações de IA usam abas segmentadas com Button compartilhado,
destaque semântico e densidade compacta. O cabeçalho perde o padding
duplicado e usa PageHeader; retorno contextual aparece somente quando
há origem informada. O vazio de personas usa EmptyState padrão, removendo
a sobrescrita que o deixava sem padding e sem ícone.
As abas do diálogo de capítulo conservam sua apresentação.

Revisão de código, formatação e diff realizadas. Nenhum teste, validate,
build ou verificação no navegador executado, conforme pedido do usuário.
Implementação local em codex/writer-v2; sem commit, push ou deploy.
Validação funcional e visual pendente.
