# Writer V2 — journal protegido da preparação

## Resultado e aceites

Intenção da preparação fica cifrada no dispositivo e pode ser reaberta pela
mesma conta após autorização da chave original. Não persiste chave, tokens,
arquivo ou prosa. Um navegador reiniciado retoma o mesmo operationId/checkpoint,
confirma o pedido anterior e só então limpa sua dívida, sem criar outra operação.

Fábrica pública conecta o armazenamento ao port do sequenciador. Web Locks
coordenam abas; CAS compara intenção completa e depois envelope completo dentro
de transação IndexedDB. Revogação, adulteração, concorrência e falhas preservam
o registro. Não há fallback plaintext. Ainda não há tela para este fluxo.

## Arquivos

Quatro serviços de recuperação/chave, cifra, IndexedDB e journal, exportação
pública, proxy Vite exato e quatro arquivos de teste. Hosting/servidor não foram
alterados. Sem dependência nova.
[Plano 138](../tasks/writer-v2/execucao/138-journal-protegido-da-preparacao.md) e
[ADR 0159](../decisions/0159-protected-restore-preparation-journal.md).

## Vitest dirigido — 35 casos distintos positivos

- Cliente de chave: nove casos, 554 ms; contexto/conta/tokens, resposta limitada,
  chave AES não extraível, base64 canônica, erros e rede sem repetição.
- Crypto: dez casos, 458 ms; recuperação literal, nonce/stamp novos, AAD de todos
  os campos, adulteração, grants inadequados, envelopes/intenção fechados,
  limites, guards e comparação estrutural.
- Journal: 11 casos, 439 ms; grant padrão, CAS, dívida ocupada/ausente/divergente,
  revogação, corrupção, concorrência, alteração durante await, conta, plataforma
  indisponível, quota e CAS perdido.
- Proxy: três casos, 592 ms; path/query exatos, rejeição de vizinhos e preservação
  da rota adventure-import.
- Dois novos casos de erros JSON privados passaram numa seleção de três,
  864 ms; o terceiro repete recusa de respostas inválidas, com 18 não selecionados.
  Não contar a repetição como caso novo.

Não houve lote global único de 35. Defaults de HTTP e grant são exercitados com
mocks; testes de crypto usam WebCrypto real. Journal unitário simula o port de
armazenamento/locks; comportamento nativo é provado abaixo.

## Chromium nativo — dez cenários distintos positivos

Primeiro runner: 8/8, zero falhas. Perfil isolado, Vite local, IndexedDB,
WebCrypto e Web Locks reais; nenhuma conta de produção.

Persistência cifrada, reinício completo do navegador com autorização nova,
duas abas concorrentes, tentativa de limpar intenção antiga, autorização
revogada, nonce adulterado, guard invalidado após autorização, aborto de
transação readwrite e escritor externo durante await. Ciphertext não é
substituído/apagado nas recusas; CAS completo vence mesmo fora do lock cooperativo.

Segundo runner: 1/1. Driver real com journal nativo e serviço remoto simulado
que perde a primeira resposta depois de registrar o recibo. Após reinício,
driver envia exatamente a mesma ação/input/operationId, não cria novo ID ou
getter de seleção, confirma um único recibo e limpa a cópia local. Não é
roundtrip com Firebase de produção.

Terceiro runner: 1/1, com três variações de abertura/leitura/escrita. Após
normalizar erros do adaptador, guards que lançam valores sem tipo produzem
Error seguro e preservam ciphertext; escrita abortada não remove o registro.

Runners e JSON QA externos m46-restore-journal-browser,
m46-driver-reload-browser e m46-db-errors-browser. Perfis privados de teste fora
do Git; sem artefatos grandes ou dados reais no repositório.

## Checks e correções

Formato, lint dirigido, typecheck, arquitetura, documentação e diff verificados
no fechamento. Primeiro typecheck recusou captura de raw.context unknown no
callback; a variável validada passou a ser capturada por const, sem relaxar o
contrato. Lint recusou rejeições unknown e união redundante no IndexedDB;
normalizadas para Error e Promise de unknown. Teste nativo dirigido acima
conferiu a mudança. Proxy teve escaping ajustado antes dos três testes verdes.

Revisão conferiu chave não persistida, limites, AAD, guards, transações sem
await externo, CAS completo e preservação na revogação. Não houve mudança de
contrato transacional do servidor/Rules; emulador não repetido.

## Pendências

Ativação/cancelamento revogam a chave do upload; conservar envelope e bloquear
abertura. Descarte local explícito e reconciliação terminal ainda precisam da UI.
Upload inicial, revisão/ativação/mídia/limpeza do cliente, interface, roundtrip
integral, inventários/writers/exclusão/legados/rollout/validate de P1, fases 3–5
e gates humanos/comerciais continuam. Padrão indexado permanece false.

Build/validate global não repetidos; validate no fechamento de P1.
Somente commit local, sem CI, push, PR, merge, deploy ou subagentes.
