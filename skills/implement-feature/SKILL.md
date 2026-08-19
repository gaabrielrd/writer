---
name: implement-feature
description: Executa um plano já aprovado, um incremento por vez, dentro do escopo e com npm run validate verde; use depois do plano existir, não para planejar nem para revisar.
---

# Implementar funcionalidade

## Finalidade

Implementar uma tarefa já planejada, com alterações mínimas e
verificadas.

## Quando usar

- Após o planejamento (plan-feature), quando o escopo está claro.
- Para executar uma tarefa específica dentro do escopo aprovado.

## Processo

1. Confirme os critérios de aceite da tarefa.
2. Declare os arquivos que serão alterados antes de começar.
3. Limite as alterações ao escopo da tarefa.
4. Não expanda o escopo nem antecipe trabalho futuro.
5. Reutilize os padrões e módulos já existentes.
6. Em interface, siga `docs/styleguide.md`: monte a tela com o kit de
   `@vitru/styleguide`, use os tokens de `@vitru/styleguide/tokens.css` (sem
   cor literal) e ícones de `lucide-react`.
7. Mantenha APIs externas e armazenamento atrás de serviços.
8. Adicione ou atualize os testes de comportamento afetados.
9. Execute `npm run validate`.
10. Revise o diff final.
11. Registre a evidência da entrega com `document-delivery`.

## Resultado esperado

- Lista de arquivos alterados.
- Resumo das mudanças.
- Resultado das validações (`npm run validate`).
- Limitações ou pendências conhecidas.
