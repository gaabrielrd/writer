# Correção de evidências na análise do compêndio

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Origem**: erro `Evidência ausente no capítulo. [400]` informado após a publicação do editor.

## Problema e comportamento corrigido

O validador exigia correspondência byte a byte com a parte atual de 12 mil
caracteres. Assim, uma citação com quebras de linha convertidas em espaços era
recusada. Na consolidação de entidades, uma evidência válida da parte anterior
também podia ser recusada, embora pertencesse ao capítulo analisado.
Esses dois casos foram reproduzidos com respostas de provedor controladas;
a resposta real da IA que causou a captura não foi inspecionada.

- Evidências são conferidas no capítulo completo, permitindo consolidação entre partes.
- Apenas diferenças de espaçamento são toleradas; o resultado guarda o trecho original do capítulo.
- Palavras, pontuação e continuidade permanecem obrigatórias. Paráfrases, citações inventadas e padrões de expressão regular são recusados.
- Uma resposta inválida recebe uma tentativa automática adicional por parte, com orientação de validação e limites explícitos no prompt.
- Falhas persistentes da IA são apresentadas como indisponibilidade do provedor, sem culpar os dados enviados pelo autor.
- Falha invalida o lote inteiro; análise e repetição não aplicam lore nem debitam créditos. A quota registra uma única análise.
- Plataforma e BYOK usam o mesmo comportamento; erros de transporte não recebem repetição automática por este mecanismo.

## Arquivos alterados

Validadores em `functions/src/loreAnalysis.mjs` e
`src/features/lore/model/loreAnalysis.ts`; prompt em `functions/src/index.mjs`;
cliente BYOK em `src/features/ai-assistant/services/loreAnalysisClient.ts`;
testes correspondentes e [documentação do fluxo](../lore-analysis.md).

## Verificações

Regressões cobrem espaços não separáveis, CRLF, parágrafos, pontuação literal,
evidência de parte anterior, correção de resposta inválida e recusa persistente
sem gravação, débito ou quota adicional. Testes existentes continuam cobrindo
atomicidade, idempotência e cobrança por lote.

```text
Test Files  79 passed (79)
Tests  547 passed (547)
All files | 93.45 | 85.15 | 91.18 | 95.55
tests 66 / pass 66 / fail 0
tests 46 / pass 46 / fail 0
Smoke test do bundle OK.
```

`npm run validate` passou, incluindo arquitetura, documentação, styleguide,
formatação, lint, cobertura, backend, tipos, build e smoke.
Log local: `test-results/lore-evidence-validate.log`.
O diff foi revisado; não foram adicionadas dependências, alterações de visibilidade,
regras, cobrança ou relações. Permaneceram os avisos conhecidos de chunks e DOCX.

## Implantação

Publicação concluída no projeto `writer-44cd5`, somente de `analyzeChapterLore`,
`prepareBYOKLore` e Hosting, para corrigir o fluxo publicado nesta conversa.
As duas functions foram verificadas como `ACTIVE` em `us-central1`. Os hashes e
estados das demais functions permaneceram iguais aos da listagem anterior;
as regras ativas continuam idênticas a `firestore.rules`.

Os 11 arquivos servidos por `https://writer-44cd5.web.app` retornaram HTTP 200,
com SHA-256 idêntico ao build local validado. Evidência local:
`test-results/lore-evidence-deploy-verification.json`.
SHA-256 de `index.html`:
`02f4396b4a1a019dc9cba07300a08322349717c909a53ac401ccc93a612f9406`.

## Limitações

A IA ainda pode devolver fatos incorretos ou respostas inválidas. Evidência
literal não substitui a revisão humana das propostas. Não foram realizadas
análises reais de manuscrito, chamadas pagas de IA ou alterações de lore em produção.
PR, push e CI remoto não integram esta correção local.
