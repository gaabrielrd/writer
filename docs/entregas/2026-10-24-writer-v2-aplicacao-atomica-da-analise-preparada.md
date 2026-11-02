# Writer V2 — Aplicação atômica da análise preparada

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [98 / A2c](../tasks/writer-v2/execucao/98-aplicacao-integral-da-analise-preparada.md).
- **Decisão**: [ADR 0113](../decisions/0113-atomic-prepared-lore-analysis-application.md).

## Objetivo e funcionalidades

Aplicar todos os alvos do lote pronto, locais/globais/novos, junto do débito
de crédito e comprovante permanentes na mesma transação. Até 50 itens usam
um clock por domínio e um timestamp comum; relações, campos não selecionados
e consentimento existentes permanecem intactos. Criações começam privadas.

O contrato applyLoreAnalysis continua recebendo id/text/changes e retornando
applied/credits. Com reserva ready usa o finalizador preparado; preparação/
cancelamento bloqueiam o caminho legado antes de escrever/cobrar. Sem reserva
o comportamento anterior inline/global permanece, recusando payload sem preparo.
Não se concentra toda a preparação numa chamada longa.

Prontidão não concede acesso: a confirmação reabre análise/provedor originais,
encarnações e contexto lógico. Todos os membros/certificados e proprietários
precisam das provas nativas. A capacidade agregada exata não libera adoção
singular/subconjunto nem produção, mesmo após abrir o batch.

Plataforma debita um crédito por lote; BYOK debita zero. Cabeças, gerações,
criadores, leases, globais, clocks, invalidação de autorização global, saldo,
ticket, estado e recibo confirmam juntos. Leituras precedem todas as gravações.
Falhar em qualquer limite de escrita reverte todos os efeitos.

Recibo e prova imutáveis nascem junto do evento final, estado e grupo A2a.
Confirmação histórica exige o grupo original, sem preparar/commitar adoção nova,
ler fontes atuais ou cobrar novamente. Continua válida após expiração, topup,
revogação, retirada/coleta e exclusão do livro/ticket. Recriação/perda de prova
bloqueia para reconciliação; cancelar sucesso é recusado.

Exclusão verifica applied e preserva comprovantes, deixando a limpeza geral
aposentar/coletar os recursos. O hash canônico do preparo não substitui o JSON
histórico dos recibos legados. Marca application presente no ticket, mesmo
nula/inválida, exige comprovantes novos e não admite fallback mutável.

## Critérios

- [x] Contrato existente roteado na mesma transação da reserva/ticket.
- [x] Reautorização e certificados integrais antes da aplicação.
- [x] Capacidade exata do batch, sem adoção singular/subconjunto ou produção.
- [x] Locais/globais/novos, crédito e recibo reais no mesmo commit.
- [x] Uma cobrança, clocks agregados, datas comuns e defaults privados.
- [x] Recibos nativos permanentes, replay metadata e ausência de ressurreição.
- [x] Cancelamento e exclusão integrados, preservando sucesso.
- [x] Testes dirigidos, revisão, docs/ADR e regra do AGENTS atualizados.
- [ ] Orquestração de preparo/recuperação no cliente/endpoints e rollout.
- [ ] Demais integrações e validate integral de P1/F2-09/V2.

## Arquivos e fronteira

Finalizador, contratos do comprovante e leitor histórico; bindings nativos
de filhos, abertura opaca de batch A2a, estado/store/view da aplicação,
roteamento legado e exclusão. Dois arquivos de testes, plano, ADR, AGENTS,
README, arquitetura, testing e registro de execução/progresso.

Não houve mudança de UI, callable público, dependências, índices compostos,
preço, limite do compêndio ou modelo comercial. SDK continua sem acesso aos
comprovantes. Estas Functions não foram implantadas.

## Validação local dirigida

**248 casos Node distintos positivos**, em rodadas necessárias:

- **201/201** regressões relacionadas, 14740.0522 ms: aplicação legada,
  reserva, adoção singular/conjunta, criação ativada e exclusão.
