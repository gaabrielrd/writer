# Preparação da exclusão permanente de aventuras

- **Data**: 2026-10-28.
- **Branch**: codex/writer-v2; base 7d5bd93.
- **Plano aberto**: [199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md).
- **Decisão**: [ADR 0221](../decisions/0221-adventure-deletion-reservation-and-source.md).

## Avanço implementado

Guard próprio de reserva permanente com máscara e validação fechada. Criadores
e consumidores de aventura recusam a origem reservada mesmo quando sua raiz
permanece ou reaparece. Inclui catálogo do Estúdio, cena/jobs, narrativa,
progresso/histórico/blocos, lore, backup, contexto de IA, captura/base/comparação
de campanha, importação, restauração e finalização de mídia.

Recibos históricos continuam metadados; não recriam raiz, chaves ou mídia.
A reserva bloqueia ACK de mídia depois de I/O pendente. Notas próprias da
campanha permanecem acessíveis. Retomada não perde outros projetos por conter
aventura reservada. O chat oculta respostas derivadas sem ler o corpo e
conserva a pergunta própria. Contextos internos de histórico do chat/aplicação
passam a fornecer db explicitamente.

Fonte interna de confirmação com título/revisão e tokens da identidade nativa
da raiz/progresso; precisão de nanossegundos, recusa de inconsistência e nenhuma
mutação. Ainda sem export público. Rules fecham catálogo direto de raízes e
revalidam reserva/owner/deleting para get/filhos; o cliente já usa catálogo
no servidor.

## Validações dirigidas

- **42/42 Node novos**: 31 guard/consumidores e 11 fonte nativa;
  última rodada 4668,2834 ms.
- **390/390 Node**, 35 arquivos de campanha/chat/importação e os contratos novos,
  10908,0347 ms. Inclui 40 dos 42 acima; não somar como casos distintos.
- **355/355 Node**, 24 arquivos de restauração, 105923,5158 ms.
- **77/77 Node** de autoria/retomada/cenas/narrativa, 4866,349 ms;
  há sobreposição com guard e regressões anteriores.
- **37 cenários SDK/Rules distintos em cinco arquivos**: 32 anteriores passaram
  na rodada conjunta; os cinco novos passaram no reteste de 9757,7854 ms.
  Admin/SDK/Rules reais no emulador Firestore 1.22.0, localhost e projetos demo.
  Auth do ambiente de regras é sintético; nenhuma credencial/dado real usado.
- Guard/âncora/contexto/Estúdio (73), famílias de backup/blocos/histórico/progresso
  (433) e aplicação do chat (16) passaram na primeira etapa; sobrepõem rodadas.
- **5/5 Vitest integrados**, 18,73 s (13,63 s de testes): ciclo normal,
  edição/histórico/contexto, recaptura/restauração, legado/órfão e acesso externo.
- Lint/Prettier do escopo, tipos, arquitetura/docs/styleguide/skills e
  sintaxe de **395 módulos Functions** passaram. Bundle de **3103 módulos**,
  3,19 s, e smoke passaram; build conserva avisos de tamanho/imports dinâmicos.
- Diff final revisado; 38 arquivos sem .env, segredos identificados, binários
  ou arquivos acima de 2 MiB. Hashes do código conferidos antes/depois dos hooks.

As duas falhas iniciais de regressão foram expectativas de DTO/máscara de teste;
foram corrigidas e a rodada de 83 passou. Na prova de carimbo nativo SDK, um
set idêntico não alterou updateTime no emulador: a fixture passou a mudar sinopse
sem mudar revisão/título; o teste passou. Falhas não foram contadas como passes.

## Pendências e limites

Esta é preparação parcial, **não entrega da exclusão completa**. Não existe
produtor público de reserva, início/job de exclusão, limpeza por famílias,
resolução de início incerto nem interface de confirmação/retomada. A reserva
dos testes é inserida apenas em fixtures. O job ainda precisa encerrar Storage,
usos/controles, universo e atividade, preservando cópias independentes.

Nenhuma mudança de interface neste avanço; não se repetiu QA visual. O validate
integral será executado ao fechar o grande bloco 198–exclusão, conforme orientação
do operador. A base integral fe49e9f não valida o código novo. P2/P3/D/F2-09,
gates humanos/comerciais e macro 8/35 permanecem abertos.

Somente commit local: sem CI, push/PR, merge ou deploy. Servidor Vite preservado
em 127.0.0.1:5173. Uso com conta real continua dependendo dos endpoints/Rules
implantados; este avanço não altera o ambiente remoto.
