# ADR 0270: Functions por setor

Status: aceita em 2026-11-02.

## Contexto

O release anterior tinha 320 Functions: 308 callable, quatro HTTP, cinco eventos e
três agendadas. O produto está em protótipo, sem usuários ativos. O mantenedor
autorizou explicitamente retirar a compatibilidade com os endpoints individuais.

## Decisão

Publicar 16 endpoints callable por setor e manter dois chats com streaming,
quatro HTTP e os oito eventos/agendamentos: 30 recursos no total. As 306 ações
individuais passam a usar `{ version: 1, action, payload }`. O registro imutável
`functions/src/functionDomains.mjs` define a relação ação/setor/método e o perfil
operacional. Não há acesso arbitrário a propriedades nem aliases implantados.

Os setores são livros, lore, planejamento, trabalho, aventuras, campanhas,
sincronização de campanhas, mídia, geração, análise de lore, portabilidade de
livros/aventuras, validações longas de cada restauração e importação/análise de
universos. As operações longas mantêm 540 segundos e ficam separadas das de
120 segundos. Apenas geração, análise de lore e análise de importação recebem
o segredo do provedor. Todos mantêm App Check e autenticação obrigatórios.

Cada setor compõe somente seus serviços, de forma lazy. Os serviços existentes
continuam responsáveis por autorização, validação, transações, recibos, créditos
e recuperação. Não há alteração de esquema ou regras de dados. As rotas HTTP
de recuperação e seus rewrites permanecem independentes.

`app/configureFunctionRouting.ts` injeta a matriz no adaptador neutro
`shared/api/domainCallable` antes de montar as features. Todos os clientes,
inclusive importações lazy de portabilidade, usam esse adaptador. Opções de
timeout e respostas são preservadas; os chats mantêm streaming e AbortSignal.
O adaptador nunca tenta um endpoint antigo ou repete uma mutação após erro.

Logs por setor/ação registram resultado e duração, sem payload ou texto privado.
Falha de logging não converte uma mutação aceita em erro aparente.

## Publicação e rollback

1. Congelar a matriz, gerar o inventário e validar os contratos afetados.
2. Criar os 16 endpoints novos e confirmar ACTIVE/Node 24.
3. Publicar o cliente e conferir o marcador da release.
4. Remover explicitamente os 306 endpoints antigos, respeitando quotas.
5. Conferir as 30 Functions restantes e o estado dos recursos preservados.

A dispensa de compatibilidade permite a retirada no mesmo rollout. Recarregar
abas antigas após a atualização. Se houver falha, republicar código e frontend
do commit anterior; recuperar os endpoints antigos exige recriá-los e não é um
rollback instantâneo. O inventário anterior permanece versionado.

## Evidência e consequências

- [Inventário anterior](../infrastructure/functions-before.json).
- [Matriz final, consumidores e serviços](../infrastructure/functions-inventory.json).
- Regenerar a matriz documental com `node scripts/inventory-functions.mjs`.
- Redução de 320 para 30 recursos, aproximadamente 90,6%.
- Ações do mesmo setor compartilham capacidade; usar métricas por ação para
  avaliar contenção. Menos Functions não implica economia proporcional na fatura.
- Os gatilhos e agendamentos não são consolidados nesta mudança.
