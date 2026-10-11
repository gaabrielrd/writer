# Correção dos gates de regras e testes visuais

- **Data**: 2026-10-11
- **Branch**: `master`
- **Plano de origem**: plano apresentado na conversa para investigar e corrigir o CI.

## Objetivo

Corrigir as falhas dos workflows disparados pelo commit `0c03a08`, mantendo
os testes e os gates existentes.

## Funcionalidades entregues

- Os jobs de regras e integração do Hosting instalam as dependências fixadas
  de `functions` antes de executar os testes com o Admin SDK no emulador.
- O teste de dropdown identifica a mensagem da ação dentro do modal, mesmo
  quando o slider também expõe um elemento com papel `status`.
- O teste de seleção parcial arrasta dentro dos caracteres inicial e final,
  preservando a exigência de selecionar exatamente `trecho` e as verificações
  de rolagem, foco e largura de 320 px.

## Critérios de aceite

- [x] Identificar a causa nos logs dos runs remotos.
- [x] Instalar o backend no mesmo job antes de testar regras.
- [x] Proteger a ordem da instalação com um teste de regressão.
- [x] Manter as asserções observáveis dos cenários visuais.
- [x] Executar a validação completa e os testes reais do emulador.

## Arquivos alterados

| Arquivo                                   | Mudança                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `.github/workflows/firestore-rules.yml`   | Instala dependências do backend.                   |
| `.github/workflows/deploy-hosting.yml`    | Instala o backend no job de integração.            |
| `scripts/run-firestore-rules.test.mjs`    | Verifica instalação anterior ao teste em cada job. |
| `e2e/visual/dropdown.visual.ts`           | Desambigua a mensagem da ação.                     |
| `e2e/visual/editor-adjustments.visual.ts` | Usa limites dos caracteres para arrastar.          |
| `docs/testing.md`                         | Documenta os pré-requisitos dos testes de regras.  |

## Testes

O contrato novo falhou antes da correção com
`firestore-rules: install functions dependencies before testing rules`.
Depois do ajuste, os oito testes do runner passaram.

`npm run test:rules` executou o emulador real:

```text
tests 46
suites 3
pass 46
fail 0
```

## Validações executadas

| Comando                                                                                                                    | Resultado                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm ci --prefix functions`                                                                                                | 249 pacotes; zero vulnerabilidades.                       |
| `node --test scripts/run-firestore-rules.test.mjs`                                                                         | 8 testes passaram.                                        |
| `npm run test:rules`                                                                                                       | 46 testes passaram.                                       |
| `npm run validate`                                                                                                         | Verde, incluindo cobertura, ferramentas, backend e build. |
| `npx playwright test -c playwright.visual.config.ts e2e/visual/dropdown.visual.ts e2e/visual/editor-adjustments.visual.ts` | 42 testes passaram nos seis projetos.                     |

```text
Test Files  96 passed (96)
Tests       672 passed (672)
Ferramentas: tests 69; pass 69; fail 0
Backend: tests 63; pass 63; fail 0
Smoke test do bundle OK.
42 passed (2.1m)
```

## Evidência da investigação

- [Firestore Rules: run com falha](https://github.com/gaabrielrd/writer/actions/runs/38164788521):
  `Cannot find module 'firebase-admin/app'` ao carregar o teste de análise de lore.
- [Hosting: run com falha](https://github.com/gaabrielrd/writer/actions/runs/38164788563):
  mesmo erro no job `integration`.
- [CI: run com falha](https://github.com/gaabrielrd/writer/actions/runs/38164788557):
  312 testes visuais passaram e 12 falharam. As falhas correspondem aos mesmos
  dois cenários nos seis projetos: seletor `status` ambíguo e seleção `Um `
  quando o esperado era `trecho`.

## Fora do escopo

Mudanças no comportamento da aplicação, dependências, regras de segurança e
configuração de autorização do deploy.

## Limitações e pendências conhecidas

A confirmação da correção de seleção no Linux depende da nova execução do CI.
O build mantém os avisos existentes sobre tamanho de chunks e importação DOCX.

## Como verificar manualmente

1. Instale as dependências da raiz e de `functions`.
2. Com Java disponível, execute `npm run test:rules`.
3. Execute a suíte visual de dropdown e ajustes do editor nos seis projetos.
4. Verifique o resultado dos workflows no commit publicado na `master`.

## Complemento: estabilização da rolagem e duração do gate

O [run da primeira correção](https://github.com/gaabrielrd/writer/actions/runs/38166285574)
confirmou regras (46 testes), auditoria, Node 22/24 e E2E de produção. A suíte
visual atingiu o limite de 15 minutos durante o cenário 264 de 324.
A [integração do Hosting](https://github.com/gaabrielrd/writer/actions/runs/38166285474)
terminou em 17,3 minutos com 317 testes aprovados, um aprovado na retentativa
e seis falhas de seleção por mouse. O dropdown passou nos seis projetos.

O trace mostrou coordenadas do arrasto em `y=259,5`, enquanto o texto ficou
abaixo dessa posição após o editor ajustar a rolagem. Medir apenas os caracteres
não corrigiu esse movimento. A preparação agora posiciona o cursor no início
com `Control+Home` e aguarda o texto visível pelo Playwright antes da medição.
A asserção continua exigindo exatamente `trecho` com arrasto real por mouse.

O limite do job E2E em `.github/workflows/ci.yml` passou para 25 minutos para
comportar a suíte completa e os artefatos. Os 324 cenários, a cobertura,
retentativas e timeout individual de 45 segundos permanecem iguais.
`docs/testing.md` documenta a preparação e o limite do gate.

Validações após o complemento:

```text
npx playwright test -c playwright.visual.config.ts e2e/visual/editor-adjustments.visual.ts --grep 'seleção parcial'
6 passed (27.3s)

npm run validate
Test Files  96 passed (96)
Tests       672 passed (672)
Ferramentas: tests 69; pass 69; fail 0
Backend: tests 63; pass 63; fail 0
Smoke test do bundle OK.
```

A confirmação da preparação final no Linux será realizada no próximo run.
