# P2 — efeitos retomáveis da restauração de aventuras

Base: a2f7a16. Sem subagentes, CI, push ou deploy.

## Objetivo e descoberta

O backend já implementa revisão/ativação e sidecars de mídia/coleta. O cliente
só cobre início/upload/preparação. Cancelamento e primeira coleta removem a
chave; portanto esses efeitos precisam de metadata local própria, sem depender
do journal cifrado de preparação. Resolver operação retorna kind unresolved
(não unknown); mídia e coleta usam checkpoints próprios, não revision de livro.

## Requisitos e proposta

- Identidade própria de cinco campos, sem keyId; registro fechado com stamp,
  ação explícita, operação/checkpoint e reviewToken somente para ativação.
  Nenhum título, texto, arquivo, chave, URL ou grant no registro.
- IndexedDB writer.adventure-restore.effects por conta/restoreId; codec/CAS
  inteiro reaproveita serviço neutro da própria feature. Falha preserva registro.
- Cinco intents: ativação, cancelamento, cleanup pré-ativação, avanço de mídia
  e coleta pós-ativação. Input/fingerprint próprios; cleanup usa limit 16.
- Dez métodos finais no helper SDK completam os 29 métodos públicos do servidor.
  Conta/guard/inputs capturados antes de await; extras recusados antes do SDK.
- Leitores fechados para revisão, status de mídia e coleta; bind ao contexto
  quando a resposta o inclui. Projetar somente campos necessários à UI.
- Sessão pausa para revisão; só activate(review) ativa. Copiar revisão antes
  de awaits, exigir checkpoint e biblioteca da auditoria final.
- Persistir antes da mutação. ACK incerto repete pedido original em nova sessão;
  recibos/estado/contadores são conferidos antes de limpar por CAS.
- Review mudou: retire o pedido original somente após erro explícito do servidor;
  não aposentar por timeout. Resposta perdida da retirada retoma mesmo ID.
- Resolver ativação/cancel/cleanup pelo fingerprint original; unresolved com
  mesmo checkpoint preserva. Checkpoint maior prova pedido ultrapassado.
- Mídia/coleta reexecutam operação original para confirmar recibo. Conflito
  explícito mais avanço monotônico confirma ultrapassagem; conclusão admite
  already-complete nativo, sem inventar recibo próprio.
- Uma unidade por advance; nunca reativar, religar heads ou alterar job congelado.
  Cancelar aventura ativada é recusado. Grant atual não decorre de recibo antigo.

## Arquivos e sequência

1. EffectContracts/FinalizationViews/EffectStore próprios.
2. EffectCallables, allowlist comum e exports.
3. EffectSession com revisão explícita, replay e reconciliação.
4. Testes com serviços backend reais e banco de teste nativo, cobrindo perda
   de resposta, retirada, conflito entre sessões, CAS/conta e contratos SDK.
5. Checks dirigidos, cenário Chromium com IndexedDB real, revisão/docs/evidência
   e commit local. Validate integral no fechamento do próximo grande bloco,
   conforme processo vigente; não atribuir o validate de 194 a código novo.

## Riscos e suposições

O suporte local depende de IndexedDB/WebCrypto/Web Locks já exigidos. Não há
mudança de política de produto. A versão do cliente usa contratos locais do
servidor; não se presume implantação. Casos de conta desautorizada, recibo
malformado ou armazenamento sem resposta conservam a pendência. Sessões
concorrentes são arbitradas por CAS e checkpoints do servidor.

## Aceites

- [x] Cinco intents e dez transportes próprios, sem persistência de conteúdo.
- [x] Revisão explícita e replay/retirada confirmados sem duplicar ativação.
- [x] Cancelamento/mídia/coleta retomam após perda de resposta/chave.
- [x] Conflitos/CAS/conta preservam operações que ainda podem produzir efeito.
- [x] Testes dirigidos, Chromium, checks, revisão, documentação e commit local.

Não escopo: UI de inspeção/revisão e roundtrip completo no Estúdio, P3/D,
lançamento/gates humanos/comerciais. Macro 8/35 permanece inalterada.

## Resultado

136 casos dirigidos em cinco arquivos e 13 verificações no Chromium, com
persistência real no IndexedDB e serviços reais sobre banco/Storage de teste.
Tipos/lint/arquitetura/build/smoke positivos. A
[evidência](../../../entregas/2026-10-28-writer-v2-efeitos-retomaveis-de-aventuras.md)
distingue essas provas do SDK com mocks e registra limites. Validate integral
no próximo grande bloco; sem interface nova, CI ou implantação.
