# Writer V2 — Consumidores do texto lógico (P1 M27)

## Objetivo e funcionalidades

Aplicar sugestões e converter/remover capítulos com corpos externos preservando
texto, versões, referências e cobrança. Separar composição canônica de campo
legado congelado, inclusive na projeção de backup.

[Plano 60](../tasks/writer-v2/execucao/60-chat-e-conversao-com-texto-logico.md) e
[ADR 0071](../decisions/0071-logical-chapter-consumers.md) registram decisões e limites.

## Critérios atendidos e escopo

- Chat usa texto lógico no CAS e escritor compartilhado no aceite, junto de
  saldo, mensagem paga e recibo. Replay preserva a confirmação histórica.
- Conversão conserva fonte completa inline e campo congelado, limpa ponteiro e
  libera somente o pin do capítulo no commit da cena/ledger. Versões continuam.
- Remoção por agrupadores mistos também libera seu pin uma vez; retomada permanece
  disponível por metadados depois de coletar bytes.
- Editor resolve prosa composta pelas cenas; backup hidrata o campo congelado
  externo sem criar fallback ou alterar o formato do arquivo.
- Limites originais de cena/chat/envelopes mantidos, com recusa integral do excesso.
- Nenhuma nova dependência, callable, Rule, segredo ou mudança visual.

Arquivos principais: chapterChat.mjs, scenes.mjs, sceneJobs.mjs e bookBackupRead.mjs
em functions/src; bookService.ts na feature books; testes Node/SDK/cliente e
helper compartilhado de sugestões sem geração externa.

## Testes e validações reais

- **143 testes Node distintos positivos** em lotes dirigidos:
  133/133 em 7.763,7846 ms (consumidores, chat, cenas, progresso, histórico,
  recursos de backup e coleta); após o achado do campo congelado, 27/27 em
  6.411,3058 ms (consumidores e bookBackupRead), incluindo dez casos distintos
  adicionais ao lote anterior.
- **144 Vitest distintos positivos**: ChapterChatPanel/chapterChatService/
  ScenePlanner (67, 18,60 s), bookService (59, 5,91 s) e composição real
  chapterCompositionService (18, 1,44 s).
- **3 SDK reais distintos positivos**, sem falhas/skips, 15.718,3936 ms:
  bookChapterConsumers.rules.test.mjs. Caso de conversão/backup afetado pela
  revisão passou novamente em 9.561,0403 ms.
- Falha nativa por parte ocupada preservou saldo, ledger, pin anterior e ausência
  de recibo; repetição concorrente debitou uma única vez. Conversão e fonte
  permaneceram íntegros após coleta, inclusive com histórico e campo congelado
  externo. Remoção retomou após interrupção e coleta. SDK direto continuou negado.
- Lint dirigido, check de Functions, arquitetura, typecheck, build:bundle e
  smoke:build passaram. Bundle conserva avisos de tamanho/importação dinâmica.
  Formatação/docs/diff e revisão final passaram; achados de remoção mista e
  campo congelado externo foram corrigidos e cobertos antes do commit.
- npm run validate integral reservado ao fechamento P1; CI ignorada.

## Limitações e próximos passos

As sugestões da fixture foram semeadas; não houve geração paga de IA ou chamada
BYOK externa. O SDK testa as fábricas e transações, sem comprovar transporte Auth/
App Check ou entrega Eventarc em produção. Não houve deploy nem jornada de
restauração final no navegador.

Faltam demais recursos/campos grandes, personas/mídia, autorização/ativação e
host/UI/roundtrip/validate integral. P1/F2-09 continuam abertos. Os orçamentos
anteriores de 800.000 bytes não foram ampliados; textos maiores permanecem legados
para divisão explícita, sem truncamento.

Somente commit local; checkout original e servidor local preservados.
