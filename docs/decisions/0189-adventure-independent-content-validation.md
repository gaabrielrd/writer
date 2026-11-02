# ADR 0189 — validação independente do conteúdo de aventuras

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 167](../tasks/writer-v2/execucao/167-validacao-semantica-do-arquivo-de-aventuras.md).

## Decisão

validateAdventureBackupContent valida o arquivo externo antes de qualquer escrita
autoral. Conferência do envelope e dos oito manifestos não substitui DTOs fechados,
identidades, pares head/body, hashes de texto e vínculos internos. O relatório
content-only não concede acesso, propriedade, licença ou permissão para ativação.

A máquina guarda checkpoints de até 16 KiB e resolve referências em lotes de
até 64 itens por um índice do host. JSON ocupa no máximo 8 MiB por unidade;
texto histórico e PNG passam em partes de até 64 KiB. Não há mapa do projeto
ou texto integral do histórico em RAM. Checkpoints pertencem ao host confiável;
nenhum estado fornecido pelo arquivo pode pular a conferência independente.

SHA retomável usa hash-wasm 4.12.0 já instalado, com estado limitado e streams
isolados, inclusive ao recriar a engine. UTF-8 histórico conserva continuação
entre partes fixed64k; o rascunho usa partes UTF-8 completas. Cabeçalho histórico
nativo e contagem portátil continuam distintos. Recurso removido pode manter
histórico, mas não é recriado nem autoriza um rascunho corrente.

Metadados, 17 famílias de recursos, lore próprio/tombstones, personas e origem
neutra do universo são validados sem importar os codecs Node no navegador.
Campos dos recursos vêm de registro puro compartilhado, sem alterar serializers.
Referências antigas ou externas e overrides desconhecidos geram avisos separados;
corpos ausentes, pais obrigatórios, duplicações e hashes incoerentes falham.

O cliente usa shared/validation para o índice OPFS: nomes HMAC, valores AES-GCM,
chaves efêmeras, entrada de até 16 KiB. A extração preserva namespace e interface
dos livros. Cada validação remove somente seu diretório aleatório após sucesso
ou erro. Erro de limpeza impede retorno positivo; erro primário e falha de
limpeza permanecem em AggregateError.errors, com a causa da limpeza preservada.

## Validação e limites

Corpus nasce dos produtores/leitores reais e inclui importação, arquivo vazio,
conteúdo arquivado, Unicode e retomada. Adulterações são novamente seladas com
Node crypto independente, para que a rejeição alcance o conteúdo e não só o
framing. Testes de livro cobrem a extração neutra e isolamento de namespaces.
Chromium exercitou a API pública com WASM e OPFS reais, inclusive limpeza.
Resultados finais do bloco ficam na evidência, sem inferir aprovação por CI.

Transporte remoto, revisão visual, restauração/remapeamento, mídia, UI e roundtrip
continuam pendentes. P2/P3/D, F2-09 e gates humanos/comerciais não são concluídos
por este leitor inerte. Nenhuma dependência, endpoint ou Rule foi acrescentado.
