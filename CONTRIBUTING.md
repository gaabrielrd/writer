# Contribuindo com o template

Estas regras valem para quem melhora o próprio `web-project-template`. Para usar o template em um projeto, veja o [README](README.md).

## Fluxo de trabalho

1. Crie uma branch a partir da principal: `git checkout -b tipo/descricao-curta` (ex.: `feat/nova-skill`).
2. Faça as alterações em commits pequenos e com mensagem clara.
3. Rode a validação completa antes de abrir o Pull Request:

```bash
npm run validate
```

4. Abra o Pull Request descrevendo o que mudou e por quê.
5. Aguarde a revisão e ajuste conforme os comentários.

## Convenção de commits

Use um prefixo que indique o tipo da mudança:

- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` documentação
- `test:` testes
- `refactor:` melhoria interna sem mudança de comportamento
- `chore:` tarefas de manutenção (configs, dependências)

Exemplos:

```
feat: adiciona skill generate-tests
fix: corrige caminho na sincronização de skills
docs: explica variáveis de ambiente em integrations
```

O hook `commit-msg` verifica essa convenção automaticamente. Veja as regras completas em [docs/development-process.md](docs/development-process.md).

## Documentação e ADRs

Toda mudança de arquitetura ou de regra do template deve atualizar a documentação afetada em `docs/`. Se a mudança for uma decisão relevante, registre um ADR em `docs/decisions/` seguindo o formato do [0001](docs/decisions/0001-initial-architecture.md).

## Política de dependências

Mantenha o conjunto de dependências enxuto. Toda nova dependência precisa ser justificada no Pull Request: por que ela é necessária, o que ela resolve e por que não dá para fazer com o que já existe. Prefira soluções nativas (ex.: `fetch` em vez de uma biblioteca de requisições).

## Definição de concluído

Uma contribuição está pronta quando:

- Roda localmente sem erros
- Os testes passam
- Não há erro de lint, typecheck ou build (`npm run validate` verde)
- O CI está verde no Pull Request
- A documentação e/ou ADR foram atualizados quando necessário
- As alterações estão registradas no Git
