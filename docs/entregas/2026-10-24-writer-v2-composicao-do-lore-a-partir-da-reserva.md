# Writer V2 — Composição do lore a partir da reserva

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [91 / criação L3A](../tasks/writer-v2/execucao/91-composicao-do-lore-a-partir-da-reserva.md).
- **Decisão**: [ADR 0106](../decisions/0106-creation-lore-composition-and-attempt-cleanup.md).

## Objetivo e implementação

Preparar e auditar a primeira geração de uma ficha sem criar cabeça ou inspeção
fictícias. O fluxo continua interno e exige ativação atômica L3B antes de permitir
a criação na interface.

Intenção creation substitui inspection. Campos name/category e relações precisam
ser explícitos; campos opcionais preservam ausências/null e conteúdo literal,
inclusive BOM, Unicode e quebras de linha. Contexto fixa bookBirth/creationBirth.
Inventário de geração v2 declara a origem de criação; edição existente mantém v1.

Start grava tentativa, binding e prova juntos. Fonte viva é revalidada em cada
unidade; confirmação histórica e cleanup não concedem leitura de prosa. Compositor
reutiliza parser/SHA, seleção de campos e páginas, auditoria e certificado,
sem base herdada. Não muda cabeça, clock, livro, publicação ou crédito.

Antes dos uploads, cancelamento coordena as tentativas e seus campos reserved.
Filho e journal/recibo do criador compartilham transação; lotes de até 16 partes,
header por último. Auditoria confirma gerações canceladas e inventários collected,
preservando controles/leases/recibos/bindings. Órfãos/recriados bloqueiam conclusão.
Exclusão do livro retoma a mesma limpeza, inclusive após cancelamento parcial.

## Critérios e fronteira

- [x] Origem explícita sem cabeça/inspeção anterior.
- [x] Seleção obrigatória e nenhuma herança de relações inexistentes.
- [x] Binding/prova da tentativa acoplados nativamente ao start.
- [x] Composição/auditoria/certificado sem ativação prematura.
- [x] Cancelamento de tentativas/reserved e auditoria dos controles preservados.
- [x] Revogação, root ausente/deleting, rollback, CAS/replay e isolamento.
- [x] Retomada pela exclusão do livro e rejeição de recursos recriados.
- [ ] Ativação atômica L3B e reconhecimento do sucesso histórico.
- [ ] Cliente/recuperação, consumidores/writers/backup e validate integral P1.

## Arquivos

Novos bookLoreCreationAttempts, CreationComposition e CreationAttemptCleanup.
Adaptação de contratos/store/start/compositor/adoção/inventário/journal/cleanup.
Novo helper de fixture, testes Node de composição e testes Firestore SDK.
Sem mudança de Rules, índices, dependências, UI ou callable.

## Validação local dirigida

- 26 casos Node novos positivos em rodadas dirigidas: primeira execução teve
  22 positivos e uma falha na injeção do teste de rollback (interceptava set;
  journal usa update). Corrigido o teste, o caso isolado passou (343.4442 ms);
  três casos adicionais passaram (651.1335 ms). Nenhum caso novo pendente.
- Regressão: nove arquivos existentes, 288/288 positivos, 8520.0793 ms.
  Reservas/upload de criação, campos, reserva/composição/inline/adoção de edição,
  exclusão do livro e inventário. Total de 314 Node distintos; não foi uma
  execução única de 314 testes.
- Firestore SDK: 4/4 positivos, 295504.3951 ms, emulador 1.22.0 com SHA
  verificado, projeto demo e host loopback. Provas nativas, composição literal/
  relações, SDK privado negado, cleanup de mais de 16 partes por lotes/header
  por último após revogação, rollback/retry/retomada pelo livro e recriados.
  Logs PERMISSION_DENIED são as negações SDK esperadas e verificadas.
- Arquitetura: Verificação arquitetural OK.
- Sintaxe: Functions syntax checked: 220 modules.
- ESLint dirigido: código 0.
- Formato/docs/diff: positivos após a redação final.

## Limitações e próximo incremento

Adoção creation está bloqueada explicitamente. L3B deve criar cabeça/geração/
leases/clock/datas/recibo e sucesso do criador na mesma transação, validar o
nascimento da cabeça no reader e preservar o sucesso por edições/retirada/exclusão.
C1 segue recusando qualquer cabeça prematura reservada.

Sem alterações TS/UI, não repetimos Vitest/tipos/build/browser. A suíte completa
npm run validate e cobertura ficam para o fechamento de P1, como autorizado.
Não houve CI remota, push, PR, merge, deploy, migração ou acesso a livro real.
P1/F2-09/Writer V2, comércio e piloto humano seguem abertos.

## Como conferir

Executar o teste functions/test/bookLoreCreationComposition.test.mjs e os casos
SDK em tests/firestore/bookLoreCreationComposition.rules.test.mjs com Firestore
emulado demo e host loopback. O servidor de desenvolvimento permanece disponível
em http://127.0.0.1:5173/, mas este incremento interno ainda não cria uma ficha
pela interface. Logs locais de QA permanecem fora do repositório.
