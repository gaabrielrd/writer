# Incremento 15 — Unidade de publicação do contrato

## Comportamento

O autor pode escolher capítulo, ato ou livro inteiro no contrato editorial opcional,
na criação manual/assistida e na edição posterior. Ausência preserva o formato legado.
A IA não escolhe essa política operacional; suas propostas continuam editáveis antes
consentimento do autor. O campo é versionado e aparece no histórico/comparação.

A unidade limita o escopo de novas edições. Capítulo e ato mantêm o protocolo existente
de edição cumulativa em ordem de leitura. Preparar uma edição com unidade diferente
é recusado no servidor, sem escrever nem debitar. A confirmação final reconfere a
política; recibos históricos continuam consultáveis sem republicar.

Salvar ou criar um contrato com unidade ativa atomicamente a barreira nativa
hasLiteraryPublications. Assim o fluxo legado não permite contornar a política antes
do primeiro manifesto. Remover a escolha não retira a barreira permanente. Salvar o
mesmo conteúdo repara uma barreira ausente sem criar versão editorial fictícia.
Não há nova coleção, callable, dependência, publicação automática ou mudança de status.

A interface mostra a revisão salva e pede uma escolha explícita quando o formulário
não corresponde ao contrato. Não troca silenciosamente escopo nem rascunho. Sem leitura
do contrato, bloqueia nova preparação e preserva inspeção/recuperação históricas.

## Limite do incremento

Ainda não implementa a condição de publicação anterior para avançar à unidade seguinte.
Não existe opção exposta que prometa esse gate. São pendentes a prova nativa paginada
da predecessora/edição e a admissão na passagem de execução. Este incremento não fecha
E1/E4 nem altera o objetivo integral ou os critérios de E5.

## Verificação local — 2026-11-03

Base principal incorporada: 16d8af59f1e2739f1cf9a5b9e399212ea65438cd.
Alterações deste incremento continuam locais e sem commit.

- Servidor: 67/67 testes em quatro arquivos, sem falhas.
- Interface: 14/14 testes em três arquivos; após corrigir três usos de uma opção
  incompatível com os tipos de Testing Library, 6/6 dos dois arquivos afetados passaram.
  A reconfirmação não é uma suíte adicional a somar aos 14.
- Typecheck: aprovado após a correção. A primeira execução encontrou os três erros
  dos testes, preservados no relato; não eram erros do contrato de produção.
- ESLint dirigido aos arquivos deste incremento: aprovado.
- Prettier aplicado somente nos arquivos deste incremento.

Logs em %TEMP%: writer-literary-policy-backend.log,
writer-literary-policy-frontend.log, writer-literary-policy-types-fix.log,
writer-literary-policy-typecheck.log e writer-literary-policy-lint.log.

Não foram repetidos cobertura global, build, navegador, Functions completas ou Rules
após estas alterações. O resultado completo anterior de 5397 testes pertence ao snapshot
anterior deste trabalho, embora tenha a mesma base Git; não comprova o incremento 15.
A cobertura global continua pendente, com última medição de funções em 86,32% para 90%.
Não há aprovação integral de validate, commit literário, push, merge de volta ou deploy.
