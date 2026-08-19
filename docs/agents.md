# Trabalhando com agentes

Este template foi feito para ser usado com agentes de código. Aqui está como orientá-los.

## Prompts x arquivos persistentes

- **Prompt**: o que você pede no momento, para uma tarefa específica ("crie um formulário de contato").
- **Arquivos persistentes**: regras que valem sempre, gravadas no repositório:
  - `AGENTS.md` (raiz) — regras gerais para qualquer agente.
  - `CLAUDE.md` (raiz) — instruções específicas para o Claude Code.

O agente lê os arquivos persistentes automaticamente. Use o prompt para a tarefa; deixe as regras fixas nos arquivos.

## Skills disponíveis

- **plan-app** — entrevista pessoas não desenvolvedoras até transformar uma ideia em um PRD aprovado, com escopo, não escopo e decisões de arquitetura explícitas.
- **save-legacy-project** — analisa um projeto legado sem documentação e produz um plano aprovado de reestruturação em features, com documentação completa, sem mudar o comportamento.
- **plan-feature** — planeja uma funcionalidade antes de escrever código.
- **implement-feature** — implementa a funcionalidade seguindo o plano e a arquitetura.
- **document-delivery** — registra em `docs/entregas` a evidência do que foi entregue: funcionalidades, testes e validações.
- **review-changes** — revisa as alterações feitas.
- **generate-tests** — gera testes para o comportamento implementado.
- **update-documentation** — atualiza a documentação após uma mudança.
- **update-readme** — gera ou reescreve o `README.md` no padrão do template.
- **update-agents** — atualiza o `AGENTS.md` da raiz quando as regras do projeto mudam.
- **prepare-pull-request** — organiza commit e descrição do Pull Request.

As skills canônicas ficam em `/skills`; as cópias em `.claude/skills` e `.agents/skills` são geradas por `npm run sync:skills`.

## Como definir o produto

Use `plan-app` quando ainda existe uma ideia, mas não um produto completamente decidido. A skill faz perguntas curtas, explica escolhas sem exigir conhecimento técnico e não começa a implementação. Quando não restar nenhuma decisão necessária em aberto, ela pede a aprovação do resumo, cria `docs/prd.md` e atualiza `docs/architecture.md`.

> Use a skill plan-app para me ajudar a definir um aplicativo para organizar os pedidos da minha pequena confeitaria.

Ao responder, evite tentar escrever uma especificação técnica. Explique o problema e escolha entre as alternativas apresentadas; a skill transforma as respostas em requisitos verificáveis.

## Como resgatar um projeto legado

Use `save-legacy-project` quando o projeto já existe, mas não tem documentação nem organização de pastas. A skill inspeciona o repositório, apresenta um diagnóstico e propõe um plano de reestruturação em incrementos reversíveis. Ela só implementa depois da sua aprovação e não muda o comportamento do sistema.

> Use a skill save-legacy-project para analisar este projeto e propor um plano de reestruturação no padrão da área.

## Como pedir planejamento

> Use a skill plan-feature para planejar uma tela de cadastro de clientes com nome, e-mail e telefone.

## Como pedir revisão

> Use a skill review-changes para revisar o que foi alterado nesta branch.

## Como registrar a entrega

Use `document-delivery` depois que o plano foi implementado com `implement-feature` e `npm run validate` está verde. A skill escreve um arquivo em [docs/entregas](entregas/README.md) com as funcionalidades entregues, os testes que as cobrem e a saída real das validações — a evidência da entrega, para consultar depois sem reconstruir a história a partir do Git.

> A implementação terminou e a validação passou. Use a skill document-delivery para registrar a evidência desta entrega.

Ela não altera código e não substitui `update-documentation`: realinhar `docs/` ao código e registrar ADR continuam sendo daquela skill.

## Como atualizar o README

Use `update-readme` quando o `README.md` deixar de descrever o projeto: logo depois do `npm run setup`, quando ele ainda fala do template, ou quando comandos, estrutura de pastas e variáveis de ambiente mudaram. A skill levanta os fatos do próprio repositório (`package.json`, `docs/prd.md`, `docs/architecture.md`, `.env.example`, workflows) e reescreve na estrutura padrão: objetivo, pré-requisitos, instalação, execução, validação, comandos, estrutura, agentes e limitações.

> Acabei de rodar o setup. Use a skill update-readme para reescrever o README descrevendo este projeto.

Ela cita apenas script que existe e link que resolve — `npm run check:docs` reprova o contrário.

## Como atualizar as regras dos agentes

Use `update-agents` quando uma mudança importante altera **como se trabalha** no projeto: uma fronteira de arquitetura, o comando de validação, uma convenção de commit ou de teste, uma dependência aceita ou proibida, uma pasta nova com regra própria. A skill mexe apenas no `AGENTS.md` da raiz — as regras que todo agente carrega em toda sessão.

> A fronteira entre features mudou e o validate está verde. Use a skill update-agents para atualizar as regras.

Não confunda os dois arquivos: `AGENTS.md` (raiz) guarda as **regras**; este `docs/agents.md` é o **guia** de como acionar as skills, e quem cuida dele é `update-documentation`. Repare também que `npm run check:docs` valida `README.md` e `docs/`, mas não cobre o `AGENTS.md`: os comandos e caminhos citados lá precisam ser conferidos à mão.

## Limites de autonomia

O agente deve:

- Não expandir o escopo além do que foi pedido.
- Não instalar dependências sem justificar a necessidade.
- Não expor segredos nem colocar credenciais no código.
- Não mudar a arquitetura sem explicar o motivo e registrar a decisão em um ADR (`docs/decisions/`).

Na dúvida, o agente deve perguntar antes de agir.
