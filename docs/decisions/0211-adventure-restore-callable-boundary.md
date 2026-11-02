# ADR 0211 — Fronteira callable da restauração de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado dirigidamente no código local.
- Plano: [189](../tasks/writer-v2/execucao/189-transporte-autenticado-da-restauracao-de-aventuras.md).
- Antecedentes: [0210](0210-adventure-activated-source-collection.md) e
  [plano do transporte de livros](../tasks/writer-v2/execucao/136-transporte-da-restauracao.md).

## Decisão

O pipeline interno de aventuras passa a ter 29 comandos transportáveis explícitos.
ADVENTURE_RESTORE_METHODS em adventureRestoreCallable é imutável; index.mjs
declara os exports literalmente e seleciona esse serviço antes do dispatch
genérico. Não enumerar propriedades do serviço para descobrir permissões, nem
usar method/action do payload para escolher outra operação.

invokeAdventureRestoreCallable autoriza UID antes de seleção/executar, aceita
somente função própria com nome na lista e conserva erros de contrato.
Leitores, geradores de hash, observadores, chaves e helpers não são callables.
Recuperação de chave permanece um protocolo HTTP separado a implementar.

A composição usa createAdventureRestoreTransferService com db e o adaptador
compartilhado createRestoredImageStorage, sem cast ou runtime de livro. App Check
obrigatório no middleware Functions, região us-central1, 512MiB, maxInstances 5,
sem segredos de IA. Validação tem timeout 540 s; os demais comandos, 120 s.

Comandos executados recebem private, no-store e Vary Authorization, inclusive
erros da aplicação. Recusas anteriores do middleware Auth/App Check permanecem
sanitizadas pelo SDK. A fronteira comum converte GenerationError/reason e
oculta falhas inesperadas com resposta unavailable. Não logar payload ou chaves.

## Validação e limites

Lista/dispatch, prototypes, UID, configuração/export/segredos, headers e razões
têm testes próprios. Wrappers run não comprovam middleware: HTTP real cobre
recusas de App Check/Auth e entrada fechada, com verificadores sintéticos apenas
no processo de teste. Um erro inesperado do serviço é sanitizado no wrapper real.

SDK integrado usa esses exports HTTP, Firestore demo e Rules reais: upload,
preparação, auditoria, ativação, mídia, coleta e replay histórico. Verificadores
Auth/App Check são sintéticos; isso não comprova credenciais/IAM/atestação de
produção. Resultado executado na
[evidência](../entregas/2026-10-28-writer-v2-transporte-da-restauracao-de-aventuras.md).

A transição muda o contrato de código interno descrito nos planos anteriores;
não houve deploy nem anúncio de disponibilidade remota. Recuperação HTTP/chaves,
cliente/journal cifrado/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e gates continuam
abertos. Sem dependência, índice, Rules, CI ou operação remota. Validate integral
no fechamento do próximo grande bloco; macro 8/35 inalterada.
