# P1 / M38b2 — Migração dos prefixos inline de lore

## Objetivo e requisitos

Permitir avanço de um job anterior com prefixo de relações já gravado, quando o
lore completo precisa de payload. Preservar todos os recibos, a contagem total e
o texto de origem. Não apagar prefixo antes de certificar a substituição.

## Plano

1. Reproduzir o escritor anterior em fixture, com fonte realmente validada e
   uma transação nativa que crie lore/journal/recibo/cursor juntos. Sem fabricar
   createTime/updateTime nem remover campos de documentos depois para simular
   uma criação antiga. Identificar a versão de protocolo reproduzida.
2. Na entrada da migração, autenticar prefixo por journal/recibos, conferir base
   e tamanho do prefixo contra a posição do job. Capturar identidade nativa.
3. Guardar no progresso a quantidade já contabilizada e identidade do prefixo.
   Percorrer novamente relações desde zero, produzindo a nova representação
   inteira. Incrementar loreRelationCount somente além do prefixo já contado.
4. Manter artifactCount e loreRelationCount monotônicos para resolver recibos
   antigos durante toda a migração. O cursor de leitura física é separado do
   total já contabilizado; nada de subtrair e somar de novo.
5. Somente ao fechar os payloads, reconferir a identidade do prefixo e substituir
   o lore com replace autenticado, conservando createdByOperationId do journal.
   Retomar após reload/retry; novos artefatos e cancelamento usam a capacidade v1.
6. Testar prefixos de 64 e várias páginas, fronteira da última página, contador
   prévio de outros lores, replay antigo durante/depois, CAS/retry/rollback,
   recriação de lore/journal/recibo, cancelamento em cada etapa, Node e SDK real.
7. Atualizar ADR 0089, evidência e estado do plano 78. Só então seguir M38c.

## Aceites e limites

Uma lista anterior não deve ser descartada ou declarada completa por seu tamanho.
A fonte validada é a verdade semântica; o prefixo é preservado até a troca atômica.
Recriação/alteração fora do protocolo falha sem adotar ou apagar a encarnação nova.

Implementação técnica validada em M38b2: 60 backend distintos e dois SDK reais
positivos. Os prefixos podem avançar com contadores e recibos preservados, sem
executar migração de produção. Consultar a
[entrega](../../../entregas/2026-10-23-writer-v2-migracao-dos-prefixos-de-lore.md) e
[ADR 0090](../../../decisions/0090-legacy-lore-prefix-migration.md).
A próxima etapa é M38c: integrar consumidores e mutações antes da ativação.
P1/F2-09 e Writer V2 abertos. Somente commits locais, CI ignorada e testes dirigidos;
validate no fechamento de P1. Sem push/PR/deploy.

## Evidência de fechamento técnico

[Entrega M38b2](../../../entregas/2026-10-23-writer-v2-migracao-dos-prefixos-de-lore.md):
58 testes na regressão mais dois cenários adicionais, 60 backend distintos; dois
SDK reais positivos. A fixture v6 grava nativamente alvo/journal/job/recibo e
não simula identidades por alteração de timestamps. Contagem original é ancorada
no recibo, e o prefixo é reconferido por metadata em cada unidade/hash na troca.

Compatibilidade sem legacy, conservação/replay de recibos, contador anterior de
outros lores, falhas após writes preparados, CAS/retry e cancelamento por estágio
foram verificados. Um prefixo migrado atravessou todas as fases até v14/v12 e
cancelou com contagem exata de artefatos. Nenhuma migração real foi executada.
