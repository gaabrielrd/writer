# Functions por setor

## Escopo implementado

O mantenedor aprovou a simplificação e dispensou compatibilidade por ser um
protótipo sem usuários ativos. As 306 ações individuais foram agrupadas em 16
callables. Streaming, HTTP, eventos e agendamentos continuam separados: 30
Functions confirmadas no estado final, contra 320 no release anterior.

- Registro explícito e fechado de ações, versões e perfis operacionais.
- Composição lazy dos serviços por setor, preservando os contratos existentes.
- Transporte central configurado no boot, com migração dos 42 clientes estáticos
  e lazy, sem fallback ou repetição automática de uma mutação incerta.
- Isolamento dos três perfis de 540 segundos e dos setores com segredo de IA.
- Logs de setor/ação/resultado/duração sem texto privado.
- Inventário reproduzível, ADR 0270 e regras de arquitetura atualizadas.

## Validação direcionada

- Novos contratos backend: 306 ações, isolamento entre setores, DTO fechado,
  idempotência real, histórico, falhas incertas e observabilidade.
- SDK real: 30 exportações, perfis/segredos e middleware HTTP; composição de
  progresso, campanhas, aventuras e biblioteca com Firestore sintético.
- Clientes: tabela de 306 ações, payload/timeouts, streaming/AbortSignal,
  resposta incerta, nomes não registrados e configuração real no boot.
- 141 de 143 casos de host existentes passaram na primeira rodada. Os dois
  ajustes de cabeçalhos finais passaram ao repetir somente os casos alterados.
- 53 de 54 casos de cliente passaram na primeira rodada. O único ajuste de
  aridade do SDK passou ao repetir somente esse caso.
- Casos alterados posteriormente foram repetidos individualmente; resultados
  finais de build/lint e publicação serão acrescentados após a conferência.

A publicação não aguardou a CI, preservando a validação funcional manual do
mantenedor. O pre-push obrigatório iniciou uma validação local completa. A
primeira tentativa foi interrompida por `Denied ID` do worker PDF: a junction de
dependências apontava para fora do checkout isolado. A instalação local corrigiu
o ambiente, e os 26 casos do arquivo afetado passaram. A execução completa do
pre-push terminou com 381 arquivos e 5.150 testes aprovados em 688,67 segundos;
a branch foi publicada sem contornar os hooks. As falhas de CI anteriores e as correções locais
pendentes permanecem separadas deste escopo.

## Operação

Consultar a [ADR 0270](../decisions/0270-functions-by-sector.md) e o
[inventário final](../infrastructure/functions-inventory.json) para perfis,
destinos, retirada dos endpoints e rollback.

## Publicação verificada em 2026-11-02

- Commit do código publicado: `8f104f554e31f196fd05ac1d3eb53e575c01d887`.
- Os 16 setores foram criados em dois lotes de oito; os 14 recursos de
  streaming, HTTP, eventos e agendamentos foram preservados.
- Hosting publicado e marcador remoto confirmado com esse commit.
- Os 16 endpoints reais recusaram POST sem autenticação com HTTP 401.
- Os 306 endpoints individuais foram retirados em lotes de até 45, respeitando
  a quota de mutações. A remoção terminou às 16:38, horário de São Paulo.
- Inventário remoto final: exatamente 30 Functions ACTIVE, todas Node 24,
  sem endpoints antigos restantes. Redução de 290 recursos, aproximadamente 90,6%.
- Nenhuma alteração de dados, regras Firestore/Storage ou índices foi necessária.
- As alterações paralelas de layout e os testes pendentes do release anterior
  ficaram fora do commit e do artefato; a publicação usou checkout isolado.

O build isolado, typecheck, lint e links da documentação passaram. O inventário
e os contratos verificam os 306 destinos e seus serviços reais. Não há medição
de economia financeira ou de latência sob tráfego real neste protótipo.
