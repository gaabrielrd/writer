# Correções para publicação da master

## Escopo

Correções das falhas observadas nos workflows CI e Firestore Rules do commit
`b9fc03c`, na preparação do envio de `1bc6ba8` e das correções para a master.
Os arquivos de implantação que já estavam alterados no checkout foram preservados.

## Alterações

- A reserva e o aceite de imagens restauradas usam uma cópia de estado por
  tentativa da transação Firestore. Repetir o callback não duplica contadores.
- O teste HTTP de restauração e a fixture nativa de lore usam o transporte por
  setor e o envelope público atual.
- O assistente reserva sua altura real em diálogos e catálogos. Em diálogos
  estreitos recolhe temporariamente, sem perder a pergunta ou impedir expansão
  explícita. A gaveta de navegação suspende a barra e mantém o ciclo de foco.
  A barra de seleção do compêndio respeita essa altura no portal; o editor de
  tema conserva seus controles acima da conversa e abaixo dos diálogos.
- O minimapa usa o contêiner de rolagem real do workspace e mantém a barra
  visível ao navegar até o fim do manuscrito, sem alterar seleção ou prosa.
- Os testes visuais acompanham a Home compacta, o catálogo em Projetos, os
  campos da criação unificada e os controles atuais do assistente. A fixture de
  criação preserva universo, persona e imagem da biblioteca escolhidos.
- Testes de protocolos completos mantêm volumes e asserções com orçamento
  compatível com cobertura. Vitest usa até dois workers. Vitest, ESLint e
  Prettier excluem checkouts temporários em `.firebase`; os formatadores também
  excluem os artefatos gerados pertinentes.

## Evidência dirigida

- Firestore Rules: shards 6/8 e 8/8 aprovados, 68 testes em cada shard, com
  emulador local e autenticação sintética. Incluem reserva concorrente de
  imagens e o fluxo HTTP completo de restauração.
- Restauração de imagens: 16 testes de serviço aprovados e uma nova regressão
  aprovada, separadamente, que força rollback e repetição do callback tanto na
  reserva quanto no aceite do upload.
- Assistente e minimapa: dez testes do assistente e dois do minimapa aprovados
  em execuções dirigidas separadas.
- Chromium: minimapa por teclado aprovado em desktop escuro e celular claro;
  criação de lore, formulários estreitos, navegação, cenas, arquivo, retomada,
  criação com imagem e universo e assistente dentro de diálogo conferidos com
  serviços fictícios e rede externa bloqueada. Os casos corrigidos foram
  repetidos após as falhas, com verificações correspondentes ao fluxo atual.
- A rodada adicional dos logs completos de Hosting conferiu 15 casos de temas,
  preferências, lore nativo, tela cheia, exportação, biblioteca, narrativa e
  cenas. Após as correções, 12 passaram na rodada conjunta, os dois de tema em
  repetição própria e o de biblioteca em repetição própria. Os três cenários
  do compêndio também passaram após corrigir o portal e a rolagem do workspace.

## Achado separado

As auditorias de frontend e Functions terminaram com código zero no limite
`--audit-level=high`. O registro consultado apontou 13 ocorrências moderadas no
frontend e seis nas Functions, principalmente em minimatch/glob e dependentes.
Não bloqueiam esse gate. A atualização dessas dependências precisa de revisão
própria de compatibilidade; não foi aplicado `npm audit fix --force`.

## Gate de entrega

O lint completo passou; documentação e styleguide foram reconferidos após os
ajustes finais, assim como o lint dos arquivos de interface e testes alterados.
A cobertura local iniciada antes do último ajuste foi interrompida: componentes
já transformados não representavam o estado final. Não é registrada como gate
completo aprovado. O pre-push permanece obrigatório, sem desativação de hooks.

Este registro antecede o envio. O gate integral é o workflow CI do SHA publicado;
os resultados remotos devem ser conferidos nesse SHA, junto ao Firestore Rules
e ao workflow de Hosting. Os checks dirigidos acima não equivalem à aprovação
remota. Consulte as [execuções da master](https://github.com/gaabrielrd/writer/actions?query=branch%3Amaster).
Esta tarefa não executa implantação manual de Functions ou Firestore.
