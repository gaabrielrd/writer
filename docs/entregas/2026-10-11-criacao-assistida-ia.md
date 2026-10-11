# Criação de livro assistida por IA

- **Data**: 2026-10-11
- **Branch**: `codex/livro-assistido-ia`
- **Plano de origem**: [plano aprovado](../tasks/criacao-assistida-ia.md)

## Objetivo

Transformar uma ideia em um livro em rascunho com título, gênero, sinopse,
capa e compêndio inicial privado, após entrevista e revisão pelo autor.

## Funcionalidades entregues

- **Conversa guiada** — primeira pergunta automática, histórico, respostas,
  sugestões e encerramento antecipado para revisão do briefing.
- **Proposta editável** — metadados e 12–20 fichas com atributos e relações.
  Edição usa o formulário existente com visibilidade privada fixa.
- **Regeneração e exclusão** — preservação de campos editados manualmente;
  exclusão confirmada remove também relações recebidas pela ficha.
- **Capa** — direção visual, arte 2:3, seleção da biblioteca e opção sem capa.
  Mudanças de contexto impedem aceitar uma capa gerada para outro contexto;
  IDs de imagens já existentes não podem ser sobrescritos pela geração.
- **Criação** — livro, fichas, referência da imagem, recibo e débito na mesma
  transação. Pacote textual: 2 créditos; capa gerada: mais 5.
- **Retomada** — última sessão privada por sete dias, propostas por uma hora,
  recuperação da mesma solicitação após resposta incerta e link do livro criado.
- **Interface** — temas claro/escuro/sépia, desktop/celular, foco nas etapas,
  campos bloqueados durante operações e largura de 320 px sem transbordamento.

## Critérios de aceite

- [x] Ideia, conversa, briefing, proposta, capa e confirmação estão conectados.
- [x] A entrevista envia o histórico ao modelo e permite delegar decisões.
- [x] Fichas, relações e metadados são revisáveis antes de criar.
- [x] O Compêndio recebe fichas locais privadas no livro criado.
- [x] Alterações manuais são preservadas ao regenerar fichas.
- [x] Propriedade, saldo, expiração, versões e relações são validados no servidor.
- [x] Retentativas não duplicam livro, fichas, referências ou cobrança.
- [x] Criação manual continua acessível e o editor permanece disponível.
- [x] Testes, cobertura, lint, typecheck, build e smoke locais passaram.

## Arquivos alterados

| Área           | Arquivos e mudança                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Livros         | `AssistedBookPage.tsx`, CSS, `BookList.tsx`, `BookNavigation.tsx`, exportação e testes: entrada, fluxo e navegação                |
| IA             | Modelo `assistedBook.ts`, cliente `assistedBookService.ts`, exportações e teste: contrato da callable                             |
| Lore           | `LoreEntityForm.tsx`: edição da proposta com visibilidade privada fixa                                                            |
| Servidor       | `functions/src/assistedBook.mjs`, `index.mjs`, teste, parâmetros e check: sessões, geração e transação                            |
| Segurança      | `firestore.rules`, índice e teste de regras: acesso exclusivo do servidor                                                         |
| Rotas e testes | Rota privada por login, fixtures, suíte visual e configuração em porta 4179; configurações TypeScript incluem os contratos usados |
| Documentação   | README, AGENTS, arquitetura, styleguide, testes, criação de livros, plano e guia da criação assistida                             |

## Testes

| Teste                                          | Tipo         | O que cobre                                                                                                                       |
| ---------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `AssistedBookPage.test.tsx`                    | Componente   | Entrevista, briefing, revisão, lore privado, capa, retomada, falhas e saldo                                                       |
| `assistedBookService.test.ts`                  | Serviço      | Callable, confirmação explícita e classificação de erros                                                                          |
| `BookList.test.tsx`, `BookNavigation.test.tsx` | Componente   | Entrada em biblioteca vazia/populada e criação sem buscar título de livro inexistente                                             |
| `functions/test/assistedBook.test.mjs`         | Backend      | 17 cenários de autorização, limites, expiração, relações, campos manuais, cobrança, retentativas e proteção de imagens existentes |
| `book-generation.rules.test.mjs`               | Regras reais | Sessões, operações, limites e recibos inacessíveis diretamente pelo navegador                                                     |
| `assisted-book.visual.ts`                      | Chromium     | Fluxo completo e retomada em seis combinações de tema/dispositivo, incluindo 320 px e medição 2:3                                 |

