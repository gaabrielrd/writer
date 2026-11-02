# Writer V2 — Ciclo das variantes com relações não resolvidas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base 74345da.
- Escopo: [plano 225](../tasks/writer-v2/execucao/225-ciclo-das-variantes-com-relacoes-nao-resolvidas.md),
  etapa B de 224.
- Decisão: [ADR 0255](../decisions/0255-campaign-portable-variant-body-lifecycle.md).
- Estado: implementação e validação dirigidas locais; P3/D/F2-09 continuam abertos.

## Implementado

Codec privado portable-relations-v1 para corpos de variantes, com contrato
nativo do cliente preservado. Leitura e projeção não consultam alvos false.
Save valida entrada selada, alvos imutáveis e autorização antes de conservar
chaves/ordem anteriores. Descritor novo autorizado resolve a mesma chave;
reenviar um descritor já conhecido não resolve outra declaração sem descritor.

Remove/restore conservam corpo/codec/binding; discard retorna à base e limpa
o codec. C3 keep-local conserva corpos ativos ou retirados, incluindo
armazenamento anterior e adoção de base nativa. Use-candidate/discard-local
limpam o codec. Alvo antigo autorizado ausente da candidata não invalida
uma declaração false. Backup produz unresolved true no conteúdo v3, com
revisão assinada completa, sem serializar o codec privado.

Metadados inválidos falham antes do corpo. Conteúdo canônico, hashes, chunks
UTF-8, limites de 50 relações/900.000 bytes e autorização continuam obrigatórios.
Masks e tokens incluem o codec e conferem presença/valor nas releituras.

## Validação observada

41 casos novos e 627 regressões passaram: 668/668, zero falhas, skips ou
cancelamentos, em 18.978,1322 ms. Execução final em m148-variant-final.log no
diretório local de QA. Os 26 arquivos dirigidos cobrem Backup, Lore, Variant,
Adoption, Portable e Restored entre campaign*.test.mjs.

Casos novos cobrem API selada nativa, retry exato, texto literal, ordem/tipos,
caso misto de mesma chave, resolução, remoção/restauração/descarte, dois
estados de C3 keep-local, use-candidate/discard-local, legado autorizado,
alvo ausente da candidata, limites aceitos e excedidos sem escrita,
corrupção semântica com manifesto/SHA coerentes, origem revogada, flags
proibidas no cliente e alterações de metadata entre masks.
Arquivos de casos positivos são emitidos e revisados com assinatura real;
índices temporários são descartados.

Três casos iniciais de teste presumiam que o escritor não leria conteúdo
antes da etapa de binding. O escritor audita primeiro um corpo ainda válido;
a mudança posterior era corretamente recusada, mas a contagem total de
leituras tornava o ensaio incorreto. Esses casos passaram a invocar o binding
com contexto/metadata reais e exigir rejeição antes de ler corpo nessa etapa.
Produção não foi relaxada. Lint inicial também apontou uma variável retirada
do DTO e não usada; a projeção passou a selecionar seus campos explicitamente.

ESLint dirigido aos nove arquivos de código/teste positivo. Sintaxe de 450
módulos Functions positiva. Formato, arquitetura, documentação e diff final
conferidos; revisão manual sem achados bloqueantes e scan de marcadores de
segredo dirigido. Sem mudanças de interface ou validação SDK/navegador nova.
Banco de teste em memória com serviços reais do domínio e metadata simulada.

A revisão automática de permissão teve indisponibilidade/timeout em algumas
chamadas locais; ações não executadas foram conferidas antes de repetir a mesma
solicitação com a revisão habilitada. Nenhum teste foi reiniciado por timeout
de observação e nenhum mecanismo de aprovação foi contornado.

## Continuação

Inventário/cleanup C4 v1–v4 antes de qualquer produtor de restauração; depois
upload/retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
Validate integral no fechamento desse bloco de leitores/cleanup; não repetido
neste incremento. O validate de f575981 comprova apenas o bloco histórico 201–218.
Macro 8/35 (22,9%) permanece. Somente commit local, sem CI/push/PR/merge/deploy/agentes.
Servidor manual e checkout master preservados, sem reinicialização.
