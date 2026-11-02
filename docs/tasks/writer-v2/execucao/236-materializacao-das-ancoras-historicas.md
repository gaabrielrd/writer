# P3 — Materialização das âncoras históricas de lore

- Data: 2026-10-29.
- Base: f10605c.
- Estado: núcleo interno implementado e validado com checks dirigidos/SDK; sem ativação.

## Objetivo e requisitos

Materializar bases históricas apontadas pelas variantes restauradas, com texto
congelado e procedência original, sem recapturar conteúdo atual. Reutilizar
restoredAnchorBaseId e a decisão de remapeamento do incremento 235.
Âncora equivalente já presente na base ativa não cria cópia nem lê prosa.

Preservar resumo/detalhes/campos estruturados, campos vazios, UTF-8 legado,
relações portáteis e referência de imagem remapeada. Cada nova base histórica
contém a ficha e seus corpos próprios; snapshot/capturedAt/universo/testemunhas
são os da âncora, nunca os da base ativa atual. Continuidade de acesso depende
das mesmas origens históricas e da base ativa, antes dos bytes e na escrita.

## Solução e arquivos

Acrescentar anchorSlots/ORDINAL no job: inventário mínimo imutável com
anchorKey/sourceKey/linha, dono/encarnação/operação, ligado ao mesmo nascimento
e efeito de recibo. Registrar slot após conferir vazio do destino e antes de
criar filhos. anchorWrites usa o journal nativo com binding fechado ao slot;
caminho é derivado no servidor, sem aceitar caminhos do cliente.

Estender o journal compartilhado somente para receber binding na resolução de
root e expor conferência de vazio por binding. Preservar wire e comportamento
de own/base/variant. Wrapper específico coleta múltiplas bases por slots:
corpos/item antes do pai, pai preservado com filho estrangeiro; slots somente
depois do vazio físico, antes dos índices. Coleta sem prosa/chave/grant.

Coordenador exige próprios/base/variantes prontos e usa índice derivado
autenticado, locators e codec incremental de campos já existente. Conferir que
a variante/âncora foi efetivamente escrita pelo journal nativo de variantes;
não criar base para omissão anterior. Estado cifrado pequeno sem acumular texto;
uma leitura de DTO/frame por chamada, contagens e no máximo um item pendente.
Criar item após campos, pai preparing após item. Auditoria registrada por
journal revalida slot e origem; não é auditoria física final.

Arquivos: journal nativo, formato/slots/writes/origens/coordenador de âncoras,
contratos/store/cleanup/transfer, testes próximos Node/SDK e documentação.

## Sequência e aceite

1. Formato opcional do job e slots/journals com inventário/cancel/coleta
   integrados antes do produtor. Compatibilidade dos journals existentes.
2. Produtor de bases históricas completo, bytes/hash/contagens e evidência
   histórica; reutilização ativa sem duplicação. Reautorizar antes de I/O e
   na transação de escrita; CAS/replay/rollback; cancel com I/O pendente.
3. Leitores ordinários exercitados após liberação somente de fixture, inclusive
   fonte removida/recriada e variante legada. Testar vazio/campos longos,
   revogações antes/depois de bytes, slots/filhos estrangeiros/substituídos e
   coleta após revogação. SDK demo para vínculo/nascimento/Rules/coleta reais.
4. Revisar, ADR/AGENTS/arquitetura/inventário/progresso/evidência e commit local.
   Somente testes dirigidos; validate integral no fechamento do bloco.

## Limites, suposições e riscos

Não ativar campanha/bases/geração nem criar controle/ponte ativa. Mídia/binários/
pins, universo organizacional autorizado, C4 dos temporários, auditoria física,
ativação/aposentadoria dos journals e Estúdio/ciclos permanecem.
Layouts C4 1–4 intactos. Nenhuma dependência nova.

Slots sobrevivem à chave e são inventário de ownership, não autorização de
leitura. Pai estrangeiro/orfandade/recriação impede avanço/coleta, sem apagar
recursos de outra encarnação. Texto/hash/quotas não podem ser truncados,
enfraquecidos ou substituídos por conteúdo vivo.

## Resultado observado

Bases históricas/fichas/campos, slots prévios, journals/auditoria/coleta e
reutilização ativa implementados. 319 casos Node distintos positivos em rodadas:
317 antes do ajuste de retomada; família afetada com 22 positivos após correção,
mais um caso isolado de prova corrente estrita. Uma jornada SDK/Rules positiva
após a correção nativa. Arquitetura/sintaxe/lint/formato/docs/diff/segredos positivos.
[Evidência](../../../entregas/2026-10-29-writer-v2-materializacao-das-ancoras-historicas.md).

A retomada separa identidade estável da edição/origem de timestamps correntes
de acesso, mantendo reautorização e prova estrita antes/depois de I/O.
Sem ativação; mídia/pins/universo organizacional, C4 dos temporários, auditoria
física/ativação e Estúdio/ciclos continuam. Macro 8/35; validate integral no
fechamento do bloco, somente commit local.
