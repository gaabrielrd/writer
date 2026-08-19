# 0001 - Arquitetura inicial

- **Status**: Aceito
- **Data**: 2026-07-23

## Contexto

Precisamos de um template de front-end que pessoas não desenvolvedoras possam usar com agentes de código para criar aplicações web simples (ferramentas internas, dashboards leves, formulários, protótipos). O template deve ser fácil de entender, rápido de rodar e ter regras claras para que os agentes produzam código consistente.

## Decisão

- **Stack**: React + TypeScript + Vite, com npm e TypeScript em modo estrito.
- **Organização por features**: cada capacidade do produto em sua pasta, com base neutra (`app` e `shared`).
- **Sem backend inicial**: foco em front-end; dados vêm de APIs externas ou do navegador.
- **Validação local única**: `npm run validate` roda check de skills, formatação, lint, typecheck, testes e build.
- **Qualidade embutida**: ESLint, Prettier, Vitest e React Testing Library.

## Alternativas consideradas

- **Next.js**: poderoso, mas traz conceitos de backend e roteamento server-side que aumentam a complexidade para o público-alvo.
- **Create React App (CRA)**: descontinuado e mais lento que o Vite.
- **Organização por camadas técnicas** (todos os componentes juntos, todos os serviços juntos): dificulta enxergar cada funcionalidade como um todo e favorece acoplamento.

## Consequências

Positivas:

- Projeto rápido de iniciar e de rodar.
- Estrutura previsível, fácil de explicar a agentes e iniciantes.
- Cada feature é autocontida, o que reduz acoplamento.
- Uma única porta de validação (`npm run validate`) simplifica o "está pronto?".

Limitações:

- Sem backend, autenticação real ou armazenamento seguro de segredos.
- Não indicado para sistemas críticos, financeiros ou de grande escala.
- Escolhas mais avançadas (estado global, biblioteca de requisições) exigirão novos ADRs quando a necessidade surgir.
