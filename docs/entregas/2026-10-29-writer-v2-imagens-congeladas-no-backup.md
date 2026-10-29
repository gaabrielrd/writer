# Writer V2 — imagens congeladas no backup de campanhas

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 210](../tasks/writer-v2/execucao/210-imagens-congeladas-do-backup.md).
- Decisão: [ADR 0240](../decisions/0240-campaign-backup-pinned-images.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Objetivo e implementação

Preservar os bytes da ilustração capturada na base, mesmo quando há uma
versão mais nova no mesmo nome Storage. Se a geração antiga desapareceu,
o backup recusa; nunca usa a versão atual como substituta. Imagem revogada
tem resultado explícito sem leitura de arquivo.

Serviço interno oferece manifesto, partes limitadas e verificação final,
com autorização antes/depois de I/O, inclusive erros. Metadata, tamanho,
assinatura PNG, CRC32C e SHA são conferidos. Tokens vinculam bloco, uso,
biblioteca, base e edição exata; DTOs não levam paths/URLs/gerações.

Fluxo público da feature confere envelopes, base64, partes e SHA integral,
espera o consumo e interrompe pedidos pendentes com guard/abort/return.
Bytes são provisórios; a prova final certifica somente os bytes dessa imagem.
Não é atestado de arquivo nem autorização de restauração.

Extraído o interceptor decimal já usado na restauração para um helper neutro.
O adapter compartilhado passa a selecionar geração exata também na metadata.
Nenhuma dependência nova ou configuração remota foi alterada.

## Arquivos

- functions/src/campaignBackupImage.mjs e campaignBackupImageDefinitions.mjs/.d.mts.
- functions/src/pinnedStorageFile.mjs, bookBackupAssetStorage.mjs e restoredImageStorage.mjs.
- campaign-portability/services/streamCampaignImage.ts e interface pública index.ts.
- Testes Node/Vitest novos, fixture de PNG real e adaptação opcional do helper de base.
- Plano, ADR, arquitetura, regras de agente e registros de progresso.

## Testes e validações reais

- Regressão do adapter de backup e mídia restaurada de livros:
  30 testes Node passaram, saída 0, 15.877,2766 ms.
- Primeiro conjunto novo do servidor: 22 testes, saída 0, 797,5367 ms.
  Após acrescentar o caso de conta/pedido desprendido, o conjunto final abaixo
  inclui os 23 testes distintos dessa suíte; não somar execuções repetidas.
- Conjunto Node final: 87 testes, saída 0, 12.661,9577 ms:
  23 de imagem de campanha, 2 do helper/wire SDK, 46 dos leitores/inventário
  da base e 16 da restauração Storage de aventuras.
- Total Node distinto: 117; regressões usam os produtores reais sobre bancos/
  buckets em memória. SDK real é exercitado contra HTTP em loopback.
- Vitest direcionado: 38 testes passaram em um arquivo, saída 0, 3,39 s.
- Casos incluem PNG multichunk, versão mais nova/antiga ausente, geração
  de vinte dígitos na requisição real, metadata inválida, ranges truncados/
  maiores, integridade, streams destruídos, revogação durante leitura e
  durante falha, C4/adoção, conta, cópia de pedido, indisponível sem Storage,
  corrupção com hash de parte coerente, base64 não canônico, pressão de
  consumo e cancelamento nos três métodos.
- Typecheck passou, saída 0. Verificação de arquitetura passou, saída 0.
- Lint inicial encontrou const não aplicada e assertion TypeScript
  desnecessária; ambos corrigidos. A declaração .d.mts fica fora do escopo
  de ESLint e é verificada por TypeScript/formato.
- O teste wire emitiu quatro MaxListenersExceededWarning no SDK instalado,
  sem suprimir avisos ou elevar limites de listeners. As duas streams públicas
  retornadas pelo SDK terminaram destruídas; o teste e o servidor loopback
  encerraram. Não foi investigada aqui a causa interna dos avisos.

## Limites e como verificar

Sem interface, endpoint, Rules, nova persistência, credenciais ou escrita Storage.
As APIs são internas/injetadas e não são oferecidas como backup completo na UI.
Servidor de teste em loopback não comprova acesso ou retenção no bucket real.

Validação integral do grande bloco P3 permanece pendente conforme orientação
do operador. Não foram executados CI, push, PR, merge ou deploy. Nenhum teste
de navegador é necessário para este incremento sem mudança de interface.

Para reproduzir, executar Node nos arquivos campaignBackupImage.test.mjs e
pinnedStorageFile.test.mjs, e Vitest em
src/features/campaign-portability/tests/campaignImage.test.mjs.
Seguem reconferência/reconciliação conjuntas, manifesto/atestado, framing,
persistência/cleanup, restauração e UI/ciclo. C4 v1–v4 e consumidores precisam
ser ampliados antes de produtores persistentes novos.

## Revisão final local

Lint final dos 13 arquivos aplicáveis passou, saída 0, sem avisos. Typecheck
final também passou, saída 0, após retirar a assertion desnecessária.
Check:docs passou, saída 0. Prettier aplicado somente aos 22 arquivos deste
incremento. Diff sem erros de whitespace. CLAUDE.md permanece coerente com
AGENTS.md. Revisão conferiu autorização, pins decimais, limites, ausência de
novos produtores persistentes e escopo das provas; nenhum bloqueador pendente.
Servidor manual Vite da branch foi preservado na porta 5173, com /studio e
/src/main.tsx respondendo HTTP 200.

## Revisão posterior no plano 211

A integração rica revelou que o teste de revogação da aventura referenciava
campaign.adventureId, enquanto o ID está em campaign.provenance.adventureId.
Uma falha do preparo podia satisfazer a expectativa genérica de recusa Storage.
O caminho foi corrigido e os sete casos de mutação agora exigem que a alteração
nativa complete antes da recusa. A suíte de imagens (23) passou novamente no
conjunto dirigido do [plano 211](../tasks/writer-v2/execucao/211-auditoria-conjunta-do-backup.md).
O código de produção de imagens não precisou mudar.
