# Avaliação de Skills

Este documento serve como guia para avaliar se um agente de IA está usando as skills corretamente. Para cada skill, há um prompt de exemplo, critérios de qualidade e sinais de alerta.

Use-o para calibrar expectativas ao testar um novo agente, modelo ou configuração.

---

## plan-app

**Propósito**: Conduzir da ideia inicial até um PRD aprovado, sem implementar código.

**Prompt de exemplo**:

```text
Use a skill plan-app. Quero criar um painel de acompanhamento de hábitos diários que funcione no navegador, salve os dados localmente e permita marcar hábitos como feitos a cada dia.
```

**Bom resultado**:

- Fez perguntas curtas em rodadas (1 a 3 por vez), não um questionário longo
- Rejeitou termos vagos ("simples", "intuitivo") pedindo exemplos ou limites concretos
- Seguiu a sequência de descoberta: problema → usuário → jornada → escopo → dados → estados
- Apresentou resumo final e pediu aprovação explícita antes de gerar arquivos
- Gerou `docs/prd.md` com IDs estáveis (RF-01, CA-01) e sem "TBD" ou "a definir"
- Atualizou `docs/architecture.md` com seção `Decisões do produto` sem contradizer o PRD
- Nenhum código foi implementado

**Sinais de alerta**:

- Aceitou "quero algo simples" sem pedir definição concreta
- Criou código ou componentes junto com o PRD
- Deixou itens marcados como TBD, "a definir" ou "etc."
- Não pediu aprovação explícita antes de gerar os documentos
- Inventou requisitos que o usuário não mencionou

---

## plan-feature

**Propósito**: Transformar uma solicitação em um plano claro antes de escrever código.

**Prompt de exemplo**:

```text
Use a skill plan-feature para planejar a funcionalidade de filtro por categoria na lista de hábitos. Quero revisar o plano antes da implementação.
```

**Bom resultado**:

- Leu `AGENTS.md` e `docs/architecture.md` antes de planejar
- Identificou objetivo, requisitos e critérios de aceite
- Listou suposições e lacunas de informação
- Propôs a solução mínima (sem over-engineering)
- Dividiu o trabalho em tarefas pequenas e sequenciais
- Listou riscos e pontos de atenção
- Nenhum arquivo foi alterado

**Sinais de alerta**:

- Começou a implementar sem apresentar o plano
- Propôs uma solução complexa sem justificar
- Não identificou os módulos/features envolvidos
- Ignorou restrições da arquitetura documentada
- Adicionou dependências externas sem verificar se a stdlib/plataforma resolve

---

## implement-feature

**Propósito**: Executar uma tarefa planejada com alterações mínimas e verificadas.

**Prompt de exemplo**:

```text
O plano para a feature de filtro por categoria foi aprovado. Use a skill implement-feature para executar.
```

**Bom resultado**:

- Declarou os arquivos que seriam alterados antes de começar
- Manteve as alterações estritamente dentro do escopo aprovado
- Lógica pura no model, I/O nos services, UI nos components
- Reutilizou padrões e componentes existentes (`Button`, `shared/`)
- Adicionou ou atualizou testes de comportamento
- Executou `npm run validate` e passou limpo
- Revisou o diff final e listou limitações conhecidas

**Sinais de alerta**:

- Expandiu o escopo além do planejado ("já aproveitei e fiz X também")
- Misturou lógica de negócio no componente ou no service
- Não adicionou testes
- Não executou o `validate`
- Importou módulos internos de outra feature (quebrou encapsulamento)

---

## generate-tests

**Propósito**: Criar ou atualizar testes cobrindo o comportamento observável.

**Prompt de exemplo**:

```text
Use a skill generate-tests para adicionar testes à feature de filtro por categoria.
```

**Bom resultado**:

- Testou o resultado observável, não detalhes internos de implementação
- Cobriu casos de sucesso e de falha
- Testes colocados dentro da pasta `tests/` da feature
- Reutilizou utilitários existentes (`src/test/`)
- Não removeu nem enfraqueceu testes existentes
- Suíte de testes passou por completo

**Sinais de alerta**:

- Testou implementação interna (ex: "verifica se o useState foi chamado")
- Testes frágeis que quebram com refatoração sem mudança de comportamento
- Ignorou cenários de erro ou estados vazios
- Removeu ou alterou testes que estavam passando

---

## review-changes

**Propósito**: Revisar o diff antes de concluir uma tarefa.

**Prompt de exemplo**:

```text
Use a skill review-changes para revisar as alterações da feature de filtro.
```

**Bom resultado**:

- Verificou critérios de aceite, escopo e arquitetura
- Organizou achados em categorias: Bloqueador, Importante, Melhoria, Observação
- Identificou código morto, duplicação ou dependências desnecessárias
- Verificou acessibilidade (aria-*, semântica HTML)
- Confirmou que não há segredos expostos
- Propôs correções mínimas sem alterar arquivos

**Sinais de alerta**:

- Disse "tudo está ótimo" sem analisar o diff
- Não categorizou os achados por prioridade
- Sugeriu mudanças fora do escopo da tarefa
- Ignorou questões de segurança ou acessibilidade

---

## prepare-pull-request

**Propósito**: Gerar uma descrição clara de PR após a revisão.

**Prompt de exemplo**:

```text
Use a skill prepare-pull-request para preparar o PR da feature de filtro.
```

**Bom resultado**:

- Incluiu: Contexto, Objetivo, Alterações, Como Testar, Evidências, Limitações, Riscos
- Checklist completo e marcado (critérios, testes, lint, typecheck, build, docs, segredos, diff)
- Instruções de teste claras e reproduzíveis
- Evidências incluídas (logs de validação)

**Sinais de alerta**:

- Descrição genérica ("implementa feature X")
- Checklist incompleto ou com itens desmarcados sem explicação
- Sem instruções de como testar
- Sem evidências de validação

---

## update-documentation

**Propósito**: Manter a documentação coerente com o código.

**Prompt de exemplo**:

```text
Use a skill update-documentation após a implementação da feature de filtro.
```

**Bom resultado**:

- Verificou e atualizou comandos documentados
- Atualizou `.env.example` se novas variáveis foram adicionadas
- Atualizou `docs/architecture.md` se a estrutura mudou
- Criou ADR em `docs/decisions/` para decisões arquiteturais relevantes
- Listou documentos atualizados com resumo das mudanças

**Sinais de alerta**:

- Não verificou se os comandos documentados ainda funcionam
- Ignorou mudanças em variáveis de ambiente
- Não criou ADR para decisão arquitetural significativa
- Copiou trechos inteiros de código para a documentação
