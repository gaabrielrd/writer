---
name: save-legacy-project
description: Diagnostica um projeto legado sem documentação nem organização e produz um plano aprovado de reestruturação em features, com documentação completa e validação, sem mudar o comportamento; use ao herdar, organizar ou padronizar um projeto que já existe.
---

# Salvar projeto legado

## Objetivo

Trazer ordem para um projeto desorganizado sem alterar o que ele faz.
A reestruturação é uma sequência de incrementos verificáveis: cada um
mantém o projeto funcionando, e o comportamento observável ao final é
idêntico ao do início.

O resultado é um projeto nos padrões da área: capacidades organizadas em
`src/features`, base neutra em `src/app` e `src/shared`, documentação
completa em `docs/` e um fluxo de desenvolvimento registrado.

## Regras

1. Preservar o comportamento observável. Reestruturação não é reescrita:
   mover, renomear e extrair; não redesenhar regras de negócio.
2. Separar mudança estrutural de mudança de comportamento. Se um bug
   aparecer no caminho, registrar e propor em separado, nunca corrigir
   junto com a movimentação de arquivos.
3. Não implementar nada antes da aprovação explícita do plano.
4. Um incremento por vez, cada um com commit próprio e reversível.
5. Não adicionar dependências. Preferir as APIs da plataforma e as
   dependências já presentes; qualquer exceção precisa de justificativa
   aprovada e ADR.
6. Não expandir o escopo: nada de features novas, redesenho de interface
   ou troca de framework durante o resgate.
7. Nunca versionar segredos. Credenciais encontradas no código viram
   variáveis de ambiente e um alerta explícito ao usuário.
8. Respeitar o histórico: usar `git mv` para mover arquivos e trabalhar
   em uma branch dedicada.
9. Adaptar o padrão ao stack existente. As regras arquiteturais valem
   sempre; os nomes de pasta e comandos se ajustam à linguagem e ao
   ferramental do projeto, sem trocar de tecnologia.

## Fase 1 — Analisar

Antes de propor qualquer mudança, entender o que existe. Não perguntar
ao usuário o que o repositório pode responder.

Levantar:

- **Stack e execução**: linguagem, framework, gerenciador de pacotes,
  versão de runtime, como se instala, roda, testa e empacota o projeto.
- **Pontos de entrada**: arquivo inicial, rotas, telas, comandos ou
  endpoints expostos.
- **Estrutura atual**: árvore de pastas, arquivos na raiz, agrupamento
  por camada técnica, arquivos gigantes e módulos com muitas
  responsabilidades.
- **Capacidades do produto**: o que o sistema faz de fato, inferido das
  telas, rotas, modelos e nomes de arquivo.
- **Fronteiras**: chamadas HTTP, acesso a banco ou `localStorage`,
  leitura de arquivos, variáveis de ambiente, integrações externas.
- **Acoplamentos**: dependências cíclicas, estado global, importações
  cruzadas entre partes que deveriam ser independentes.
- **Rede de segurança**: testes existentes, o que eles cobrem, se passam
  hoje, lint, checagem de tipos, CI.
- **Riscos**: código morto, duplicação, segredos versionados,
  dependências abandonadas ou vulneráveis, comportamento não coberto por
  teste.
- **Documentação**: o que existe, o que está desatualizado, o que falta.

Registrar o estado atual como fato verificado. Onde a leitura do código
não permitir concluir, marcar como dúvida a confirmar com o usuário, em
vez de supor.

Executar os comandos existentes de instalação, teste e build para saber o
ponto de partida real. Se algo já falha antes da reestruturação,
registrar a falha como linha de base — não confundir com regressão
introduzida depois.

Ao final, apresentar um diagnóstico curto: o que o projeto faz, como está
organizado, quais são os cinco maiores problemas e qual é a rede de
segurança disponível.

## Fase 2 — Planejar

Produzir `docs/tasks/reestruturacao.md` usando
[assets/restructuring-plan-template.md](assets/restructuring-plan-template.md)
como estrutura mínima.

O plano precisa conter:

1. **Mapa de capacidades para features**: cada capacidade do produto vira
   uma pasta em `src/features`, com nome no domínio do negócio, não na
   camada técnica.
2. **Destino de cada arquivo atual**: tabela de origem para destino
   (`features/<nome>/components`, `model`, `services`, `tests`,
   `src/app`, `src/shared`, ou remoção justificada). Nenhum arquivo fica
   sem destino.
3. **Interface pública de cada feature**: o que o `index.ts` exporta e
   quais importações cruzadas precisam ser cortadas.
4. **Ordem dos incrementos**: começar pelo que dá rede de segurança e
   pelo que tem menos dependências. Ordem recomendada: rede de segurança
   e comandos de verificação, base (`app` e `shared`), features das mais
   isoladas para as mais acopladas, isolamento das fronteiras, remoção do
   código morto, documentação.
5. **Riscos e reversão**: o que pode quebrar em cada incremento e como
   voltar atrás.
6. **Não escopo**: features novas, mudança de framework, redesenho de
   interface, correções de bug e otimizações — listadas explicitamente
   como fora do resgate, com encaminhamento separado.
