# P1 / M38c11 — Publicação com lore nativo

## Objetivo e achados

Integrar publicação à etapa 4 do [plano 80](80-consumidores-do-lore-completo.md).
publicationService usa cabeças como fichas e pode omitir dados nativos ou perder
a precedência de termos privados. Captura de campanhas aceita somente universo/
aventura, com storedMetadata/storedBody próprios: não migrar livros para ela.

## Contrato e suposições

Preservar autor público explícito, sanitização/capítulos/atos, seleção pública
fechada (nome/aliases/categoria/resumo), consentimento explícito e precedência
local/global. Privado e legado sem consentimento continuam privados. Não
publicar details, notas, relações, tokens de leitura de fichas ou rascunhos.

Reutilizar captura C1 integral já implementada no cliente, com tokens originais,
lista completa e revalidação metadata sem baixar corpos novamente. Não usar
LoreEntity visual/defaults como fonte. Custo é linear no texto capturado; este
incremento não oferece transporte seletivo de metadata para o cliente.
Não impor teto de autoria, 8 MiB/128 partes ou número de fichas.

Revisões continuam staging invisível até ponteiro final. Livro com recursos
nativos usa servidor para copiar lore local e ativar a revisão. Isso permite
resolver consentimento lógico mesmo quando ausente da cabeça. Leitura/cópia
reautoriza livro, geração e prova de criação. Cada staging local é imutável e
idempotente apenas para o mesmo conteúdo sob a origem ainda válida.

Revisão guarda sourceLoreToken da coleção C1. Final exige token original,
livro/nascimento/clock, versão de privacidade, status/data/cenas/universo próprios
e header staged. Replay confirma ponteiro original ainda válido sem reescrever;
não reabre publicação retirada ou reaplica depois de conflito. Sem novo journal
ou namespace privado: staging usa a revisão pública existente.

Rules preservam staging de capítulos/atos/globais, mas negam cópia local direta
e ativação SDK em livros com hasLoreResources. Header nativo exige token fechado.
Flag permanente e drain de clientes/produtores seguem gates de rollout de P1.
Fluxo legado totalmente inline permanece compatível. Identidades públicas
colidentes rejeitam antes de qualquer staging, sem fallback para outra origem.

## Implementação sequencial

1. Estender cliente C1 com captura/verificação de coleção (IDs/tokens/clock),
   mantendo captureList compatível. Sessão pública de captura de publicação
   vincula Auth original e oferece verificação sem prosa persistida.
2. Serviço interno de publicação: stageBookPublicationLore lê projeção pública
   certificada e consentimento lógico, valida subset ordenado de aliases e cria
   documento imutável. finalizeBookPublication confere origem/versões/header e
   ativa ponteiro/status atomicamente. Sem crédito, mídia ou novas coleções.
3. Integrar callable/router e Rules conjuntamente com cliente. publicationService
   detecta recursos/payloads, usa captura, verifica antes/depois de staging e em
   fronteiras de Auth; copia locais via serviço e finaliza no servidor.
4. Node/Vitest/SDK: inline/v1/v2/criação real, >8MiB/128 partes, privado sombreando
   global, consentimento ausente/false/revogado, Unicode/limites, snapshot/livro/
   universo recriados, clock sem alteração de millis, resposta perdida/replay,
   conflito antes de ponteiro, rollback e SDK bypass negado. Regressões de
   publicação/compêndio/reader e capítulos/atos/globais conforme risco.
5. Lint/tipos/build e checks locais afetados, ADR/AGENTS/docs/evidência e commit
   local. Browser se comportamento de tela mudar; nenhuma nova tela prevista.

## Riscos e limites

Captura integral lê detalhes/relações privados autorizados e pode custar mais
I/O que uma futura projeção seletiva; não afirmar o contrário. Servidor de cópia
usa projeção limitada só para os campos públicos e rejeita truncamento/invalidez.
Revisão órfã após falha permanece invisível e usa cleanup existente. Não há
promessa de retomada automática de staging ou limpeza global certificada.

Não expandir captura de campanhas. Demais contextos/consumidores/escritores,
inventário dos namespaces/exclusão, backup/restauração/drain/rollout/validate de
P1/F2-09, fases 3–5 e gates humanos/comerciais continuam no objetivo.
Validate integral no fechamento de P1; sem CI/push/PR/merge/deploy/subagentes.

## Detalhe da prova de publicação antes da implementação

Adicionar leitura privada getBookPublicationSource, além das duas mutações.
Ela devolve descriptor fechado de metadata com identidade e updateTime nativos
do livro/universo, relógios/status/privacidade/cenas e listToken C1; token é hash
do descriptor. Cliente fixa essa prova antes de ler globais e staging.
Cópia local e final reconstroem a mesma prova na transação. Header e ponteiro
guardam apenas o hash; token é metadata, nunca grant de acesso.
Replay final exige hash original do ponteiro e as mesmas origens/versões
autorizadas; fonte recriada não pode confirmar nem reabrir o evento anterior.

## Marcos e pendência de escala

Marco A integra captura, cópia e ativação nativas, com interface existente e
validação de consentimento/concorrência. O leitor de cópia usa orçamento por
chamada de 32 MiB/512 partes; não altera nem trunca a fonte, mas pode recusar
publicação de uma base v1 maior. Este marco não fecha o requisito de escala de
todas as fontes válidas.

Marco B deverá reutilizar a inspeção existente em unidades
(bookLoreSourceInspection: SHA incremental, ranges/certificado nativos) para
ler somente os campos públicos de uma base grande já certificada. Manter prova
original, CAS/recibo/fence/cleanup e não persistir prosa no checkpoint. Não
contornar o orçamento com transação ou resposta sem limite. Testar fonte acima
do orçamento do marco A e retomar após falhas; somente então concluir este plano.

## Estado local — 2026-10-25

Marco A implementado: 36 Node, 135 Vitest, 19 SDK positivos; tipos/build/smoke e
checks locais. [ADR 0150](../../../decisions/0150-native-book-publication.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md).
Cópia/ativação nativas funcionam no escopo de uma chamada; cliente e Rules estão
integrados. Sem novo namespace privado, envio remoto ou deploy.

Marco B não implementado. Próximo passo: integrar bookLoreSourceInspection por
unidades, certificado/ranges e cópia pública da fonte original acima do orçamento,
com cancelamento/retomada/fence/cleanup apropriados. Plano 130 **não concluído**;
etapa 4/P1/F2-09/V2 e demais requisitos continuam abertos.
