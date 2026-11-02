# ADR 0158 — preparação do cliente em unidades retomáveis

## Estado e contexto

Aceita em 2026-10-25.
[Plano 137](../tasks/writer-v2/execucao/137-preparacao-retomavel-no-cliente.md).
O host já expõe comandos com checkpoints/recibos; falta um cliente que não
transforme uma resposta perdida em outra operação ou ativação automática.

## Decisão

Criar sequenciador público em book-portability. Cada step consulta o progresso
atual e executa no máximo uma unidade, ou para sem mutação. Projeção validada
contém somente identidade exata, estado, checkpoint, fase/schema, estado da
reserva de capa e completude dos índices, sem prosa ou catálogo.

Mapear schemas/fases conhecidos explicitamente. Integridade usa limite fixo 16.
resources-finalize com índices completos escolhe auditoria; a migração de índices
não pode ser executada novamente depois de completa. activation-ready para em
review-required, sem chamar ativação. Upload incompleto, rejeição, cancelamento
e activated também param.

Port de journal exige leitura e CAS estrutural atômico da intenção completa,
incluindo identidade, ação, operationId, checkpoint e limite fixo. Persistir por
CAS antes do envio. Dívida existente é reenviada exatamente, antes de nova
consulta/seleção. Limpar apenas por confirmação com recibo/action/operação/
checkpoint próprios e identidade atual, usando CAS da mesma intenção.
Progresso atual posterior ao recibo é permitido; não dispara outro passo.

Check obrigatório de conta/vida útil antes e depois de awaits. Invalidação antes
da confirmação conserva dívida; depois de limpar uma confirmação própria, impede
sua entrega à UI, sem desfazer o reconhecimento já feito. Instância recusa chamadas
simultâneas; CAS protege instâncias/abas. Erros não geram loops ou descartes.

Adaptador usa nomes fixos dos 17 comandos preparatórios e getBookRestore,
adiando Firebase até a chamada. Não importa contratos Node no navegador.

## Limites e consequências

Journal nesta etapa é um contrato injetado, exercitado em memória. Ainda não há
adaptador cifrado/durável, retomada comprovada após recarga, upload inicial,
revisão/ativação/mídia/limpeza do cliente ou UI. Comportamento depende de o
adaptador honrar CAS completo; operationId isolado não basta.

Dívida rejeitada permanece para reconciliação posterior explícita. Um conflito
não autoriza trocar seu checkpoint ou selecionar automaticamente outra operação.
Não é roundtrip integral nem rollout. Padrão indexado continua false.
[Evidência](../entregas/2026-10-25-writer-v2-preparacao-retomavel-no-cliente.md).
