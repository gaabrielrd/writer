# PRD — [nome do produto]

> Remover esta instrução e todos os textos entre colchetes ao preencher. O documento final não pode conter decisões pendentes.

**Status:** Aprovado
**Última atualização:** [AAAA-MM-DD]

## 1. Visão do produto

### Problema

[Descrever quem enfrenta qual problema, em qual contexto e como lida com ele hoje.]

### Proposta de valor

[Descrever o resultado que o produto entrega e por que ele é útil.]

### Objetivo da primeira versão

[Definir o resultado específico da primeira versão em uma frase verificável.]

## 2. Usuários

### Usuário principal

[Descrever o perfil, o contexto de uso e a necessidade principal.]

### Usuários secundários

[Listar os perfis atendidos ou escrever “Nenhum”.]

### Usuários não atendidos nesta versão

[Listar os perfis explicitamente excluídos.]

## 3. Jornada principal

1. [Gatilho que inicia a jornada.]
2. [Ações do usuário e respostas do produto, em ordem.]
3. [Resultado observável que conclui a jornada.]

## 4. Escopo da primeira versão

| Capacidade | Benefício para o usuário | Limites                            |
| ---------- | ------------------------ | ---------------------------------- |
| [Nome]     | [Resultado]              | [O que a capacidade faz e não faz] |

## 5. Requisitos funcionais

### RF-01 — [nome do requisito]

- **Quem:** [ator]
- **Interface/gatilho:** [ação, clique, navegação ou condição]
- **Entrada:** [dados e formato]
- **Comportamento:** [ação do produto]
- **Saída:** [resultado observável]
- **Exceções:** [falhas e casos-limite, ou “Não se aplica” com motivo]

## 6. Regras de negócio

- **RN-01:** [regra objetiva, incluindo limites e exceções.]

## 7. Dados e arquivos

| Dado/arquivo | Formato   | Origem   | Obrigatório | Armazenamento e prazo | Alteração/exclusão | Sensível             |
| ------------ | --------- | -------- | ----------- | --------------------- | ------------------ | -------------------- |
| [Nome]       | [Formato] | [Origem] | [Sim/Não]   | [Local e retenção]    | [Regra]            | [Sim/Não e proteção] |

## 8. Integrações e dependências

| Integração/dependência | Finalidade | Comportamento em falha |
| ---------------------- | ---------- | ---------------------- |
| [Nome ou “Nenhuma”]    | [Uso]      | [Resultado observável] |

## 9. Interface e estados

| Tela ou componente | Carregando      | Vazio           | Sucesso         | Erro            | Sem permissão   | Navegação por teclado |
| ------------------ | --------------- | --------------- | --------------- | --------------- | --------------- | --------------------- |
| [Nome]             | [Comportamento] | [Comportamento] | [Comportamento] | [Comportamento] | [Comportamento] | [Ordem e atalhos]     |

## 10. Plataformas e distribuição

- **Dispositivos e navegadores:** [decisão]
- **Forma de entrega:** [hospedagem estática, SSR, PWA, etc.]
- **Instalação e atualização:** [decisão observável]
- **Uso sem conexão:** [comportamento ou “Não se aplica” com motivo]

## 11. Restrições e requisitos de qualidade

- **Acessibilidade da interface:** [teclado, foco, textos, feedback e decisão verificável]
- **Idiomas:** [decisão]
- **Desempenho:** [meta e volume, ou ausência explícita de meta específica]
- **Privacidade e acesso:** [decisão]
- **Portabilidade:** [decisão]
- **Responsividade visual:** [comportamento em telas menores/maiores]
- **Outras restrições:** [lista ou “Nenhuma”]

## 12. Critérios de sucesso

| Indicador | Meta    | Como medir | Quando avaliar |
| --------- | ------- | ---------- | -------------- |
| [Nome]    | [Valor] | [Método]   | [Momento]      |

## 13. Critérios de aceite

- **CA-01:** Dado [contexto], quando [ação], então [resultado observável].

## 14. Não escopo

- [Capacidade, usuário, plataforma ou cenário explicitamente excluído da primeira versão.]

## 15. Decisões e motivos

| Decisão | Escolha            | Motivo  | Alternativa descartada             |
| ------- | ------------------ | ------- | ---------------------------------- |
| [Tema]  | [Escolha aprovada] | [Razão] | [Alternativa e motivo do descarte] |

## 16. Decisões em aberto

Nenhuma.