Saída real da suíte completa:

```text
Test Files  83 passed (83)
     Tests  591 passed (591)
All files: statements 93.37%, branches 85.76%, functions 91.28%, lines 95.46%
Setup: tests 66, pass 66, fail 0
Backend: tests 63, pass 63, fail 0
Regras: tests 38, pass 38, fail 0
Visual: 12 passed (43.7s)
```

## Validações executadas

| Comando                                                      | Resultado                            |
| ------------------------------------------------------------ | ------------------------------------ |
| `npm ci --prefix functions --ignore-scripts`                 | Dependências do lockfile instaladas  |
| `npm run validate`                                           | Verde, exit code 0                   |
| `npm run test:rules`                                         | 38 testes aprovados em emulador demo |
| `npx playwright test --config playwright.assisted.config.ts` | 12 cenários aprovados com fixtures   |
| `git diff --check`                                           | Sem erros de whitespace              |

Saída real do gate:

```text
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

A worktree nova precisou de sincronização de skills e normalização de CRLF
para LF para rodar o gate. A normalização não acrescentou mudanças de conteúdo
fora do escopo ao diff. Os hooks locais foram instalados.
Logs e capturas ficam no diretório ignorado `visual-test-results` da worktree.

## Fora do escopo

Geração de capítulos, BYOK, universos compartilhados, publicação automática,
mapas, imagens individuais de fichas e diagramação tipográfica de capa.

## Limitações e pendências conhecidas

- Não houve deploy, push, PR ou teste com IA real. CI de PR não foi executado.
- Liberação exige frontend, `assistedBook`, `cleanupAssistedSessions`, regras,
  índice e parâmetros implantados juntos, seguidos de teste autenticado no destino.
- A chave e os modelos existentes são reutilizados; as cotas reais dependem do ambiente.
- Alterações da revisão devem ser salvas antes de sair. Apenas a última sessão
  aparece para retomada; sessões substituídas expiram sem criar livros.
- O build mantém avisos existentes de chunks grandes e importação dinâmica
  ineficaz do exportador DOCX; o build e smoke passaram.

## Como verificar manualmente

1. Na biblioteca, abra **Criar com IA** e descreva uma ideia.
2. Responda à entrevista, peça uma sugestão e revise o briefing.
3. Gere a proposta, edite uma ficha e confirme sua visibilidade privada.
4. Salve a revisão, gere ou selecione uma capa e confira o total de créditos.
5. Confirme a criação e abra o Compêndio no livro em rascunho.
6. Em ambiente de teste, simule resposta incerta e repita a confirmação;
   verifique um único livro e débito. Recarregue durante o planejamento para retomar.

Consulte [o guia](../assisted-book-creation.md) para limites e ativação.

## Integração em master

Em 2026-10-11, por solicitação do autor, `master` foi avançada de `1267b35`
até `237b63d`, incorporando os dez commits que já estavam no checkout ativo
`codex/editor-compendio`. Em seguida, a criação assistida do commit `79d6960`
foi integrada em uma worktree separada, `entrega-livro-ia`.

Os conflitos em `firestore.rules` e `src/app/routes/index.tsx` foram resolvidos
preservando tanto personas quanto criação assistida. O checkout ativo permaneceu
limpo no commit `237b63d`, e a worktree de suporte a atos não foi alterada.

Validações do estado combinado:

| Verificação                                                  | Resultado                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `npm run validate`                                           | Verde, exit code 0; lint, TypeScript, build e smoke aprovados      |
| Frontend                                                     | 90 arquivos, 618 testes aprovados                                  |
| Cobertura                                                    | Statements 93.28%, branches 85.93%, functions 91.31%, lines 95.37% |
| Setup                                                        | 68 testes aprovados                                                |
| Backend                                                      | 63 testes aprovados                                                |
| `npm run test:rules`                                         | 41 testes aprovados no emulador                                    |
| `npx playwright test --config playwright.assisted.config.ts` | 12 cenários aprovados, 55.1s                                       |
| `git diff --cached --check`                                  | Sem erros de whitespace                                            |

A atualização de `master` e a integração são locais. Não houve push, deploy
ou execução do CI remoto nesta integração.
