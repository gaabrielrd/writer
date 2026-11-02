# Writer V2 — Núcleo semântico com checkpoints (P1 M15)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, local.
- **Plano:** [contrato 48](../tasks/writer-v2/execucao/48-nucleo-semantico-com-checkpoints.md).
- **Decisão:** [ADR 0059](../decisions/0059-book-content-checkpoints.md).
- **Estado:** marco interno; P1/F2-09 e a V2 integral continuam abertos.

## Objetivo

Permitir que o servidor continue a validação sem reimplementar as regras dos
leitores de backup. O núcleo agora aceita checkpoints entre itens e verificações;
os leitores atuais de pacote novo e JSON v1–v6 já usam esse mesmo núcleo.

## Funcionalidades e aceites

- [x] Estado fechado/limitado a 16 KiB, sem nomes/prosa/perfis completos.
- [x] Entrada e snapshots isolados por cópia; operação pendente não expõe controle.
- [x] Retomada após JSON entre itens, expectativa raw e etapas finais.
- [x] Relações numerosas, referências e ranks processados em lotes de até 64.
- [x] Erro/abort invalida a instância e impede resultado/checkpoint parcial.
- [x] Novo formato estrito e exceções legadas preservados.
- [x] APIs e relatórios públicos existentes preservados; semantic-only fica interno.
- [x] Regressões Node/cliente/navegador passaram.
- [ ] Parser/índice/checkpoints persistidos no servidor, remapeamento e ativação.
- [ ] Host protegido, UI/roundtrip e validate completo de P1.

## Arquivos

bookContentMachine contém o estado e as regras extraídas; bookBackupContent
mantém o adaptador de leitura/canonicidade/raw e compõe content-only após framing.
A fixture de testes anterior foi extraída para helpers/bookContentFixture sem
alterar os asserts de regressão. Novo teste do núcleo cobre pausas/retomadas.
Comando de check sintático inclui o módulo; sem dependências novas.
Plano/execução, ADR, arquitetura/testes/README/AGENTS e esta evidência atualizados.

## Node e cliente

Lote Node inicial completo: **34/34**, sem pulos, 466,4047 ms — 22 regressões
(pacote novo e v1–v6) e os primeiros 12 testes do núcleo.
Após acrescentar o caso de nome de capa, o arquivo novo passou **13/13** em
232,7507 ms. São **35 casos distintos** conferidos nesta entrega.

Casos novos recriam a máquina via JSON entre cada operação, com finalização
de uma aresta/linha por vez, e comparam o resultado ao validador público.
205 relações avançam em lotes de três, com todos os avisos preservados.
Há hash de item alterado com os mesmos IDs, fonte/corpo obrigatório ausente,
rank ativo duplicado, prova raw incompatível/duplicada, controle inválido/
grande, orçamento excedido, concorrência, erro de índice e abort.
Nome/perfil/prosa não aparecem nos checkpoints; snapshot/resultado não alteram
a instância. Porta de índice em memória é fixture, sem alegação de Firestore.

Vitest dirigido: **46/46**, cinco arquivos em 3,32 s: inspeções nova/legada,
índice protegido, interoperabilidade com exportador real e suas regressões.
APIs autorais do exportador são simuladas nesses testes.

## Navegador e emuladores reais

Dois probes privados copiados para novos nomes, preservando a evidência M11/M12:

- Formato novo: **11 cenários**, probe 48,27 s (Node 49,3001184 s). Firestore
  1.22.0 e Storage 1.1.3 verificados, portas efêmeras loopback, UID de teste fixo.
  Chromium/OPFS reais produziram e validaram **1.462.102 bytes**, 170 registros,
  58 versões, histórico/draft Unicode/vazio/removido, capa PNG/hash independente,
  sete seções, índice protegido/limpeza/adulteração, revisões externas e abort.
  172 escritas aguardadas, uma ativa por vez e quadros de até 65.703 bytes.
- Legado: **nove cenários**, probe 3,928 s (Node 4,4421212 s). Seis arquivos
  do exportador em File/OPFS, versão futura, corpo corrompido e cancelamento.
  Hash independente e ausência de prosa global/URLs no relatório conferidos.

Ambos terminaram com código zero, sem runtimeErrors nem blockedRequests.
Mídia usa callbacks locais e serviços reais contra emuladores, não Auth/App Check
produtivos. Na execução de mídia ocorreram avisos MaxListenersExceededWarning;
não foram suprimidos nem declarados corrigidos.

Artefatos m15-content-native.test.mjs/json e m15-legacy-native.test.mjs/json e
log m15-content-native-emulator.log ficam no diretório privado da sessão,
fora do Git. Não provam restauração, seletor externo ou lançamento.

## Validações

Typecheck, bundle de produção e smoke passaram. Avisos de tamanho/imports
dinâmicos ineficazes do bundle permanecem conhecidos.
Lint dirigido passou após remover um import assert sem uso da fixture extraída.
Check sintático de Functions, documentação e arquitetura passaram. Formato e
diff final conferidos; revisão sem bloqueadores no escopo deste marco. Não repetir suíte completa a cada ajuste:
validate integral permanece para fechamento P1, conforme orientação do operador.

## Limitações e próximo passo

O núcleo não persiste índice/checkpoint e não faz rollback de porta externa.
O host servidor deverá confirmá-los juntos, vincular origem/geração e ampliar
cleanup antes de qualquer writer. Não aceitar checkpoints ou provas raw do
cliente como autorização. semantic-only não substitui framing/autorização.

Parser retomável de contêiner e JSON legado, protocolo servidor, preparação/
remapeamento/mídia, universo atual, ativação, host/recuperação e UI/roundtrip
continuam necessários. A pergunta pendente sobre uso do draft segue para essa
restauração. Sem CI, push, PR, merge, deploy ou novo endpoint.

## Como conferir

Executar bookContentMachine.test.mjs, bookBackupContent.test.mjs e
bookLegacyReview.test.mjs. Conferir as inspeções/interoperabilidade dirigidas do
cliente. Não há uma interface de restauração final disponível neste marco.
