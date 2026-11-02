# ADR 0062 — Catálogo e normalização legados com checkpoints

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M18](../tasks/writer-v2/execucao/51-catalogo-e-normalizacao-legados.md).

## Decisão

Extrair estados serializáveis do catálogo e da normalização M12, compartilhados
com o leitor existente. Não criar conversor alternativo nem flexibilizar formato
novo. scanBookLegacyJSON continua sendo a única gramática lexical (M17).

bookLegacyCatalog oferece criação de estado, aceitação de um span, finalização
e leitura de item por índice de spans. Estado guarda contagens/presenças/versão
e identificador de universo, até 16 KiB; descriptor serializável contém somente
metadados e procedência. O wrapper de catálogo preserva item() e Set internos
para compatibilidade. Recibo lexical é fechado em size/fingerprint.

bookLegacyNormalize valida um perfil/grupo ou emite um registro lógico por passo.
A máquina avança em fases fixas e posições de seções, sem percorrer uma seção
inteira numa chamada. Cenas têm passos para metadados, corpo, planejamento e
cada referência; narrativa separa item e vínculos. Ao retomar fanout, reconfere
hash canônico do item em andamento. Cursor não guarda texto nem lista de IDs/
referências; teto de 16 KiB e hash do descriptor vinculam seu contexto.

A unidade lê itens de até 8 MiB por spans de até 64 KiB. Vínculo de persona pode
ler dono e perfil; estado não acumula os itens. Releituras entre unidades são
esperadas, sem promessa de leitura única ou limite total de itens do projeto.

Cada saída inclui record/value, bytes canônicos temporários, hash desses bytes
e localização lógica. readBookLegacyNormalizedItem refaz a unidade a partir do
cursor anterior e confere record/hash sem gravar índice. Efeitos necessários,
como a marca de capítulo, devem já existir e coincidir; ausência não é reparada.
Esse readback serve para relações/materialização futuras, não para autorizar
conteúdo ou provar confirmação do job.

## Semântica preservada

O leitor existente delega ao normalizador e alimenta o mesmo núcleo M15.
Preservar ordem e identidades de origem, campos próprios, cenas, planejamento,
fontes de conversão, ranks A/B derivados e personas efetivamente usadas.
Etiquetas resolvidas não viram lore, corpo global não é copiado, status público
não é restaurado e capa por URL não é buscada. Disponibilidade/procedência
continuam explícitas; placeholders legados não fabricam história ou selo.

## Host e continuação obrigatória

Índice e cursor pertencem ao host. Falha não altera o cursor recebido; efeitos
externos de uma unidade só são seguros com preparação/commit atômicos ou
descarte do índice temporário no cliente. Releitura usa o índice real em modo
somente leitura e não pressupõe que um hash isolado autentique a origem.

Não há writer novo em Firestore/Storage. M19 deverá ligar scanner/catalog/
normalização ao serviço M16, ampliar/versionar snapshot para os 512 KiB lexicais
M17 mais os estados necessários, e preservar observações nativas, nascimento
por recibo e cleanup. O endpoint atual ainda recusa legado explicitamente.
Remapeamento/mídia/ativação e host/UI/roundtrip continuam necessários em P1.
