# Writer V2 — drenagem dos temporários de lore (D3 em andamento)

## Resultado

Antes de sair de Counts para personas, restauração com inventário de payload
varre até oito journals de chunks por operação, depois até oito de corpos.
Cada alvo deve manter journal/recibo/nascimento nativos originais. Retira somente
fragmentos, acumuladores, nós e controles privados conhecidos, com escopo/ID
conferidos e controles em done. Headers, partes finais e segmentos permanecem.

Duas varreduras adicionais paginadas de metadata física recusam qualquer
stageKind remanescente, inclusive desconhecido ou sem journal. Alvo ausente ou
recriado bloqueia a varredura pelo journal. A conclusão usa unidade posterior à
última página, preservando as regras transacionais de leitura antes de escrita.

Progresso opcional loreStaging guarda schema, etapa, cursor e contagem limitada
de observações; não guarda corpo ou catálogo. artifactCount continua monotônico.
retiredArtifacts soma pares alvo/journal descartados na drenagem bem-sucedida;
cleanedArtifacts continua zero em content-verified e soma só o cancelamento.
Saldo exige cleaned + retired <= criado e igualdade na conclusão de cancelamento.
Cursor, remoções, saldo, checkpoint e recibo são atômicos; retry usa cópia nova.

O protocolo opcional só é aceito em preparação >=4, inventário de payload e
cleanup >=8. Ao avançar de Counts, a drenagem deve estar done. Protocolos antigos
sem esses campos mantêm saldo original; recibos históricos não recriam temporários.
Não há endpoint, namespace, Rule, dependência ou índice de consulta novo.

## Evidência Node

**60 casos distintos positivos**, em quatro arquivos dirigidos: 22 Counts,
16 payloads anteriores, 12 de reconciliação e dez de drenagem.

Lote inicial 59/60. A asserção nova de replay após cancelamento esperava o
progresso antigo inteiro, mas a ABI existente devolve recibo histórico junto do
progresso atual. Corrigida somente a asserção para verificar essas duas partes,
sem mudar a implementação. Reexecutado só o caso afetado: 1/1 positivo.
Não é alegação de lote único verde de 60.

A drenagem confere no máximo 16 deletes por operação (oito pares), progresso e
saldo exatos, identidade/bytes/timestamps dos corpos finais preservados, leitura
lógica igual após descartar temporários, ausência da raiz, retomada por serviço
novo e replay histórico sem escrita após cancelamento. Cancelamento parcial e
posterior esvaziam o inventário com cleaned + retired == artifactCount.

Casos negativos cobrem alvo, journal e recibo recriados; alvo ausente; journal
ausente com alvo físico remanescente; tipo privado desconhecido estrangeiro;
rollback/retry e progresso inválido, não pareado ou com saldo excedido. Dados
incertos/estrangeiros permanecem preservados quando a conclusão é recusada.

A regressão grande de reconciliação passou com campo e descrição >8 MiB e até
três partes por transação de comparação. A instrumentação desse teste agora
isola a etapa scenes; a nova varredura de finish tem orçamento separado de oito
artefatos. O controle temporário é esperado ausente ao fim da drenagem.
Payloads monolíticos e versões v1–v6 mantiveram seus testes; o caso de inventário
até preparação v14/cancelamento também passou.

**2/2 SDK positivos**, zero skipped, 345392.9658 ms, Firestore Emulator 1.22.0
verificado em projeto demo isolado e loopback, Admin/serviços/Rules reais.

1. Fluxo positivo de geração/reconciliação ampliado até drenagem done/personas.
   Confere privados existentes e leituras SDK negadas para dono, outro e anônimo
   antes de retirá-los; depois confirma remoção dos controles, igualdade lógica
   dos dados e datas, raiz ausente e C1 recusado antes de ativação. Cancelamento
   posterior termina com saldo exato de retirados + limpos == criados.
2. Na fronteira real de drenagem, um temporário da próxima página é confirmado
   existente e apagado/recriado com o mesmo valor. AdvanceCounts e cleanup
   recusam a nova encarnação, preservando o documento e a raiz ausente.

Os dois casos independentes anteriores de cancelamento/recriação do controle
de geração não foram repetidos. Retry forçado foi testado no double Node,
não no SDK. Não comprova Auth/Callable/App Check de produção, piloto humano,
port geral de leitura preparada ou ativação.

## Limites

Este incremento drena temporários antes de personas; não ativa a raiz.
D3 ainda exige leitura preparada autorizada, recaptura/roundtrip e habilitação
coordenada de novas gerações. indexedLoreBodies continua false por padrão.
Plano 131/P1/F2-09/V2 continuam abertos, incluindo host, inventários gerais,
legados, drain/rollout, validate integral de P1, fases 3–5 e gates humanos/
comerciais. Preparar host/cliente para metadata opcional antes de habilitar.

A leitura lógica completa usada nos testes continua harness privado. Não é
prova de um port geral de leitura preparada ou de roundtrip do livro completo.
Sem nova fronteira de browser/UI: não repetidos Chromium, Vitest ou build.
Validate global permanece no fechamento de P1 conforme orientação.
Sem CI, push, PR, merge, deploy ou operação de produção.

Formato, lint dirigido, arquitetura, documentação e diff positivos. Segredos,
escopo e integridade dos arquivos conferidos antes do commit local.

## Arquivos e reprodução

- BookRestoreLoreStaging: varreduras, classificação dos privados e plano de deletes.
- BookRestoreCounts: segura finish até a conferência final.
- BookRestoreUploadContracts/Upload: progresso/saldo opcionais e replay monotônico.
- BookRestoreArtifacts: autenticação pelo journal nativo e saldo no cleanup.
- Testes Node de staging/reconciliação e SDK de geração/drenagem.
- Plano 131, ADR 0151 e documentação afetada.

Rodar functions/test/bookRestoreLoreStaging.test.mjs e os três arquivos de
regressão citados. SDK seleciona o fluxo positivo actual advanceLore e SDK lore
staging no arquivo bookRestoreLoreStream.rules.test.mjs em emulador demo isolado.
Runner/log externo QA com prefixo m38c12d3-staging; sem artefatos grandes no Git.
