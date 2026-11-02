# P1 / M27 — Chat, conversão e remoção com texto lógico

## Objetivo

Integrar corpos externos aos consumidores que ainda leem/escrevem content direto:
aceite de sugestão do chat legado e conversão explícita de capítulo para cenas.

## Requisitos e solução

- Chat mantém autoria/revogação/modo, segurança da prosa, provedor/modelo,
  idempotência e cobrança existentes. Hash de CAS usa texto lógico completo.
- Aplicação usa prepareLegacyChapterTextWrite com o conteúdo verificado na mesma
  transação; corpo, ponteiro, pins, ledger, crédito, mensagem paga e recibo juntos.
  OperationId interno é derivado para manter IDs públicos existentes do chat.
- Confirmação de recibo histórico preserva seu contrato; não reescreve texto ou
  debita novamente. A recuperação cliente existente conserva alterações posteriores.
- getSceneGroup devolve conteúdo/hash lógicos para capítulo legado, mantendo
  sourceVersion do documento nativo observado. Corpo indisponível nunca vira vazio.
- Conversão lê texto completo, conserva uma fonte inline autossuficiente sem
  ponteiro físico e a prosa congelada no capítulo, cria a cena e libera somente
  o pin do capítulo no mesmo commit. Versões anteriores conservam os seus pins.
- Preservar os orçamentos aprovados em F2-02 e chat: cena/resultado do chat até
  800.000 bytes e envelopes nativos existentes. Excesso recusa a operação inteira,
  mantendo legado integral para divisão explícita. Não reduzir formato de backup.
- Exclusão de agrupadores mistos libera o pin do capítulo externo uma única vez
  ao revogar o agrupador, preservando versões. Detalhe de agrupador em remoção
  continua disponível como metadados, sem tentar reabrir corpo já liberado.
- Campo congelado de capítulo composto também pode vir em corpo externo da
  preparação P1. Editor resolve somente a composição; backup hidrata o campo
  congelado completo, sem fallback nem perda. Não alterar o formato do arquivo.
- Não mudar contratos públicos, UI, Rules, transporte, dependências ou créditos.

## Tarefas e aceites

1. [x] Chat aplica ao texto lógico pelo escritor compartilhado, com débito atômico.
2. [x] Detalhe legado/conversão/remoção preservam texto e liberam somente seu pin.
3. [x] Testes dirigidos Node/SDK e compatibilidade cliente, revisão/documentação.
4. [x] Commit local com evidência; manter P1/F2-09 abertos.

## Suposições e riscos

Fonte congelada da conversão cabe no mesmo orçamento validado da cena; validar
todos os envelopes antes de gravar. Ao remover a referência externa, manter fonte
inline e conteúdo legado congelado, sem concatená-los à composição. Esse desenho
evita novas referências físicas em sceneSources e conserva os inventários M26.

Mantenha rejeição acima do orçamento explícita: converter não pode criar cena
vazia nem dividir automaticamente. A leitura/restauração do capítulo legado
grande continua intacta. Não ampliar quotas de cena/IA ou alterar o formato P1.

Continuam demais recursos/campos grandes, personas/mídia, autorização/ativação e
host/UI/roundtrip/validate integral. Implantação ainda exige ordem da ADR 0070;
nenhum deploy/CI/push. Suite completa só no fechamento do grande bloco P1.
