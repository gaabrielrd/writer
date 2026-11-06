# Modo de colaboração versionado — ligação de E1 à produção de capítulos

Incremento sobre a worktree literária em b9fc03c. Mantém o objetivo integral ativo.
Não encerra E1, E3 ou E4 nem representa a coordenação completa de fases.

## Escolha do autor

O contrato aceita `collaborationPolicy: {version: 1, mode}`. Os modos são guidance,
supervised e continuous, apresentados como Orientação, Execução supervisionada e
Execução contínua com escopo e limites. A escolha salva acompanha a revisão privada do
contrato e aparece na comparação e no histórico. Alterar apenas o rascunho não muda o
modo operacional. Salvar o modo não inicia geração, aplica texto nem debita créditos.

O campo anterior `fields.collaboration` continua preservado como Observações sobre
colaboração. Contratos anteriores sem policy usam supervisão; seu texto livre não é
interpretado como permissão. A normalização mantém os payloads e fingerprints antigos
sem acrescentar campos, preservando replay de operações confirmadas. Política nula,
versão desconhecida, modo inválido ou chaves extras são recusados.

## Comportamento em E4

| Modo           | Operações disponíveis                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientação     | Análises estruturais e de prosa e sugestões sobre texto existente. O autor escreve pelo editor nativo. Não registra redação automática nem aplica proposta de prosa ao manuscrito. |
| Supervisionado | Redação e revisão com decisões explícitas. Recusa nova autorização contínua por job, inclusive a tentativa de ampliar um job supervisionado para contínuo.                         |
| Contínuo       | Permite autorizar a primeira versão por capítulo com limites totais de aplicações/créditos. A política do contrato, sozinha, não constitui essa autorização.                       |

O servidor lê somente a revisão e a policy por projeção de metadados, após autorizar o
livro. Jobs novos capturam a escolha/revisão; as fontes e a autorização são conferidas
novamente antes de aplicar. Alteração de contrato invalida a preparação e as propostas
anteriores. O modo também é conferido na transação final de prosa, depois do histórico,
impedindo gravação/débito se a permissão tiver sido retirada durante a operação.

Uma geração pendente que perder seu contrato atual fica stale e não aplica a resposta.
Replay de recibo confirmado continua consultável mesmo após mudar para orientação;
não reaplica texto nem repete débito. Pedidos incertos conservam a mesma operação na
recuperação. Histórico e versões anteriores não são autorização para rearmar execução.

A interface recebe somente a escolha persistida do contrato, mantém rascunhos separados
e bloqueia os inícios incompatíveis. Na prosa, a consulta da cena retorna o modo atual;
em orientação abre análise estrutural e não oferece redação inicial. O servidor continua
conferindo a escolha se a tela estiver desatualizada. Sessões do contrato são isoladas por
autor/livro para descartar respostas tardias de outra origem.

## Origem das permissões

Inferência de contrato não aceita policy operacional na resposta do provedor. A criação
assistida descarta essa propriedade de contratos gerados, preservando hipóteses como
propostas. O autor escolhe o modo no contrato. A política integra a composição editorial
usada pelos prompts, com declaração explícita de que não autoriza ferramentas ou débitos.
Nenhuma coleção, índice, Rule, dependência ou ação callable nova: continuam 416 ações.

## Evidência e próximos requisitos

- 331 testes de servidor literário e roteamento; 37 de criação assistida.
- 94 testes de frontend em 18 arquivos, incluindo os cinco testes de recuperação de
  armazenamento já existentes; o total anterior de 85 usava somente a pasta tests.
- 12 jornadas Chromium: três temas, desktop/móvel 320 px, orientação, supervisão,
  histórico de modo, decisão por teclado e execução contínua delimitada. Capturas de
  orientação em desktop claro e móvel sépia inspecionadas.
- Build/tipos/smoke, lint dirigido corrigido e sintaxe de 568 módulos aprovados.
  Resultados finais e limites estão no relatório da pasta.

Restam em E4 a coordenação das fases preparação → gate → redação → revisão estrutural →
revisão de prosa → versão revisada, suas passagens supervisionadas/contínuas entre
capítulos/atos e reconciliação/reuso. A orientação já controla a redação/prosa desta etapa;
a auditoria de todas as entradas de E3 precisa incluir o contrato operacional. E1 mantém
seus critérios de aceite e sinalização de impacto; E2 mantém a auditoria final. E5 mantém
o fechamento de impacto e portabilidade editorial .writer como nova cópia privada editável.
O gate global continua aberto, sem redução de cobertura e sem entrega final declarada.
