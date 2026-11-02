# Importação de universos e atualização de lore com diff

- **Data**: 2026-11-02
- **Branch**: `codex/importacao-universo-lore`
- **Base atualizada**: `codex/writer-v2`, `d2d6030`
- **Plano de origem**: [Importação de universos e atualização de lore](../tasks/importacao-universo-lore.md)

## Objetivo

Transformar PDFs e textos em propostas de lore revisáveis, criando um universo
ou adicionando e atualizando fichas de um universo existente com comparação explícita.

## Funcionalidades entregues

- Seleção acumulada de PDF, TXT e Markdown até 10.000.000 bytes, com extração
  por página e manutenção da ordem de leitura do PDF, incluindo colunas.
- Análise em partes, evidência literal, consolidação de elementos e revisão editável.
  A criação do universo e das fichas acontece somente após a confirmação.
- Escolha explícita de ficha existente, com diff de campos e palavras:
  acrescentado, removido e alterado, com textos **Saiu** e **Entrou**.
- Atualizações preservam visibilidade, relações, notas estruturadas e criação.
  Fichas não selecionadas permanecem intactas; novas fichas são privadas.
- Confirmação atômica e recuperável: fichas, universo, versão, autorização de
  campanhas, um crédito e recibo. Retry não duplica débito nem recria universo excluído.
- Pausa, retomada e descarte; documentos temporários privados, expiração e coleta.

Veja limites e recuperação no [contrato da funcionalidade](../universe-lore-import.md).

## Critérios de aceite

- [x] Múltiplos PDFs/textos com limite aplicado ao total da seleção.
- [x] Texto extraído e propostas com origem, revisão e seleção antes de gravar.
- [x] Mesmo fluxo para universo novo e universo existente.
- [x] Atualização explícita com diff do que entrou, saiu e foi ajustado.
- [x] Campos protegidos e fichas não selecionadas preservados.
- [x] Aplicação e crédito atômicos, com replay idempotente.
- [x] Interface verificada em desktop/celular, três temas e 320 px.
- [x] Testes e validação integral executados no fechamento, antes da integração.

## Arquivos alterados

| Grupo                                                                 | Mudança                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/features/universes/components/LoreImportDialog*`                 | Seleção, análise, revisão, diff e confirmação                 |
| `src/features/universes/model/loreImport.ts`                          | Limites, correspondências e diff limitado em memória          |
| `src/features/universes/services/loreImportService.ts`                | Extração, envio privado e retomada                            |
| `UniversePage.tsx`, `UniverseLorePage.tsx`                            | Entradas do fluxo e atualização da tela                       |
| `src/features/document-import/services`                               | Extração completa pública, preservando o importador de livros |
| `functions/src/universeLoreImport.mjs`, `functions/src/index.mjs`     | Sessões, análise, revisão, transação, callables e coleta      |
| `firestore.rules`, `firestore.indexes.json`                           | Coleções privadas e índice de expiração                       |
| Testes de universos, Functions, Rules e `e2e/visual`                  | Contratos, transações e jornada no Chromium                   |
| Fixtures existentes de Estúdio, Aventuras, Campanhas, conta e páginas | Alinhamento à navegação e regiões acessíveis atuais           |
| `AGENTS.md`, arquitetura, lore compartilhado, testes e contrato       | Regras e documentação da funcionalidade                       |

As fixtures preservam os casos existentes. Dois arquivos de protocolo de lore
mantêm seus 81 casos e volumes, com orçamento local de 60 s por caso sob cobertura.
A opção redundante `exact` das consultas `getByRole` foi removida após o typecheck;
nomes em string continuam exatos. Nenhum limite de cobertura foi reduzido.

## Testes

| Teste                                                       | Tipo                 | O que cobre                                                                                  |
| ----------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `loreImport.test.ts`                                        | Unidade, 4 casos     | Total de 10 MB, formatos, correspondências e diff literal/limitado                           |
| `loreImportService.test.ts`                                 | Serviço, 3 casos     | Bytes e texto separados, partes completas, cancelamento e apenas ID na sessão                |
| `LoreImportDialog.test.tsx`                                 | Componente, 4 casos  | Revisão, destino explícito, remoções, criação, retry e descarte                              |
| `functions/test/universeLoreImport.test.mjs`                | Servidor, 7 casos    | Atomicidade, privacidade, replay, campos protegidos, conflitos, limites e expiração          |
| `universes.rules.test.mjs` e `custom-themes.rules.test.mjs` | Emulador, 11 casos   | SDK direto negado e transações reais de criação/replay/atualização, além das regras de temas |
| `universe-lore-import.visual.ts`                            | Chromium, 6 projetos | PDF real e Markdown, novo universo, atualização com remoção no diff e 320 px                 |

O navegador usa o extrator real e serviços/IA fictícios. O teste nativo usa Admin
SDK e Firestore Emulator reais, com gerador de IA injetado. Essas provas não
representam geração paga ou configuração de produção.

## Validações executadas

`npm run validate` terminou com código **0**, usando `VITEST_MAX_WORKERS=2`.
A rodada final foi posterior à correção de tipagem das fixtures.

```text
Test Files  380 passed (380)
     Tests  5145 passed (5145)
