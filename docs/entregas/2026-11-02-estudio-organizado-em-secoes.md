# Estúdio organizado em seções

- Data: 2026-11-02.
- Branch: codex/writer-v2; base 8d1a724.
- Origem: plano aprovado na conversa.
- Estado: implementação local; validação pendente.

## Implementação

A lateral do Estúdio oferece Home, Projetos, Importar e restaurar e Em
andamento. Home reúne até quatro retomadas recentes, Novo projeto e atalhos.
O menu de criação preserva livro, livro com IA, aventura e campanha.

Projetos apresenta linhas compactas, miniaturas, estados, atualização e
menu de ações. Os filtros de tipo e de cada lista ficam na URL. O retorno
dos detalhes preserva esses filtros, inclusive após trocar abas do livro
ou da aventura. A paginação existente continua independente por tipo.

Documentos e backups têm grupos próprios em Importar e restaurar.
Em andamento reúne os oito painéis existentes em três grupos, carregados
na primeira visita e mantidos durante a navegação entre seções do Estúdio.
Diálogos e contratos nativos de confirmação, retomada e exclusão são
reutilizados. A Home não apresenta contagens inventadas de pendências.

Preferências em Configurar recebe o fuso horário; a Home somente lê a
preferência. Grades e linhas têm adaptação para telas menores e usam os
tokens dos temas existentes. Arquitetura, styleguide e orientação de testes
foram atualizados.

## Verificação e limites

Foi feita revisão de código, revisão do diff e formatação dos arquivos alterados.
Os testes de navegação foram atualizados para os subitens e Preferências,
sem execução.
Nenhum teste, validate, build, checagem de tipos ou teste de navegador foi
executado neste incremento, conforme orientação expressa do usuário.
Os cenários existentes que esperam o Estúdio monolítico precisam ser
adaptados antes de uma nova rodada autorizada. Não há validação integral
verde desta entrega; a definição de concluído permanece pendente.

O servidor de desenvolvimento existente é o acesso local para avaliação
manual em http://127.0.0.1:5182/studio. Não houve commit, push ou deploy
deste incremento. Backend, regras, créditos e publicação ficam fora do escopo.
