# Writer V2 — Índice derivado persistente de campanhas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base 8c235dc.
- Escopo: [plano 230](../tasks/writer-v2/execucao/230-indice-derivado-persistente.md).
- Decisão: [ADR 0260](../decisions/0260-campaign-persistent-derived-index.md).
- Estado: staging interno implementado e validado, sem verificador retomável/ativação.

## Implementado

Indexação derivada retoma por frames e persiste somente metadata cifrada de
bases, campos/corpos, links, ledger, imagens, variantes/âncoras e testemunhas.
Staging é compartilhado com o revisor completo. Pausa/reinício preserva ordem,
pareamentos, cursor e UTF-8; texto/imagem não são reunidos em memória.
Um DTO JSON continua limitado a 4 MiB e não entra no checkpoint.

Índice de posições autentica busca binária e vizinhos de ausência; uma query
vazia não mascara um item existente. Lookup/reverse conferem nascimento,
recibo/testemunha e cifra. Portas internas read/lookup/reverse são limitadas e
invalidam após cancelar. Recibo original e CAS conservados.

Coleta existia antes do produtor: cancel limpa estado/chave; passos retiram
pares linha/posição por metadata, verificam posições órfãs e só então avançam
para own/chunks. Estranhos e falhas não viram exclusões indevidas. SDK continua
fechado; somente certificado campaign-derived-index-only, sem grant.

## Validação observada

362/362 testes dirigidos em 46.006,7575 ms (m153-directed-final.log), mais dois
casos acrescentados durante revisão em 3.287,3833 ms
(m153-directed-review-additions.log). São 364 casos distintos, 23 novos e 341
regressões; zero falhas/skips/cancelamentos nas execuções finais.
A suíte cobre os serviços de upload/integridade/own, arquivo, semântica
própria/derivada/origens, UTF-8 e relações não resolvidas.

Novos casos provam equivalência de todas as linhas ao staging real assinado,
portas persistidas usadas pelo verificador completo com MAC efêmero de teste,
ausência/autenticação de posições/vizinhos, query vazia forjada, variante nativa
acima de 512 KiB, pares/órfãos/coleta, recriação, concorrência/CAS/recibos,
rollback de produtor e par de cleanup, cancelamento durante leitura, revogação,
limites/isolamento/C4, UTF-8 legado dividido e inválido, e unresolved v3.

SDK/Rules: 1/1 jornada nova passou em 205.475,6962 ms (m153-sdk.log).
Arquivo assinado com base/lore/imagem atravessou upload, integridade, own,
indexação derivada e retomada entre serviços. 71 pares linha/posição foram
persistidos/coletados; nascimento nativo, lookup exato/ausência, bloqueio SDK e
cancelamento/coleta antes de own/chunks confirmados. A origem do arquivo de
teste não foi materializada no emulador: o resultado comprova staging, não
autorização atual das origens. Emulador demo/JAR verificado e encerrado pelo runner.

ESLint dirigido aos 13 mjs positivo; o arquivo com dois novos testes foi
reconferido. Sintaxe de 467 módulos Functions positiva (m153-syntax.log).
Arquitetura/documentação/formato/diff e scan dirigido de segredos conferidos.
Sem nova dependência, índice composto, Rules ou entrada pública.

Primeira extração deixou referência de baseWitness fora do estado; corrigida e
62 regressões passaram. Primeiros casos novos encontraram adaptador de teste
com campo excedente, fixture de variante acima do limite nativo e read com erro
síncrono. Ajustamos o adaptador, usamos variante válida acima de 512 KiB e
mantivemos validação assíncrona; os três casos dirigidos passaram antes da
execução final. Não foram ampliados limites nem enfraquecidos guards.

## Continuação e limites

O índice não substitui o verificador derivado retomável: um item pode ter muitas
dependências, e seu percurso/hash ainda precisam de checkpoint. Depois vêm
origens persistidas, remapeamento/materialização/mídia, C4 de jobs/índices/posições
antes da ativação e Estúdio/ciclos. Macro 8/35 e P3/D/F2-09 abertos.

Somente testes dirigidos conforme operador. Validate integral no fechamento do
bloco persistente; 9.710 testes de bf6bb14 são baseline 219–226, sem atribuição
ao código novo. Build/UI/navegador não repetidos: interface e entradas públicas
não mudaram. Servidor manual/master preservados; somente commit local.
Sem agentes/CI/push/PR/merge/deploy.
