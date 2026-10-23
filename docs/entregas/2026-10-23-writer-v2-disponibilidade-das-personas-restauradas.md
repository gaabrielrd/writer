# Writer V2 — Disponibilidade das personas restauradas (P1 M36a)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [contrato 72](../tasks/writer-v2/execucao/72-disponibilidade-das-personas-restauradas.md)
- Decisão: [ADR 0083](../decisions/0083-restored-persona-availability.md)

## Objetivo e funcionalidades

Preparar os consumidores da biblioteca antes de instalar personas globais:
perfis pendentes/cancelados não aparecem nos seletores nem podem ser editados,
vinculados ou reutilizados pela IA/backup. Personas legadas continuam funcionando.

## Critérios atendidos

- [x] Contratos puros fechados de origem/lote, tipos compartilhados e gate
      servidor por identidade/recibos/nascimento/última alteração nativos.
- [x] Recriação/ABA de lote ou recibos bloqueia a origem; edição legítima do
      perfil ativo continua disponível.
- [x] Biblioteca consulta/assina lotes sob demanda, invalida erro/retirada e
      ignora callbacks antigos. Lista visível inalterada não notifica novamente.
- [x] Edição verifica lote no CAS, preserva metadata nativa e ignora tentativa de
      fornecê-la pelo input do editor.
- [x] Rules bloqueiam adulteração de origem, edição/vínculo pendentes e escrita
      de lote pelo SDK; leitura própria/revisão/data legadas permanecem.
- [x] IA, histórico, backup de perfil/rascunho e escritor legado compartilham o
      gate. Resposta indisponível oculta antes do corpo, pergunta própria preservada.
- [x] Snapshot portátil não inclui restoreOrigin; biblioteca de outro dono isolada.
- [x] Nenhum produtor global, inventário, ativação de livro, crédito, dependência
      ou API pública nova.

## Arquivos

PersonaAvailability/Contracts(.mjs/.d.mts), integração em BookBackupPersonaRead,
EditorChatContextRead/HistoryRead, WorkProgressLegacy e Functions check.
Modelo/serviço/testes de ai-assistant e Rules aplicam o contrato ao cliente.
Fixture/testes Node/SDK, AGENTS, README, arquitetura/testes, plano/execução e
ADR registram os limites e próximos produtores.

## Testes e validações reais

**114 testes backend distintos positivos**, nove arquivos em dois lotes dirigidos:

```text
# Gate, personas/rascunho, contexto/histórico e escritor legado
tests 63
pass 63
fail 0
skipped 0
duration_ms 355.5002

# Captura, geração e aplicação de IA
tests 51
pass 51
fail 0
skipped 0
duration_ms 637.5713
```

Inclui 15 cenários novos de gate, marcadores inválidos, estados/escopo, provas
nativas, ABA/recriação, snapshots portáteis, rascunho exclusivo, compilação de IA,
escritor legado e resposta antiga oculta sem ler corpo nem perder a pergunta.

A regressão detectou mudança de stale para unknown em um ID seguro indisponível
do chat. O helper foi corrigido para preservar esse tratamento legado e o caso
passou novamente. A expectativa da leitura metadata-only do rascunho foi ajustada
para incluir somente restoreOrigin; nenhum texto de instruções foi acrescentado.

**15 testes Vitest distintos positivos**, quatro arquivos: personaService,
personaRestoreAvailabilityService, usePersonaLibrary e PersonaManager;
15/15, 6,66 s. Após evitar notificações sem mudança visível, apenas os nove
cenários dos serviços afetados foram repetidos: 9/9, 1,41 s. Não somar repetições.
Uma expectativa da fixture sofreu conversão de codificação; corrigida com escapes
Unicode explícitos. Ajustes de tipagem das fixtures passaram no lint/typecheck.

**14 cenários SDK reais distintos positivos**, Firestore 1.22.0 verificado,
portas loopback dedicadas, nenhuma falha/skip:

```text
# Disponibilidade e Rules novas
tests 4
pass 4
fail 0
skipped 0
duration_ms 10855.6153

# Compatibilidade de personas/rascunho legados
tests 10
pass 10
fail 0
skipped 0
duration_ms 9277.6445
```

SDK prova bloqueio de edição/falsificação/vínculo pendentes, preservação de
biblioteca legada, edição/vínculo ativos, origem imutável e rejeição nativa de
lote/recibo recriados. Ativação é fixture Admin com recibos nativos, não ativação
pelo restaurador. Logs de PERMISSION_DENIED/evaluation error correspondem às
tentativas deliberadamente recusadas; todos os cenários terminaram positivos.

Typecheck, lint dirigido, sintaxe de Functions e arquitetura passaram.
Bundle cliente e smoke passaram; permanecem avisos de chunks acima de 500 kB
e imports dinâmicos também importados estaticamente. Formatação/docs/diff e
revisão final conferidos antes do commit. Sem componente visual alterado;
não executadas jornadas de navegador/ativação. Validate integral continua
reservado ao fechamento do bloco P1.

## Limitações e continuação

O servidor exige prova nativa; o filtro cliente e as Rules de seleção/edição
não transformam metadata de lote em grant de IA. A leitura própria de registros
já pertencentes ao UID continua permitida.

Instalação global M36b ainda precisa ampliar inventário/cleanup, criar novas
cópias sem sobrescrever biblioteca e liberar o lote na ativação final.
Preservar lote/recibos ativos após exclusão do livro. Guardas/Rules/cliente devem
ser publicados antes dos produtores; nenhuma publicação foi executada.

Disponibilização da capa, campos grandes/consumidores, certificação/ativação e
host/UI/roundtrip/validate permanecem. P1/F2-09 e Writer V2 abertos.
Somente commit local, CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