7. **Critérios de aceite**: observáveis, incluindo a ausência de mudança
   de comportamento e o conjunto de verificações que passa ao final.

Apresentar ao usuário um resumo com `Diagnóstico`, `Mapa de features`,
`Incrementos`, `Riscos`, `Não escopo` e `Critérios de aceite`. Pedir
aprovação explícita. Se houver correção, revisar o plano; sem aprovação,
não seguir para a implementação.

## Fase 3 — Implementar

Aplicar um incremento por vez, na ordem aprovada.

Antes de mover um arquivo cujo comportamento não esteja coberto, escrever
um teste de caracterização: um teste que registra o comportamento atual
como ele é hoje, servindo de rede de segurança para a movimentação. Sem
esse teste, mover o código é aposta.

Para cada incremento:

1. Confirmar a rede de segurança do que será tocado.
2. Mover os arquivos com `git mv`, preservando o histórico.
3. Ajustar as importações e criar ou atualizar o `index.ts` da feature.
4. Isolar as fronteiras: HTTP e acesso a dados em `services/`,
   persistência local em adaptadores, componentes sem detalhe de
   armazenamento.
5. Executar as verificações do projeto e comparar com a linha de base.
6. Fazer um commit descritivo do incremento.

Não misturar incrementos no mesmo commit. Se um incremento crescer além
do previsto, parar, relatar e replanejar antes de continuar.

Manter o `docs/tasks/reestruturacao.md` atualizado, marcando o que já foi
concluído.

## Fase 4 — Documentar

Escrever a documentação que o projeto não tem, sempre a partir do código
verificado — nunca de suposição.

Criar ou atualizar:

- **`docs/prd.md`**: reconstruído a partir do comportamento existente —
  problema, usuários, jornada principal, capacidades atuais, regras de
  negócio, dados, integrações e critérios de aceite. Marcar claramente o
  que foi inferido do código e precisa de confirmação do usuário. Não
  inventar objetivos de produto.
- **`docs/architecture.md`**: árvore de pastas final, responsabilidade de
  cada parte, regras de dependência, fronteiras de API e armazenamento,
  gerenciamento de estado, empacotamento e trade-offs assumidos.
- **`docs/development-process.md`**: o fluxo desta área — analisar,
  planejar, implementar, documentar, testar, validar — com padrão de
  branch, mensagem de commit e definição de concluído.
- **`docs/testing.md`**: filosofia, tipos de teste, localização dentro da
  feature e comandos.
- **`docs/integrations.md`**: integrações externas, variáveis de
  ambiente, comportamento em falha.
- **`docs/building.md`** e **`docs/updating.md`**: como instalar, rodar,
  empacotar e atualizar o projeto.
- **`docs/decisions/`**: um ADR numerado para cada decisão relevante do
  resgate, incluindo a própria adoção da organização por features e
  qualquer conflito resolvido com o usuário.
- **`docs/tasks/README.md`**: o modelo de tarefa usado pela área.
- **`AGENTS.md`** e **`CLAUDE.md`** na raiz: regras persistentes para
  agentes, coerentes com a arquitetura registrada.
- **`README.md`**: o que é o projeto, como rodar, tabela de comandos e
  links para os documentos.
- **`.env.example`**: toda variável de ambiente usada, sem valores reais.

Verificar que os documentos não se contradizem e que todo comando citado
existe de fato.

## Fase 5 — Testar

Elevar a rede de segurança do mínimo necessário para o padrão da área:

1. Confirmar que os testes de caracterização criados na implementação
   continuam passando.
2. Cobrir a jornada principal de cada feature pelo comportamento
   observável, não por detalhe interno.
3. Colocar os testes dentro da feature, em `tests/`.
4. Cobrir os estados explícitos de interface: carregando, vazio, sucesso
   e erro.
5. Cobrir as fronteiras: falha de rede, dado inválido, ausência de dado e
   permissão negada.
6. Garantir um comando único que roda os testes.

Não perseguir cobertura por número. Cobrir o que quebraria sem alarme.

## Fase 6 — Validar

Fechar o ciclo com verificação automatizada:

1. Garantir que existam comandos para formatação, lint, checagem de
   tipos, testes e build, agrupados em um único comando de validação.
2. Adicionar uma verificação executável da fronteira entre features, para
   que a organização não se degrade com o tempo.
3. Rodar a validação completa até ficar tudo verde.
4. Comparar com a linha de base da Fase 1 e confirmar que nada
   regrediu.
5. Revisar o diff final por inteiro, incremento por incremento.

Se a validação exigir configuração nova, mantê-la mínima e coerente com o
stack existente.

## Encerramento

Relatar ao usuário:

- o que o projeto faz, conforme documentado;
- estrutura antes e depois;
- incrementos aplicados e commits gerados;
- documentos criados ou atualizados;
- resultado da validação comparado à linha de base;
- itens deixados fora do escopo, com encaminhamento proposto;
- pontos do `docs/prd.md` inferidos do código que ainda precisam de
  confirmação;
- próximo passo recomendado: usar `plan-feature` para a próxima demanda,
  agora dentro do padrão.

Não implementar features novas nesta skill.
