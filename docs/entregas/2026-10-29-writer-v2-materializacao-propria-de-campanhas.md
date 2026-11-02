# Writer V2 — Materialização dos dados próprios de campanhas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base 3c1cefa.
- Plano: [233](../tasks/writer-v2/execucao/233-materializacao-dos-dados-proprios.md).
- Decisão: [ADR 0263](../decisions/0263-campaign-own-materialization.md).
- Estado: núcleo interno validado por checks dirigidos; ativação/UI pendentes.

## Implementado

Notas, sessões, checklist, pistas/missões, corpos, referências e vínculos são
preparados nos caminhos ordinários da nova mesa. Texto, datas, estados e ordens
são preservados; IDs e pais são remapeados por conta/restauração/domínio.
Controles globais e por sessão são reconstruídos, com revisões e nextOrder
utilizáveis pelos serviços existentes. A raiz permanece privada e indisponível.

Framing limita cada chamada; no máximo um DTO concluído, até 4 MiB, sem texto
de notas no checkpoint de 32 KiB. Journal mínimo e alvos têm prova do mesmo
commit nativo. Auditoria/coleta usam metadata, sem ler prosa. Cancelamento
retira estado cifrado/chave antes de coletar alvos, índices e chunks, com
barreiras para órfãos, alterações e recriações.

Não há callable, interface, nova dependência ou autorização de derivados.
Referências preservam ponteiros; acesso ao material depende da etapa futura.

## Validação observada

258/258 testes dirigidos positivos, zero falhas/skips/cancelamentos, em
99.949,3556 ms (m156-directed.log): 19 novos e 239 regressões das famílias de
restauração, incluindo leitores de bases/sessões restauradas. Os 19 novos
também passaram isoladamente em 29.567,3126 ms (m156-own-final.log).

Cobertura nova: dados ricos/vazios, pausa por frame/novo serviço, leitores e
mutações ordinários, DTO escapado acima de 2 MiB, duas restaurações na mesma
conta, limpeza sem prosa, cinco pontos de rollback, CAS/replay, cancelamento
com leitura pendente, revogação durante I/O, alvo/journal recriados ou
alterados/estrangeiros, órfãos e entradas inválidas/conta/C4.

SDK/Rules: 1/1 cenário positivo em 73.334,0374 ms (m156-sdk.log).
Campanha independente nativa com nota, sessão, pista, vínculo e checklist foi
emitida, enviada e materializada. Nascimentos de journal/alvo iguais, CAS,
retomada, remapeamento e nextOrder foram conferidos. SDK negou raiz, filho e
journal pendentes; chave emissora revogada recusou prova; cancel/coleta
retiraram alvos/journals/chave e preservaram origem e recibo histórico.
Emulador demo/JAR verificado em porta efêmera, encerrado pelo próprio runner.

ESLint dirigido aos dez arquivos de código, sintaxe de 475 módulos Functions,
arquitetura, formato/documentação/diff e scan de segredos positivos.
Sem build ou interface repetidos: não houve mudança de frontend.
Conforme política do operador, validate integral fica para o fechamento do
próximo bloco de materialização/ativação. Os 9.871 testes de 3c1cefa são
baseline 227–232 e não são atribuídos ao código novo.

## Correções e revisão

Os primeiros testes encontraram uma chamada de coleta passando snapshot em
vez de DocumentReference: corrigida, com cancel/coleta novamente positivos.
Fixtures foram ajustadas para respeitar o CAS da sessão, a revisão do item no
vínculo, a forma do retorno público e IDs de operação únicos entre restaurações.
Nenhuma regra ou limite de produção foi relaxado. Rodada final dirigida verde.

Revisão manual cobriu todos os módulos novos/diffs, limites de leitura/escrita,
escopo de IDs, atomicidade e retirada da chave. Journal/coleta foram integrados
antes da composição do produtor. Não houve achado restante bloqueador.
Arquivos principais: formatos/inventário, journal próprio, coordenador,
contratos/store/cleanup/transfer e testes Node/helper/SDK próximos.

## Limites e continuação

A liberação usada para provar leitores ordinários existe somente na fixture
Node; ativação produtiva não foi implementada. Auditoria atual verifica alvos
registrados, não certifica por inferência toda a campanha ativa.
Ainda faltam base/lore/derivados/mídia, universo autorizado, integração C4 dos
temporários, auditoria física/ativação e Estúdio/ciclos.
Macro 8/35 (22,9%) e P3/D/F2-09 permanecem abertos.
Master e servidor manual preservados; somente commit local.
Sem agentes/CI/push/PR/merge/deploy.
