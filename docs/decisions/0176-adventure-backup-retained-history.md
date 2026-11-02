# ADR 0176 — histórico retido da aventura no backup

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Leitor específico de versões manuais e before-restore, de cena/bloco. Famílias
version e version-chunk usam paginação metadata limitada, fonte 147 e provas
nativas na mesma transação. Chunk recebe parentId/parentToken da versão;
cursor e unidade não podem trocar pai, tipo, conta ou fonte.

Cabeçalho exige target adventure/ID físico, resource scene/block e manifesto
inline schema 1 ou ausência legada. Recusar schema futuro, draft de livro,
deleting e marcador externo inclusive null, sem fallback. Versão/corpo não
podem anteceder nascimento nativo da raiz; raiz recriada não adota legado.
Futuro restaurador cria raiz privada pendente antes dos filhos ou planeja
prova equivalente explicitamente. Não exige fonte corrente existente para
preservar versão própria retida.

Chunk exige versionId/index e ID físico digest correspondentes, ordinal
dentro do manifesto e UTF-8 até 64 KiB nativos. DTO de versão conserva resource
e metadata declarada; DTO de chunk conserva índice/texto. Labels/datas/ausência/
null permanecem literais. Não copiar target, índices derivados, storage, draft,
operações ou recibos.

Cada DTO JSON tem faixas de até 64 KiB/hash integral; escape JSON pode exigir
várias faixas por chunk nativo. Esse hash não certifica o texto histórico todo.
Assembler futuro deve ordenar, exigir quantidade/ordinais únicos, somar bytes
e conferir SHA do texto contra manifesto antes do selo. Nenhum pacote é
emitido por esse leitor. Corpos órfãos não são adotados como versão completa.

## Limites e evidência

Sem writer, Rule, runtime, persistência, UI ou dependência novos; formato de
livro não muda. Validação integral no fechamento de P2.
[Plano 153](../tasks/writer-v2/execucao/153-historico-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-historico-no-backup-de-aventuras.md).
