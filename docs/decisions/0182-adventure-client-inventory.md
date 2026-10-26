# ADR 0182 — inventário limitado de aventuras no cliente

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 160](../tasks/writer-v2/execucao/160-inventario-limitado-do-cliente-de-aventuras.md).

## Contexto e decisão

A composição do arquivo precisa visitar todas as views sem reter o conjunto do
projeto em RAM. As definições de adventureBackupResources estavam junto de
codecs/helpers Node. ADVENTURE_RESOURCE_DEFINITIONS/KINDS foram extraídos
literalmente para adventureBackupResourceDefinitions, com reexports e imports
locais compatíveis no servidor. Codecs e singleton nativo continuam no domínio.

A feature adventure-portability expõe scan/verifyAdventureBackupInventory por
índice público, usando port injetado. Não inicializa Firebase no import.
Percorre partes, recursos e filhos registrados, lore/corpos, personas raiz/cenas,
versões/chunks, bindings de imagens e origem neutra do universo. Fonte raiz/
progresso é fixada antes e reconferida depois do percurso.

Páginas de até 50 registros têm DTOs fechados, fonte/escopo/ancestrais coerentes,
IDs estritamente crescentes por bytes UTF-8, tokens válidos e presença explícita.
Singleton opcional ainda exige seu slot presente=false. A página é copiada
antes do primeiro await do visitante; escopo/item são congelados.

SHA-256 incremental inclui fonte, views inclusive vazias, registros canônicos e
totais. Guarda somente páginas dos ancestrais de profundidade limitada, contagens
fixas e digest; nenhum conjunto integral ou prosa na prova. Guard, signal,
expected, visitante e método do port são capturados antes de awaits e conferidos
ao retornar. Guard deve lançar erro quando a conta/contexto deixa de ser válido.

Verificação executa nova passagem completa e compara digest, fonte, views e
contagens. Não basta contagem igual. O visitante de produção não roda nessa
passagem. A prova é de host confiável e declara validation=inventory-only;
não aceitar arquivo/checkpoint externo como origem de autorização.

## Limites e próximos contratos

Tokens de binding/perfil nativos entram no inventário. Storage generation/
metageneration, bytes e hash integral de imagens ainda precisam de sua prova.
Histórico está em ordem física de ID SHA, que não é ordem textual: montador
deve resolver ordinais e fechar quantidade/bytes/SHA do manifesto. Não há
certificação autoral, selo de arquivo, endpoints, Rules, UI ou restauração aqui.

Novas views/produtores precisam atualizar registro, percurso, fixtures e
manifestos correspondentes; não adicionar namespace autoral ignorado pelo backup.
Origem de universo indisponível permanece hint conservador sem grant/prosa.

## Evidência

24 Vitest distintos com produtores reais, incluindo 53 cenas,
raiz recriada, filho/persona/universo mudados sem mudança de rootclock/contagem,
DTO/página adulterados, UTF-8, intenção congelada, erro/abort/conta e origem
ativada pelo importador. 115 regressões Node dos codecs/leitores passaram.
Tipos/lint e bundle isolado do módulo público para navegador passaram.
Validate integral será feito no fechamento do grande bloco de captura.
