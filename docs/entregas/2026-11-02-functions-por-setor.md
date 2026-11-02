# Functions por setor

## Escopo implementado

O mantenedor aprovou a simplificação e dispensou compatibilidade por ser um
protótipo sem usuários ativos. As 306 ações individuais foram agrupadas em 16
callables. Streaming, HTTP, eventos e agendamentos continuam separados: 30
Functions planejadas para o estado final, contra 320 no release anterior.

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

Não foi repetida a suíte completa nem aguardada a CI, conforme a orientação de
publicar com validação funcional manual. As falhas de CI do release anterior e
suas correções locais pendentes permanecem separadas deste escopo.

## Operação

Consultar a [ADR 0270](../decisions/0270-functions-by-sector.md) e o
[inventário final](../infrastructure/functions-inventory.json) para perfis,
destinos, retirada dos endpoints e rollback.