- **47 casos novos distintos** de aplicação. A rodada ampliada teve 40 passes
  de 41 e detectou caminho incorreto na fixture de proprietário recriado.
  O cenário corrigido passou isoladamente (1/1, 868.22 ms).
  Entre os 40 positivos, 50 fichas locais novas reais foram preparadas e
  aplicadas com uma cobrança, um clock e replay sem writes (50669.22 ms).
- **5/5**, 1948.4107 ms: aplicação ausente, marcador nulo/falso/objeto e ordem canônica
  de propriedades; um caso já pertencia à rodada anterior, quatro são novos.
- **3/3**, 1425.4858 ms: grant completo inclusive após abrir o batch,
  recibo legado após fence/revogação e timestamp global futuro. Dois novos
  casos, mais ampliação do cenário de grant já contado.

A primeira integração dos testes detectou hash JSON legado diferente do
canônico do preparo. O roteamento foi corrigido preservando ambos; a rodada
inicial de 23 passou antes da expansão. A fixture de recriação passou a usar
o helper canônico do namespace, sem alterar a proteção de produção.

**5 casos SDK distintos positivos**, Firestore 1.22.0 verificado por SHA,
demo/loopback, Java 256 MiB/dois CPUs e Node 384 MiB:

- **4/4**, 539691.1049 ms. Cinquenta mistos (dois locais, 48 globais,
  existentes/novos) aplicam com chamadas concorrentes e único débito.
  Cabeças, saldo, relógios, ticket, comprovante, evento e grupo têm o mesmo
  commit nativo; leitura lógica conserva bytes/campos não selecionados.
  Rules recusam leitura/escrita/exclusão direta dos comprovantes.
- Nesse conjunto, precondição nativa falha nas oito fronteiras de escrita:
  cabeça, clock local, global, clock global, crédito, ticket, recibo e pai.
  Todas revertem saldo/fontes/estado/criador antes de retry exato positivo.
- Também passam corrida aplicar/cancelar, BYOK com saldo zero sem mudar
  updateTime do usuário, confirmação fria expirada sem provedor, cleanup
  integral do livro e replay sem fonte/ticket, além de recusa do grupo recriado.
- **1/1**, 6198.1207 ms: caso adicional da revisão executado isoladamente;
  corrida aplicação legada/reserva tem um único vencedor, sem bypass ou débito
  parcial. Não foi repetido o conjunto nativo já verde.

Lint dirigido, arquitetura, sintaxe dos **243 módulos**, docs, formato e diff
positivos. Logs fora do Git. Nenhuma IA paga, compra, produção ou dados reais.

## Revisão, limites e pendências

Revisão conferiu transação única, provas de nascimento, ausência de reads após
writes, manifestos/CAS, bloqueio singular, preservação de recibos antigos e
cleanup. Metadata histórica não concede acesso à prosa atual. O grupo original
é exigido antes do caminho de replay, sem fabricar prova a partir dos membros.

Node cobriu 50 locais; SDK desta entrega cobriu 50 mistos. Não representam
benchmark de produção nem todas as combinações de formatos e limites no SDK.
A certificação integrada permanece no fechamento do bloco.

Sem UI/TS alterados, não repetimos Vitest, typecheck, build ou navegador.
Validate/cobertura integrais permanecem para o fechamento de P1, conforme
autorizado; não declaramos a V2 concluída. Cliente/endpoints de preparo e
recuperação, outros writers/consumidores, backup, ativação/rollout e demais
gates continuam necessários. Fases 3–5 e aceites humanos/comerciais abertos.
Somente commit local, sem CI, push, PR, merge ou deploy.

## Como conferir

Node: functions/test/loreAnalysisApplicationApply.test.mjs.
SDK: tests/firestore/loreAnalysisApplicationApply.rules.test.mjs, exigindo
emulador dedicado demo/loopback. Os seis arquivos de regressão Node usados
são loreAnalysis, loreAnalysisApplication, bookLoreEditAdoption,
bookLoreEditAdoptionBatch, bookLoreCreationAdoption e bookLoreDeletion.

Dev server permanece em http://127.0.0.1:5173/, sem expor UI de preparo ou
implantar estas Functions.
