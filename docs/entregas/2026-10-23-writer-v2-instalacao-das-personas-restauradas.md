# Writer V2 — Instalação das personas restauradas (P1 M36b)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [contrato 73](../tasks/writer-v2/execucao/73-instalacao-das-personas-restauradas.md)
- Decisão: [ADR 0084](../decisions/0084-restored-persona-installation.md)

## Objetivo e funcionalidades

Preparar novas cópias das personas usadas no backup sem substituir a biblioteca
existente. Cópias continuam pendentes de ativação: preservam o estilo original,
inclusive perfis arquivados e o exclusivo do rascunho. Cancelamento revoga o lote
antes de limpar seus recursos, conservando a biblioteca alheia à restauração.

## Critérios atendidos

- [x] Inventário v14/progresso v11 antes de qualquer lote/perfil global.
- [x] Definição privada autenticada e projeção/hash conferidos; snapshot literal
      com origem operacional, sem adotar perfis atuais ou do histórico apenas.
- [x] Uma cópia por transação; perfil/journal/contador/cursor/lote/recibo juntos,
      sem transação de ativação proporcional à quantidade de perfis.
- [x] Colisão falha sem adoção ou sobrescrita; replay/CAS/retry não duplicam.
- [x] Contagem exata, fase resources-finalize, cursor do arquivo preservado,
      raiz ausente e countReady false.
- [x] Lote permanente com provas de nascimento/última alteração e recibos próprios;
      preparing/cancelled continuam indisponíveis.
- [x] Revogação antes de Storage/artefatos, limpeza por metadados e prova nativa,
      preservando biblioteca existente, outros jobs/UIDs e registros recriados.
- [x] Lote cancelled e recibos preservados após limpeza; compatibilidade v1–v13.
- [x] Sem ativação, API pública, Rule, dependência, crédito ou interface nova.

## Arquivos alterados

BookRestorePersonaLibrary/Batch/Contracts implementam instalação e revogação.
BookRestoreUpload/Contracts, Artifacts, Integrity e ValidationCleanup integram o
inventário/progresso e os recibos. PersonaAvailability compartilha a prova nativa;
seu contrato/tipo exporta o parser de origem. BookBackupPersonas rejeita entrada
sem representação literal segura; Functions check inclui os três módulos novos.

Testes Node/SDK e auxiliares cobrem o protocolo, incluindo 501 perfis.
AGENTS, README, arquitetura/testes, plano/registro de execução e ADR documentam
as regras e a continuação.

## Testes e validações reais

**341 testes backend distintos positivos**, em 28 arquivos de restauração,
disponibilidade, leitores de personas e conteúdo de backup:

```text
tests 341
pass 341
fail 0
skipped 0
duration_ms 25597.5195
```

Inclui os 15 cenários novos de instalação/limpeza e o cenário com **501 perfis
validados pelo fluxo completo**. Neste último, cada commit do instalador teve no
máximo cinco gravações; lote permaneceu preparing e raiz ausente. Executado
separadamente em 9874.0611 ms e novamente na regressão; não somar repetições.
Nenhum limite de quantidade foi adicionado ao produto.

Primeiro lote de testes teve 14/15: o cenário sem personas conservava um
complemento na fonte original da cena. Corrigida a fixture, 15/15 positivos.
O caso de 501 perfis revelou um limite de 1000 passos no auxiliar de validação
dos testes; ampliado para 10000, sem alterar limite do produto. Após reforçar a
preservação de outro UID/job e corrigir uma variável não usada apontada pelo
lint, somente os dois casos afetados foram repetidos: 2/2, 789.7542 ms.

**39 testes Vitest positivos**, quatro arquivos: bookPersonaCapture,
bookDraftBackupRecords, inspectBookBackupContent e
personaRestoreAvailabilityService. 39/39, 3,15 s.

**Sete cenários SDK reais positivos**, Firestore 1.22.0 verificado, portas
loopback dedicadas:

```text
# Instalação, Rules, cancelamento e recriação nativa
tests 3
pass 3
fail 0
skipped 0
duration_ms 220729.346

# Regressão de disponibilidade ativa/legada e origem imutável
tests 4
pass 4
fail 0
skipped 0
duration_ms 3262.4325
```

SDK verifica snapshots/counters/timestamps nativos, colisão sem gravações
parciais, bloqueio de edição/vínculo/liberação pelo cliente, revogação antes de
deletes, limpeza certificada, replay sem recriação e proteção de perfil/lote
recriados. Ativação no teste anterior de disponibilidade é fixture Admin,
não ativação pelo restaurador. Logs PERMISSION_DENIED/evaluation error são das
tentativas deliberadamente recusadas; os processos terminaram positivos.

Typecheck, arquitetura, sintaxe de Functions e build/smoke passaram.
Bundle em 2,09 s, com avisos existentes de chunks acima de 500 kB e imports
dinâmicos também importados estaticamente. Formatação, lint dirigido, docs,
diff e revisão final conferidos antes do commit. Nenhum componente visual foi
alterado; não foi executada jornada autenticada de restauração no navegador.
Validate integral fica para o fechamento do bloco P1, conforme instrução do usuário.

## Limitações e continuação

Protocolo ainda interno; lotes nunca são liberados por este instalador.
Guardas/Rules/cliente M36a precisam estar implantados antes dos produtores.
Lote cancelled é permanente; ativo e recibos deverão sobreviver ao livro.
Limpeza pós-ativação precisa aposentar journals sem remover a biblioteca.

Campos grandes ainda devem ter suporte integral e consumidores compatíveis antes
da ativação; falhar íntegro não satisfaz esse requisito. Disponibilização da
capa, certificação/ativação e host/UI/roundtrip/validate permanecem.
P1/F2-09 e Writer V2 continuam abertos. CI ignorada; somente commit local,
sem push/PR/deploy. Checkout original e servidor local preservados.

## Como verificar

Rodar os testes Node do instalador e do caso com mais de 500 perfis. O teste
SDK em tests/firestore/bookRestorePersonaLibrary.rules.test.mjs exige emulador
Firestore loopback compatível, como os demais testes dessa pasta. A API interna
ainda não oferece fluxo cliente para validar a ativação completa.
