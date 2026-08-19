# Processo de desenvolvimento

Fluxo recomendado para levar uma ideia até o código, de forma organizada e verificável.

## Fluxo

1. **Descoberta do produto**: se a ideia ainda estiver vaga, use `plan-app`. Responda às perguntas até aprovar um escopo e um não escopo completos em `prd.md`.
2. **Demanda**: escolha uma capacidade aprovada no PRD e descreva o que se quer resolver e para quem.
3. **Especificação**: detalhe o comportamento esperado, entradas e saídas.
4. **Critérios de aceite**: liste, de forma objetiva, o que precisa ser verdade para a demanda estar pronta.
5. **Planejamento**: quebre em passos. Você pode pedir ao agente: "Use a skill plan-feature...".
6. **Branch**: crie uma branch para o trabalho (`git checkout -b feat/descricao`).
7. **Implementação**: escreva o código seguindo a [arquitetura](architecture.md).
8. **Validação local**: rode `npm run validate` até ficar tudo verde. Em mudanças de interface, resolva também os avisos de `npm run check:styleguide`.
9. **Evidência da entrega**: registre em [entregas](entregas/README.md) o que foi entregue, os testes e o resultado das validações. Você pode pedir ao agente: "Use a skill document-delivery...".
10. **Commit**: registre as mudanças com mensagem clara.
11. **Pull Request**: abra o PR descrevendo o que mudou e por quê.
12. **Revisão**: ajuste conforme os comentários antes de integrar.

Atualizações herdadas do template usam `npm run update:template -- --dry-run`
antes da aplicação. Veja [updating.md](updating.md).

## Mensagens de commit

Use um prefixo de tipo:

```
feat: adiciona filtro de busca na lista de clientes
fix: corrige data exibida no formato errado
docs: documenta como configurar variáveis de ambiente
```

Outros prefixos úteis: `test:`, `refactor:`, `chore:`, `perf:`, `build:`, `ci:`, `style:`, `revert:`. Um escopo entre parênteses é opcional (`fix(notes): ...`), e `!` marca mudança incompatível (`feat!: ...`).

A convenção é verificada pelo hook `commit-msg` (`scripts/check-commit-message.mjs`): a primeira linha precisa seguir `tipo: descrição`, ter no máximo 72 caracteres e não terminar com ponto. Commits de merge, revert e `fixup!` são ignorados.

## Verificação automática

| Momento      | O que roda                                            |
| ------------ | ----------------------------------------------------- |
| `pre-commit` | `lint-staged` nos arquivos alterados                  |
| `commit-msg` | Convenção da mensagem                                 |
| `pre-push`   | `typecheck` e `test:unit` (Vitest sem cobertura)      |
| Pull Request | `validate` em Node 22/24, auditoria e E2E no Chromium |

Os hooks são atalhos para pegar o problema cedo; corrija a causa quando um deles
falhar. O CI executa os portões completos e é a fonte da verdade.

## Definição de concluído

Uma tarefa está concluída quando:

- Os critérios de aceite foram atendidos
- Funciona localmente
- Os testes passam
- Não há erro de lint, typecheck ou build (`npm run validate` verde)
- O CI está verde no Pull Request
- A documentação foi atualizada quando necessário
- A entrega está registrada em [entregas](entregas/README.md)
- As alterações estão registradas no Git
