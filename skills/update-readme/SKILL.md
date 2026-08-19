---
name: update-readme
description: Gera ou reescreve o README.md do projeto no padrão do template — objetivo, pré-requisitos, instalação, execução, validação, comandos, estrutura e limitações; use após o setup de um projeto novo ou quando o README ficou desatualizado.
---

# Atualizar README

## Finalidade

Manter o `README.md` como a porta de entrada do projeto: profissional,
padronizado e fiel ao que o repositório realmente faz.

## Quando usar

- Depois do `npm run setup`, quando o README ainda descreve o template
  em vez do projeto.
- Quando comandos, estrutura de pastas, pré-requisitos ou variáveis de
  ambiente mudaram.
- Quando o README cresceu sem ordem, ficou incompleto ou perdeu o padrão.

## Quando não usar

- Para realinhar `docs/` ao código ou registrar ADR: use
  `update-documentation`.
- Para registrar a evidência de uma entrega: use `document-delivery`.
- Para descrever uma alteração em revisão: use `prepare-pull-request`.

## Levante os fatos antes de escrever

Não descreva o projeto de memória nem a partir do que o template dizia.
Leia o repositório:

| Fonte                         | O que extrair                                |
| ----------------------------- | -------------------------------------------- |
| `package.json`                | Nome, descrição, `engines`, `packageManager` |
| `package.json` (`scripts`)    | A tabela de comandos                         |
| `.nvmrc`                      | Versão do Node nos pré-requisitos            |
| `docs/prd.md`                 | Objetivo, quando usar e quando não usar      |
| `docs/architecture.md`        | Estrutura resumida de pastas                 |
| `src/`                        | Confirmação da estrutura real                |
| `.env.example`                | Variáveis de ambiente                        |
| `.github/workflows`, `.husky` | Verificação automática                       |
| `docs/agents.md`              | Skills disponíveis                           |

## Estrutura padrão

Siga a ordem de `assets/readme-outline.md`. Omita a seção que não se
aplica ao projeto; não invente seção nova sem necessidade.

1. Título e uma frase dizendo o que é, para quem e com qual stack.
2. Objetivo.
3. Quando usar / Quando NÃO usar.
4. Pré-requisitos.
5. Instalação.
6. Execução.
7. Validação.
8. Verificação automática.
9. Comandos (tabela).
10. Estrutura resumida (árvore comentada).
11. Como usar agentes.
12. Como criar uma feature.
13. Como registrar uma decisão.
14. Variáveis de ambiente (quando existir `.env.example`).
15. Limitações conhecidas.

## Estilo

- Português do Brasil, tom direto, segunda pessoa. Frases curtas.
- Sem emoji, sem badge decorativo, sem superlativo de marketing.
- Cada comando em bloco ` ```bash `, um comando por linha.
- Listas de comandos em tabela, com a coluna "O que faz" no infinitivo.
- Caminho, arquivo e comando sempre em `crase`.
- Link relativo para os arquivos do repositório
  (`[docs/architecture.md](docs/architecture.md)`).
- Explique também o "porquê" quando a regra não for óbvia, como faz o
  restante da documentação.

## Processo

1. Levante os fatos das fontes acima.
2. Compare com o README atual e preserve o que já estiver correto e
   específico do projeto; reescrever não é recomeçar do zero.
3. Remova o que só valia para o template — "Criar um novo projeto a
   partir do template", "Prompts Iniciais" e qualquer menção a
   `web-project-template` — quando o projeto já passou pelo setup.
4. Escreva as seções na ordem padrão.
5. Cite somente script que existe em `package.json` e link que aponta
   para arquivo existente: `npm run check:docs` reprova o contrário.
6. Registre as limitações reais do projeto. Não prometa o que não existe.
7. Rode `npm run format` e `npm run check:docs`.

## Resultado esperado

- `README.md` na estrutura padrão, refletindo o repositório atual.
- Lista das seções adicionadas, reescritas e removidas.
- Resultado de `npm run check:docs`.
- Pontos que ficaram em aberto por falta de informação no repositório.