Statements   : 89.53% ( 35935/40134 )
Branches     : 85.82% ( 30586/35636 )
Functions    : 90.45% ( 8084/8937 )
Lines        : 92.66% ( 33123/35744 )
ℹ tests 101
ℹ pass 101
ℹ fail 0
ℹ tests 4898
ℹ pass 4898
ℹ fail 0
Functions syntax checked: 489 modules
Smoke test do bundle OK.
```

| Check                                          | Resultado                 |
| ---------------------------------------------- | ------------------------- |
| Skills, arquitetura, documentação e styleguide | Aprovados no validate     |
| Formatação e lint completo                     | Aprovados no validate     |
| Frontend com cobertura, scripts e Functions    | Aprovados no validate     |
| Typecheck, bundle e smoke                      | Aprovados no validate     |
| Chromium, seis projetos                        | `6 passed (50.9s)`        |
| Emulador dirigido de universos/temas           | 11 aprovados, zero falhas |
| `git diff --check`                             | Sem erros                 |

## Capturas verificadas

- [Revisão antes de criar o universo](2026-11-02-importacao-universo-lore/revisao.png).
- [Diff de remoção antes de atualizar a ficha](2026-11-02-importacao-universo-lore/diff.png).
- [Diálogo em 320 px](2026-11-02-importacao-universo-lore/320px.png).

## Fora do escopo

OCR, imagens/mapas, geração de relações, publicação automática, BYOK e restauração
de backups. Nenhum push, acompanhamento de CI remota ou deploy faz parte desta entrega.

## Limitações e pendências conhecidas

A tentativa da suíte global `npm run test:rules` excedeu o limite de cinco minutos
do runner. Ela não foi considerada verde. O recorte relacionado de universos e
temas foi repetido e aprovado com 11 casos, incluindo o novo serviço no SDK real.

PDF precisa conter texto. O contrato limita arquivos/contexto/sugestões e recusa
excedentes explicitamente. A extração do navegador é entrada autoral: o servidor
confere bytes/tamanho e evidências, mas não certifica equivalência PDF/texto.
Edições locais anteriores à confirmação não são rascunho persistido.
O aceite custa um crédito por importação; análise e descarte não debitam.

A liberação exige implantação coordenada de frontend, Functions, Rules e índices.
Não houve implantação nem chamada paga ao provedor real. O build conserva avisos
existentes de imports dinâmicos que também são estáticos.

## Como verificar manualmente

1. Em Lore compartilhado, abra **Importar universo**, selecione PDF e texto até 10 MB.
2. Analise, revise as propostas, edite campos e desmarque uma ficha; nada foi criado ainda.
3. Preencha o nome e confirme; abra o universo e confira somente as fichas escolhidas.
4. Abra **Importar lore**, selecione um documento e escolha **Atualizar** em uma ficha.
5. Edite detalhes/apelidos e confira acréscimos, remoções e alterações antes do aceite.
6. Confirme e verifique a ficha atualizada, os campos protegidos e as demais fichas intactos.
7. Interrompa uma confirmação e retome: a mesma revisão deve concluir sem duplicar débito ou fichas.
