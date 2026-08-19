# Atualizando seu projeto

Projetos derivados registram a versão de origem em
`.template-state.json`. Atualizações compatíveis são distribuídas como migrações
locais, sequenciais e transacionais no próprio repositório.

## Conferir uma atualização

Antes de alterar arquivos, liste as migrações aplicáveis:

```bash
npm run update:template -- --dry-run
```

O comando mostra cada transição de versão e não escreve no projeto.

## Aplicar uma atualização

Depois de revisar o plano:

```bash
npm run update:template
npm run validate
```

Migrações concluídas atualizam `templateVersion`. Repetir o comando não reaplica
etapas já executadas. Se qualquer etapa falhar, todos os arquivos declarados
pela migração são restaurados ao estado anterior.

## Obter novas migrações

O atualizador executa apenas migrações que já existem no checkout. Trazer uma
nova versão do template continua sendo uma operação explícita de Git: consulte o
changelog ou release correspondente, copie ou integre os arquivos do template em
uma branch dedicada e então rode o dry-run.

Não use `--allow-unrelated-histories` como fluxo padrão. Projetos derivados
podem ter mudanças incompatíveis, e conflitos devem ser resolvidos de forma
consciente antes de executar as migrações.

## Projetos criados antes do pacote compartilhado

Para migrar um projeto que ainda mantém tokens e componentes locais:

1. instale `@vitru/styleguide` pelo registro público do npm;
2. importe `@vitru/styleguide/styles.css` uma vez no entrypoint;
3. substitua imports do kit local por `@vitru/styleguide`;
4. remova as cópias locais somente depois de testes e build verdes;
5. mantenha arquivos licenciados da TheMix no consumidor e execute
   `npx vitru-install-themix` se necessário;
6. opcionalmente exponha `@vitru/styleguide/showcase` em `/styleguide`;
7. rode `npm run check:styleguide`, `npm run validate` e o E2E.

Veja a [ADR 0014](decisions/0014-extract-shared-styleguide-package.md).

## Limites

- O comando não baixa versões, não faz merge e não resolve conflitos.
- Uma versão desconhecida falha com mensagem clara, sem alterar arquivos.
- Migrações não podem sobrescrever código do usuário sem declarar o arquivo como
  alvo e documentar a decisão.
- Faça a atualização em uma branch e revise o diff antes do merge.
