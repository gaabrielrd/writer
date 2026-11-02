# P1 / M38c5c — Transporte autenticado da edição preparada

## Objetivo

Ligar o coordenador M38c5b aos serviços existentes por callable privada,
com operações fechadas, conta capturada e argumentos literais preservados.
Sem ativar a interface ou implantar Functions/Rules nesta etapa.

## Requisitos e sequência

1. Contrato puro enumera somente inspeção, campo e edição manuais existentes,
   incluindo get metadata para reconciliação. Não aceitar nomes arbitrários,
   métodos internos, criação ou IDs reservados de análise. Validar também
   referências de filhos antes de encaminhar; UID vem da autenticação.
2. Serviço roteia envelope fechado method/input à factory correspondente,
   preservando pedido/CAS/bytes. Serviços nativos continuam validando domínio,
   autorização, provas, recibos e cleanup após revogação. Não inventar grants
   ou transação agregada; uma unidade continua sendo uma unidade.
3. Exportar callable regional pelo entry existente: App Check obrigatório,
   política private/no-store, erros públicos existentes e sem segredo/provedor.
   Rota antecipada evita instanciar serviços alheios ao executar uma unidade.
4. Sessão cliente captura objeto de conta e contexto. Prepare força UID capturado,
   combina guards e passa signal/yieldControl ao coordenador. SDK regional
   envia envelope, confere guard antes/depois de I/O e não faz fallback.
5. Testes Node: envelope/operações fechadas, ausência de auth, isolamento de UID,
   prefixos/filhos reservados/criação, metadata/fences e erros/headers HTTP reais.
   Entry deve recusar App Check ausente/inválido antes do serviço.
6. Testes Vitest: adapter SDK, mudança de conta/contexto antes/depois de I/O,
   erro/retry idêntico, no-op e UID forçado; executar o coordenador existente
   por todo o roteamento novo, preservando suas jornadas concorrentes.
7. Checks dirigidos, revisão, ADR/evidência/documentação e commit local.
   Validate integral no fechamento de P1; sem CI/push/PR/merge/deploy.

## Arquivos previstos e critérios

Novo contrato/serviço de transporte em functions/src, registro em index.mjs,
testes Node/HTTP; sessão e testes na feature lore, exportação pública e
integração dos testes do coordenador. Sem dependências, Storage ou Rules novos.

Aceite: request chega ao serviço correto com bytes/CAS idênticos; só UID
autenticado governa acesso, nenhum método/propriedade herdada é despachado,
jobs de análise/criação não são expostos e metadata permanece privada.
Troca de conta/contexto invalida resposta, sem apagar a pendência do coordenador.
Ready não adota; cancelamento continua independente e autorização nativa decide
corridas. Falha não ativa escritor SDK legado.

## Riscos, suposições e portões

O protocolo manual usa IDs lore-source/field/edit-<hash> de M38c5b; o endpoint
não é uma interface genérica aos jobs internos. A autenticação real depende
da implantação e configuração App Check; testes locais devem distinguir
rejeição real do middleware e serviços reais sobre double.

Escritores/consumidores/backup/ativação e rollout conjunto ainda precisam
ser integrados antes de habilitar o produto. Host visual e recuperação
protegida após recarga seguem obrigatórios. Não há autorização de deploy.
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais permanecem abertos.

## Resultado do incremento

Transporte implementado pela callable bookLoreEdit com 18 operações manuais
fechadas e UID autenticado; sessão SDK regional captura conta/contexto e
preserva pedidos do coordenador. IDs/referências reservados e criação negados.

59 Vitest distintos positivos, 17 Node distintos em rodadas e três smokes
Chromium com SDK/HTTP reais sobre double. Tipos/lint/build/arquitetura e
sintaxe dos 245 módulos positivos; docs/revisão no fechamento. Veja
[ADR 0116](../../../decisions/0116-authenticated-manual-lore-edit-transport.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-transporte-autenticado-da-edicao-de-lore.md).

Sucesso com tokens reais, host visual/recuperação e integrações restantes
seguem pendentes. Sem implantação; validate integral no fim de P1.
P1/F2-09/V2 e condições humanas/comerciais permanecem abertos.
