# Opções compactas no dropdown de capítulos

- **Data**: 2026-10-11
- **Branch**: `master`, alterações locais sem commit
- **Plano de origem**: ajuste solicitado e apresentado na conversa

## Objetivo e funcionalidades entregues

Retirar o título do capítulo das opções do dropdown, evitando linhas longas.
O menu mostra “Renomear”, “Mover para cima”, “Mover para baixo” e “Excluir”.
O botão de abertura mantém o título no rótulo acessível para identificar a linha.

## Critérios de aceite

- [x] Nenhuma opção repete o nome do capítulo.
- [x] Renomear, reordenar e excluir continuam operando no capítulo escolhido.
- [x] Conferência visual com título longo nos três temas, em desktop e celular.
- [x] `npm run validate` passou.

## Arquivos alterados

- `src/features/books/components/ChapterList.tsx`: rótulos compactos.
- `src/features/books/tests/ChapterList.test.tsx`: rótulos exatos e ações existentes.
- `docs/styleguide.md`: contrato dos rótulos do menu.

## Testes e validações executadas

| Verificação                                                    | Resultado                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npx vitest run src/features/books/tests/ChapterList.test.tsx` | 8 testes passaram.                                                                     |
| Chromium com serviços fictícios                                | 6 cenários: claro/escuro/sépia em 1440 e 390 px; menu com 180 px, sem transbordamento. |
| `npm run validate`                                             | Verde, saída 0; 520 testes de aplicação, 66 de infraestrutura e 28 de backend.         |
| `git diff --check`                                             | Sem erros de whitespace.                                                               |

Saída real resumida:

```text
Test Files  75 passed (75)
     Tests  520 passed (520)
Statements   : 93.77% ( 3884/4142 )
Branches     : 84.7% ( 2891/3413 )
Functions    : 91.6% ( 982/1072 )
Lines        : 95.87% ( 3554/3707 )
Smoke test do bundle OK.
```

## Fora do escopo e pendências

Não houve mudança na lógica das ações nem no layout da lista. O build mantém
os avisos existentes de tamanho de chunks e importação do exportador DOCX.
Commit e CI remoto não foram executados nesta solicitação.

## Como verificar manualmente

Abra o dropdown `...` de um capítulo com título longo. Confira as quatro ações
sem o título, incluindo os estados desabilitados do primeiro/último capítulo.
