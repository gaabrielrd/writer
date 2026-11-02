# Writer V2 — Transporte e recuperação da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [111 / M38c5m](../tasks/writer-v2/execucao/111-transporte-e-recuperacao-da-criacao-de-lore.md).
- **Decisão**: [ADR 0126](../decisions/0126-manual-lore-creation-recovery-origin.md).

## Objetivo e funcionalidades implementadas

Suporte de servidor para criação manual nativa antes de existir ficha.
A callable existente encaminha start/get/cancel/cleanup do criador e aceita
referências manuais de criação nos uploads/composição. Prefixos/DTOs fechados,
UID autenticado e serviços nativos preservam o isolamento dos filhos da análise.
Não há dispatcher genérico ou SDK como fallback.

Recuperação pode reservar uma chave original vinculada à reserva/livro
originais. Reabrir draft após cancelamento continua possível, sem reautorizar
upload. Após adoção, chave exige cabeça original pelo nascimento nativo.
Ausência/retirada/recriação, troca de origem/dono ou manutenção negam chave;
metadata histórica e revogação explícita continuam disponíveis.

Intenção opcional creation preserva objetos/hashes antigos quando ausente.
Registro/view existentes permanecem compatíveis. Não guardar prosa no servidor
da recuperação nem usar corpo/estado do cliente como grant. Chave é recebida
somente pela fronteira HTTP existente; metadata não contém seus bytes.

**Sem entrada de criação nova no compêndio**: cliente durável/host, criação/
exclusão integrada, lifecycle e rollout continuam obrigatórios. Este incremento
entrega a dependência de servidor, sem declarar CRUD completo ou V2 concluído.

## Aceites e revisão

- [x] Quatro operações de criação no transporte autenticado, com namespace próprio.
- [x] Refs de análise/internas, DTO extra e UID falso recusados.
- [x] Criação real por campos multipart e relações paginadas, com adoção explícita.
- [x] Recuperação antes da cabeça, pós-cancel e pós-adoção pela origem original.
- [x] Recriação/ausência/revogação e troca de escopo não concedem chave.
- [x] Confirmar metadata/revogar não altera cabeça ou cancela jobs.
- [x] Hashes antigos e journal existente preservados.
- [x] Tests/checks dirigidos, revisão e documentação registrados.
- [ ] Coordenador/ticket/cópia cifrada e UI da criação no cliente.
- [ ] Exclusão integrada, chave ao excluir livro, demais consumidores/rollout.
- [ ] Validate integral de P1 e fases restantes do Writer V2.

A revisão encontrou acoplamento entre a allowlist do transporte e o journal.
Separadas: lista manual contém 22 métodos; journal mantém os 18 anteriores.
Regressão recusa controles de criação inclusive em envelopes no formato antigo.
Não ampliar o journal implicitamente enquanto falta seu coordenador de criação.

Guardas conferem prova/nascimento, identidade de livro/reserva/cabeça e marker
do servidor antes de devolver chave. Cancel conserva só chave existente;
nova recuperação depois de cancelar/adotar é recusada. Revogação não remove
a cabeça nem sua substituta. Nenhuma dependência, segredo ou novo namespace.

## Testes e validações reais

**143 testes distintos positivos, com 32 novos**, em rodadas dirigidas:

- **82 Node distintos**: 25 de recuperação da criação (novos), 14 de transporte
  (quatro novos), 30 da recuperação existente, 12 HTTP e um de entry.
  Rodada inicial **68/68 em 0.53 s**; após revisão do transporte, HTTP/dispatcher
  **26/26 em 3.22 s**. Recuperação final **25/25 em 0.47 s**.
  Entry **1/1 em 3.61 s**. Retakes não somam casos.
- **56 Vitest** em 1.75 s: serviço de edição, sessão manual e journal.
  Um caso novo fecha a lista do journal à criação. Rodada anterior de
  duas sessões: 38/38 em 1.72 s, já incluídos nos 56 distintos.
- **5 SDK/Rules**, Firestore demo 1.22.0 com JAR verificado, **5/5 em 39.76 s**:
  três regressões e dois novos. Recuperação sem cabeça/cancel, origem/provas
  nativas da adoção, JSON idêntico recriado, recusa SDK de artefatos privados
  e AES-GCM real. Retake apenas do caso cancel ampliado: **1/1 em 8.21 s**,
  incluindo recusa de upload após recuperar a chave.
- Transporte Node percorre uploads multipart, composição, 65 relações em
  duas páginas e adoção/replay atômicos, preservando BOM/CRLF/espaços/ausências.
- HTTP verifica Auth/App Check/cache/argumentos nos adapters existentes.
  Verificadores positivos são facades locais; não comprovam credenciais ou
  atestação reais de produção. Logs de App Check inválido/SDK denies são esperados.
- Lint final dirigido passou sem warnings; a tentativa inicial incluiu .d.mts
  sem configuração ESLint, corrigida a seleção. Typecheck final passou.
- Sintaxe do novo helper e diff passaram; os demais módulos foram carregados
  pelos testes. Checks de arquitetura/docs/formatação no fechamento.
- Não executados: suíte integral/coverage, build, UI/Chromium ou SDK completo.
  Nenhuma UI foi alterada. Validate integral permanece no fechamento de P1.

Artefatos em writer-v2-portability-qa, fora do Git: m38c5m-sdk.mjs/.log,
m38c5m-sdk-cancel-retake.mjs/.log e logs do emulador. Somente dados de fixture.
Código usa os protocolos nativos reais sobre double em Node e Firestore real
no emulador; não é implantação de Functions nem teste do compêndio completo.

## Arquivos e próximos passos

Transporte/métodos/declaration, intenção e serviço de recuperação ampliados;
novo helper de autorização da origem e fixture/teste próprios; regressões
cliente e SDK atualizadas. ADR/AGENTS/arquitetura/testes/execução/plano 81 alinhados.

Próximo incremento: coordenar criação no cliente com metadata durável antes
da primeira RPC, reconciliação de reserva incerta e recuperação cifrada, até
ligar o fluxo ao compêndio junto dos outros portões. Também permanecem
exclusão nativa no cliente, lifecycle de chaves, writers/contextos/publicação/
backup completos, rollout e validate de P1. P1/F2-09/V2, fases 3–5 e gates
humanos/comerciais continuam abertos. Sem CI/push/PR/merge/deploy.
