# ADR 0049 — Captura limitada de cenas e narrativa

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contrato:** [P1 M5](../tasks/writer-v2/execucao/38-cenas-e-narrativa-no-backup.md).

## Decisão

Acrescentar listBookBackupResources e readBookBackupResource, somente de leitura,
para os onze tipos de cena, fonte e narrativa. Extrair bookBackupContext sem
alterar o token M3b. Reautorizar livro/pai próprios ativos em cada transação.

Listar IDs com máscara vazia e até 50 mais sentinela; singleton usa getAll com
fieldMask vazio. SDK real preserva timestamps nativos. Token fixa endereço,
origem e identidade nativa de item/pai; cursor fechado fixa livro/tipo/pai/origem.
Cliente não fornece caminho arbitrário. Projetar um documento por vez, JSON até
8 MiB e partes de 64 KiB. Corpo obrigatório confere hash/bytes com metadata da
cena; plano ausente permanece ausente. Fonte de conversão confere hash e mantém
somente campos conhecidos do capítulo original, sem controles privados.

Enumerar cenas diretamente, incluindo arquivo e agrupador ausente; percorrer
marcos sob arcos existentes. Preservar rankA/rankB e rankSlot ativo nos
controles/capítulos, sem jobs ou contagens derivadas. Rejeitar deleting,
rebalancing e ordem inválida. Restaurador futuro reconstruirá índices/contagens.
Referências conservam tipos/IDs sem resolver nomes, corpos, URLs ou acesso global.

## Cliente e composição

captureBookBackupResources percorre páginas/filhos com profundidade máxima dois
e aguarda o sink por item. Cadeia de escopos/IDs/tokens, incluindo escopos vazios,
evita readsets crescentes. verifyBookBackupResources repete a enumeração e
reautoriza a origem após as outras seções e antes do selo M2.

Envelope schemaVersion/kind/parentId/id/data; registro book-{tipo} com ID SHA-256
do endereço [tipo,pai,id], evitando colisões entre filhos de pais distintos.
IDs originais permanecem no envelope. Índice book-resources contém somente
schemaVersion e contagens; tokens/provas não são dados portáteis.
bookSnapshotCapture compartilha validação de partes/hash/UTF-8 com M3b.

Nenhuma dependência, escrita, coleção, Rules ou crédito novo. Writers/Rules e
manutenção Admin continuam coordenando clocks/pertencimento. A
[entrega M5](../entregas/2026-10-21-writer-v2-cenas-e-narrativa-no-backup.md)
distingue produtor limitado da fixture que acumula frames para asserções.
Sink persistente, UI, schema integral e restauração não estão comprovados.
P1/F2-09 seguem abertos; desenvolvimento local sem CI/push.
