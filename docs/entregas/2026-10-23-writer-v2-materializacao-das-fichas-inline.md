# Writer V2 — Materialização servidor das fichas inline

Data: 2026-10-23. Incremento interno P1 M38c3h,
[plano 85](../tasks/writer-v2/execucao/85-materializacao-das-fichas-inline.md)
e [ADR 0100](../decisions/0100-server-lore-inline-materialization.md).

## Implementado

O compositor prepara fontes inline sem reenviar texto pelo cliente. Campos
herdados e páginas compatíveis viram uploads privados, com valores literais,
ausências, duplicatas, ordem e datas preservados. Alterações/remoções do criador
prevalecem. O resultado é storage v2 sem base, auditado pelo compositor existente.

Cada filho recebe identidade derivada do pai/alvo e marcador privado no job/lease.
Início, parte/selo/reserva e recibo do pai compartilham transação nativa.
Outro fluxo não pode apropriar a reserva nem cancelar/avançar o filho isoladamente.
Slots materializados usam prova específica do início e reserva originais.

Cancelamento coordena também o filho ainda uploading/verifying/sealed, antes
de existir slot. Ele é limpo primeiro por unidades, sem contagem indevida;
depois seguem os slots e descritores. Revogação/deleting/ausência permitem
somente cleanup próprio. Recriações e livro com outra encarnação continuam
protegidos. Fences e provas não são apagados.

Fonte, clock e publicação ficam intactos. O contrato de recusa temporária de
inline foi substituído por teste positivo de suporte. Nenhum endpoint/UI/worker
ou cabeça ativa foi habilitado.

## Evidência Node

**134 testes Node distintos positivos**, em rodadas dirigidas:

- Upload/reserva: 83 testes, pass 83, fail 0, skipped 0,
  duration_ms 953.6736.
- Compositor/materialização: a rodada de 50 teve 49 positivos e uma falha de
  entrada do teste, que passava metadata extra à API fechada de get.
- Após corrigir somente essa fixture e usar uma parte de upload válida,
  o caso afetado passou: tests 1, pass 1, fail 0, skipped 0,
  duration_ms 210.0244.
- Um caso novo de reconciliação independente passou: tests 1, pass 1, fail 0,
  skipped 0, duration_ms 224.434.

A união é 45 upload + 38 reserva + 31 compositor + 20 inline; repetições
não aumentam a contagem. Não houve uma rodada única de todos os 134.

Casos inline cobrem todos os campos, ausência/remoção/substituição, relações
e diff, JSON escapado acima de 16 partes, cancelamento antes da reserva em
quatro estágios após ausência/owner/deleting, fence privado, tentativa de
apropriação por outro pai, recriação de filho/lease/provas, rollback do
início/append/reserva, abertura clonada/outra transação e replay após cancelamento.
Reconciliação de filho não reservado limpo por outra chamada não reconta o pai.

## Evidência SDK

Firestore 1.22.0 com SHA verificado, loopback e projeto demo dedicados:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 102987.239
```

1. Texto com controles escapados expande além de 16 partes e produz geração
   ready privada, com páginas/valores literais, origem nativa intacta, slots e
   leases materializados. Cancelamento limpa sete reservas.
2. Falha no write do pai reverte append, estado do filho e lease; retry funciona.
   Após excluir o livro, avanço novo é recusado e cleanup remove o filho não
   reservado, sem contá-lo entre as duas reservas anteriores.
3. Filho ou lease recriados não retomam a materialização original.

Denies esperados usam assertFails. Sem dados de produção, PDF real, compras ou IA.

## Checks e revisão

Lint dirigido, arquitetura e sintaxe dos 196 módulos de Functions passaram.
Formatação, links da documentação e diff final conferidos antes do commit.
Sem cliente/visual alterado, não repetimos tipos/Vitest/build/navegador.
Validate/coverage integrais permanecem no fechamento de P1.

Nenhuma dependência, endpoint público ou Rule nova: namespaces existentes já
negam o acesso SDK. Commit local somente; sem push/PR/CI remota/deploy.
Master original preservada.

## Próxima sequência

O núcleo de composição cobre fontes inline e payload v1/v2. Adoção CAS de
cabeça/leases/clock/privacidade/recibo ainda não existe. Integração de exclusão
do livro/lore e demais writers/consumidores/backup/cliente continua obrigatória.

Campos grandes restantes, certificação/ativação, capa/personas e host/UI/
roundtrip/validate também seguem pendentes. Raiz restaurada continua ausente.
P1/F2-09 e Writer V2 permanecem em andamento.
