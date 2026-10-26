# ADR 0161 — confirmação durável da finalização de livros

Status: aceita para o incremento local; interface e fechamento de P1 pendentes.
Data: 2026-10-25.

## Contexto

Ativação e cancelamento revogam a chave usada no journal cifrado de preparação.
Uma resposta perdida após esse commit precisa ser confirmada depois da recarga,
sem chave, sem recriar a raiz e sem substituir uma decisão de revisão.

## Decisão

Manter intenção operacional metadata fechada em IndexedDB separado:
identidade do job, ação, operationId e checkpoint/revisão/reviewToken aplicáveis.
Não incluir título, prosa, bytes, chave ou credenciais Auth/App Check.
JobToken e reviewToken são provas do protocolo; não substituem autorização.

Persistir antes do RPC e comparar o registro inteiro ao encerrar. Repetir a
intenção original antes de escolher outro efeito. Ativação nova exige revisão
explícita: capturar seu valor antes de awaits, sem atualizar token automaticamente.
Cada espera revalida conta/vida útil; conflitos e erros preservam o controle.

Ativação/cancelamento/limpeza de cancelamento usam recibos e resolver comuns.
Mídia e limpeza pós-ativação usam seus próprios protocolos. Conclusão nativa
already-complete pode encerrar uma tentativa sem inventar recibo próprio.
Somente prova monotônica nativa permite encerrar tentativa não confirmada que
já não pode produzir efeitos; desconhecimento no mesmo checkpoint não basta.

Mídia permanece distinta da disponibilidade atual da imagem. Histórico de
ativação não concede acesso ao livro: navegação dependerá do leitor normal.
Limpeza pós-ativação preserva a raiz ativa, inclusive editada ou excluída.

Bootstrap e finalização compartilham um kernel metadata interno de IndexedDB,
com codecs/namespaces separados e CAS integral. Layout do bootstrap e journal
cifrado anteriores permanecem compatíveis. Limpeza de cancelamento usa limit
fixo 16 no pedido original e em seu fingerprint.

## Consequências e evidência

Repetir ativação não depende da chave revogada nem recria livro removido.
O controle metadata pode sobreviver sem o arquivo e não contém manuscrito.
A sessão executa uma unidade por vez e nunca ativa ao simplesmente avançar.

Teste real revelou que o leitor de recibos rejeitava fases modernas de
cancelamento: cover-storage e persona-library são aceitas apenas nas versões
de cleanup que as suportam. Não se relaxa a validação de versões anteriores.

[Plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md)
e [evidência](../entregas/2026-10-25-writer-v2-finalizacao-duravel-no-cliente.md).
Interface, roundtrip/consumidores/inventários/rollout/validate de P1 continuam.
