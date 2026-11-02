# ADR 0135 — Unidades de retirada conjunta de lore

- Estado: aceita e implementada internamente; coordenador/cliente/rollout pendentes.
- Data: 2026-10-25.
- Plano: [120 / M38c5v](../tasks/writer-v2/execucao/120-retirada-conjunta-de-lore.md).

## Problema e decisão

loreEntityToken depende do clock do compêndio. Retiradas singulares em sequência
invalidam as origens seguintes; renovar o token depois da aprovação pode trocar
a seleção revisada. A adoção conjunta já atende a edição (ADR 0110).
Acrescentar prepareBookLoreRemovalBatch com unidade interna de 1..50 membros.

Preparação faz somente leituras/validações; commit faz somente writes.
Start singular usa prepareBookLoreRemovalStart no mesmo módulo, preservando
contextos/DTOs/limpeza/handoff. Lote exige conta/livro/nascimento iguais,
IDs/alvos distintos e inspeções ready da origem original. Leituras irmãs
terminam antes de rejeitar. Qualquer falha impede todo o commit.

Calcular um timestamp monotônico, um localLoreVersion e um epoch de privacidade
para a unidade. Contextos, estados, eventos/provas, tombstones e retiradas das
cabeças nascem juntos; raiz/publicBooks são atualizados uma vez.
Contexto de cada ficha conserva sua privacidade/revoked particular, compartilhando
timestamp/versões finais. Nenhum crédito é cobrado e publicar não é automático.

## Comprovante e recuperação metadata

removalBatches/batchId e removalBatchProofs/batchId ficam sob a primeira retirada
privada permanente. Guardam manifesto ordenado, hashes dos contextos e frame
conjunto, sem prosa/nomes. Prova/registro devem ser imutáveis e compartilhar
nascimento nativo com todos os contextos dos membros, sem recompor sucesso
conjunto a partir de recibos individuais.

jobToken deriva do UID/manifesto/livro/nascimento nativo do comprovante.
Após observá-lo, o caller deve fixá-lo em GET e conferir respostas; controles
recriados não herdam o token original. Antes do primeiro resultado, GET usa
leader/batchId/intentHash. Prova ausente com líder existente é conflito;
ausência de comprovante não certifica que fichas estejam intactas por outras
operações. Não reenviar retirada automaticamente para suprir perda de prova.

Replay/histórico conferem os contextos originais e o manifesto antes de retornar
progresso atual da limpeza. Cleanup continua por ficha e o handoff original
resolve conclusão após exclusão do livro. Controles/prova permanecem privados
e permanentes, sem novo formato no contexto dos filhos nem inventário de bytes.

## Fronteira

Serviço interno start/get, sem callable. Allowlists/journals existentes,
Rules, deps e env permanecem. Limite 50 é da unidade transacional, não da seleção
ou autoria. O futuro coordenador deve preservar toda a seleção, repartir unidades
por limites reais de tamanho/tempo e conferir a mesma origem aprovada.
Não renovar fontes cegamente após aplicar a primeira unidade, reduzir seleção
ou remover a ação em lote existente para viabilizar o rollout.

Transporte, seleção completa, orçamento, cancel/recuperação, UI e composição
no compêndio continuam pendentes. Emulador não certifica todos os limites de
produção/conteúdos grandes, Auth/App Check ou implantação de índices.
P1/F2-09/V2/fases 3–5/gates humanos/comerciais e validate de P1 abertos.
Somente commit local; sem CI/envio remoto/deploy.
