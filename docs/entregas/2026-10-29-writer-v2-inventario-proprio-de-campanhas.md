# Writer V2 — inventário próprio da portabilidade de campanhas

- Data: 2026-10-29.
- Base: a30a8fa; branch codex/writer-v2.
- Escopo: [plano 202](../tasks/writer-v2/execucao/202-inventario-proprio-da-portabilidade-de-campanhas.md),
  parte do passo 2 do [plano 201](../tasks/writer-v2/execucao/201-portabilidade-privada-de-campanhas.md).
- Estado: evidência parcial de desenvolvimento, P3 aberto.

## Resultado

O serviço interno percorre nove famílias próprias/estruturais: notas, sessões,
checklist, itens/corpos de pistas e missões, referências S2, vínculos S3 e os
respectivos controles por sessão. Página limitada e lookahead não leem prosa,
consultam a origem derivada ou escrevem dados. Não dependem de listas de ativos.

Sessões/itens excluídos mantêm seus vínculos inventariáveis. Cabeçalho/corpo e
controles precisam corresponder ao dono, campanha e encarnação nativa. Controles
ausentes com recursos, corpos órfãos e escopos incompatíveis recusam explicitamente.

Provas por documento e dependências nativas detectam referências S2/vínculos S3
que não mudam a âncora global. A prova da página inclui lookahead; cursor vincula
UID/campanha/âncora/família/limite. O exemplo de inserção atrás do cursor demonstra
por que a captura completa precisará repetir todas as famílias desde o começo.

A decisão está na [ADR 0232](../decisions/0232-campaign-backup-own-inventory.md).

## Critérios do incremento

- [x] Nove famílias, limite de página, ordem por ID e ausência de filtro deleted.
- [x] Entrada/cursor estritos, valores congelados e nenhum caminho arbitrário.
- [x] Apenas metadados, sem título/texto/target derivado, query ilimitada ou escrita.
- [x] Escritores reais S2/S3 invalidam provas por sessão, com âncora global igual.
- [x] Tombstones, pais/dependências, recriação, cabeçalhos e C4 conferidos.
- [x] Testes direcionados e revisão dos resultados reais.
- [ ] Conteúdo por chunks, captura/segunda passagem do arquivo, procedência,
      restauração, UI, ciclo e validate integral do novo grande bloco.

## Arquivos e compatibilidade

Novo functions/src/campaignBackupInventory.mjs e teste dedicado. O serviço da
âncora existente apenas expõe helpers internos de scope/token/identity para
reuso, preservando o DTO/comportamento já testados. Plano 202, ADR e índices/
arquitetura/progresso registram escopo e limites. Não há mudança de Rules,
dependência, lockfile, endpoint, index, armazenamento, segredo ou inventário C4.

## Testes e validação

node --test functions/test/campaignBackupInventory.test.mjs functions/test/campaignBackupSource.test.mjs
terminou com **exit 0, 38 testes positivos, zero falha/cancelado/ignorado/todo**,
412,4113 ms. São 20 percursos novos e 18 da âncora compartilhada.

A fixture rica usa criação de aventura/cena, captura/ativação da campanha e
escritores ordinários reais de notas, sessões, checklist, pistas/missões, S2 e
S3. A porta do inventário recusa leitura completa, campos de prosa, escrita,
query sem select/limite e caminhos fora da campanha/reserva. Banco simulado
fornece nascimento/updateTime, sem claim de concorrência Firestore real.

Cobertos: nove famílias/replay estável, campanha vazia, 61 notas em 21 páginas,
limites de ID de 1.500 bytes, cursores malformados/cruzados, conta diferente,
C4 antes dos filhos, criação/remoção de vínculo, sessão/item excluído e aventura
removida, reescrita/recriação nativa, lookahead, inserção atrás do cursor,
pais recriados, controles ausentes/contadores inválidos, páginas duplicadas/
fora de ordem/fora da coleção, dados corrompidos, retry e mutação do pedido
enquanto aguarda a transação. Nenhuma falha de teste foi observada nas duas
rodadas direcionadas; a segunda cobre os casos adicionais da revisão.

ESLint dos três arquivos afetados, sintaxe individual de cada módulo, formato
dos dez arquivos, check:docs e git diff --check passaram com exit 0. Revisão do
diff sem bloqueadores; preservados DTO/garantia da âncora e os gates de C4.
O servidor manual respondeu HTTP 200, com o mesmo PID 11192, e master permaneceu
limpa em 522ccaa. Validate integral não foi repetido, conforme a política do
operador; a suíte verde de P2 não valida este código novo.

## Pendências

O inventário não é backup utilizável, autorização da base, prova portátil de
procedência ou certificado de projeto completo. Ainda faltam leitura de DTOs/
texto, arquivo/segunda passagem, base/variantes/mídia, cleanup persistente,
restauração, interface e ciclo P3. C4 segue v1–v4 até o inventário dos produtores.

P3/D/F2-09, retenção final das perguntas do plano 199 e gates humanos/comerciais
continuam abertos; macro **8/35** inalterada. Somente commits locais, sem CI,
push, PR, merge ou deploy. Servidor manual da porta 5173 preservado.
