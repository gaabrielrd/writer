# P2 — ativação atômica da aventura restaurada

Base: 3147888. Grande bloco 183–185 validado integralmente; APIs ainda internas.

## Requisitos e sequência

1. Adicionar metadata fechada de activation e estado activated, somente com
   validação completa, selo final vigente, biblioteca completa e contagens
   prontas. Preservar estados/recibos anteriores. Job ativado fica congelado;
   mídia/arquivamento posteriores usam sidecars.
2. Revisão autenticada pelo reader verificado: metadata/universo originais,
   definição nativa, controles, lote e último selo. Resumo privado sem manuscrito,
   token fixado por contexto/provas/resultados e observação atual do universo.
   Primeira auditoria sem biblioteca não autoriza ativar.
3. activateAdventureRestore exige checkpoint/reviewToken exatos. Revalidar as
   provas na transação final e reautorizar universo por
   prepareAdventureRestoreUniverseLink. Mudança de observação invalida a revisão.
4. Na mesma transação: substituir pendingRoot original por raiz privada do dono,
   liberar workProgress.countReady, ativar lote de personas, confirmar vínculo/
   contadores do universo e gravar job/recibo. Número constante de writes; imagens
   permanecem preparing e serão finalizadas por ativo depois. Não reescrever
   prosa, histórico ou biblioteca em massa.
5. A raiz já existe e nasceu com o job; preservar essa encarnação, com updateTime
   da ativação. Preservar createdAt autoral preparado e avançar updatedAt
   monotonicamente, mantendo originais intactos. Não aplicar a regra de livros
   cujo root ainda era ausente antes da ativação.
6. Histórico confirma job/reserva/recibos nativos sem exigir ou autorizar a raiz
   atual. Replay deve funcionar depois de editar/excluir/recriar o projeto;
   cancelamento/cleanup jamais apagam projeto ativado.
7. retireAdventureRestoreActivation encerra um pedido incerto pelo mesmo ID e
   fingerprint original, atualizando checkpoint/selo sem criar projeto.
   Ativação atrasada não pode vencer esse encerramento. Se já houve confirmação,
   retornar o resultado histórico. Novo pedido requer nova revisão.
8. Acrescentar override interno de fingerprint no Store, com padrão existente
   preservado; nenhum campo livre do cliente define ação ou fingerprint.
   Validadores puros não importam orquestração nem seeds.
9. Testes dirigidos Node/corpus/SDK: revisão, rollback de cada efeito, CAS/replay,
   resposta perdida/retire/atraso, fonte/review/encarnações alteradas, universo
   revogado/recriado, Rules antes/depois, personas e primeiro ajuste sem contar
   novamente. A raiz atual não vira grant por um recibo histórico.
10. Revisão/ADR/docs/evidência/commit local; testes dirigidos neste incremento.
    Validate integral no fechamento do próximo grande bloco.

## Arquivos e riscos

ActivationMeta/Review/Service/Proof puros ou divididos conforme responsabilidade;
Contracts/Store/Transfer e metadados de validação/staging; testes/fixtures e
documentação. Sem novas dependências, endpoints, índices ou deploy.

Prova nativa da raiz usa nascimento do job, não timestamp da ativação. O selo
final exige librarySourceAudit e a auditoria posterior à instalação. O lote ativo
continua válido após excluir o projeto; o histórico não depende do root atual.
Finalização de mídia precisará conferir a instalação própria, respeitar
desvínculo/retirada e nunca religar cabeças históricas.

## Aceites

- [x] Revisão/token e provas completas precedem a decisão explícita.
- [x] Raiz, contagens, personas, universo e recibo confirmam atomicamente.
- [x] Replay histórico e encerramento de pedido incerto não concedem novo acesso.
- [x] Falhas/concorrência/identidades e consumo nativo após ativar cobertos.
- [x] Testes dirigidos/SDK, revisão, documentação e commit local.

Não finaliza mídia nem entrega UI/transportes. Permanecem finalização por ativo,
GC da fonte após mídia, recuperação/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e gates
humanos/comerciais. Macro 8/35 inalterada.
