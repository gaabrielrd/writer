# ADR 0264 — Materialização autorizada da base arquivada

- Data: 2026-10-29.
- Estado: aceita internamente; campanha ainda pendente.
- Plano: [234](../tasks/writer-v2/execucao/234-materializacao-da-base-congelada.md).
- Continua [ADR 0263](0263-campaign-own-materialization.md).

## Base exata e autorização por recurso

campaignRestoreBaseMaterialization escreve a base congelada do arquivo,
não uma recaptura da aventura atual. Exige own preparado, integridade e
semântica derivada concluídas. Antes de ler cada JSON/parte de texto, confere
a testemunha autenticada e o acesso atual por metadata/nascimento. Na transação
de escrita, repete o guard e compara a prova obtida antes do I/O.
Assinatura, índice ou resumo de origens nunca concedem esse acesso.

Aventura negada no início omite a base inteira e preserva os próprios.
Depois de permitida a base, revogar a aventura interrompe o passo sem avanço,
inclusive na seleção de um item. Perda de universo/ficha pode omitir somente
o lore correspondente antes de copiá-lo, preservando lore local e texto
da aventura. Recurso já iniciado perde o direito de avançar quando revogado;
somente acesso atual à mesma origem permite retry. Cancelamento não depende
da autorização da origem e não transforma prosa derivada em nota própria.

## Localização sem abrir prosa negada

Linhas cifradas do índice derivado podem conter location opcional:
ID do frame e cursor inicial de dados, até 2 KiB, com campos fechados.
A cifra/par/recibo vinculam esse localizador à linha e à encarnação.
Portas read/lookup e bytes do hash semântico anterior continuam iguais.
A porta interna locate obtém somente a posição autenticada.

Materialização usa o localizador depois da autorização; não percorre payloads
negados para descobrir onde estão. Índices antigos sem location continuam
válidos para revisão e coleta. Quando necessário e ausente, retorna
derived-index-location-missing sem mudar o job; a preparação deve ser refeita
explicitamente em nova restauração, sem reescrever linhas imutáveis antigas.

## Campos, estrutura e formatos ordinários

Cada chamada limita o percurso de metadata e conclui no máximo uma ação com
JSON ou frame de texto. JSON usa o parser existente até 4 MiB; texto é gravado
em chunks nativos de até 64 KiB. Checkpoint cifrado até 8 KiB contém cursores,
SHA e metadata limitada; a cauda legada tem até 128 bytes, não texto crescente.
O teste de 2 MiB prova mudança legítima da quantidade de chunks sem alterar
BOM, Unicode, bytes ou hash. Campos vazios mantêm um chunk vazio.

Publicar o item somente depois de seus campos. Ajustar chunkCount para o
formato nativo; campo emprestado não duplica o corpo do dono. Manter sourceKey,
ordem, estado e texto; sourceMode restored/sourceEvidence guardam a testemunha
original e archiveHash. Relações de lore, links e ledger usam os marcadores
portáteis existentes. Ledger de corpos é reconstruído dos chunks efetivos.
IDs de imagem são mapeados por conta/restauração; binários/pins ficam para
a etapa de mídia, sem criar acessos temporários.

Raiz da base é criada depois dos filhos e permanece preparing. Snapshot
narrativo mantém o formato ordinário. A raiz da campanha segue pending sem
ownerId. campaign-base-materialized-only é preparação, não ativação;
auditoria física completa e permissões atuais antecederão a liberação real.

## Journal compartilhado e coleta antes do produtor

campaignRestoreNativeWrites concentra o protocolo já usado por ownWrites;
o wrapper próprio conserva wire/provas e defaults existentes.
baseWrites usa a mesma prova de nascimento/imutabilidade/recibo, com sourceKey
limitado para reautorizar os alvos registrados durante a auditoria.
Inventário fechado cobre raiz/items/bodies/links/loreReferences/images;
a inclusão de images nesta etapa serve para recusar órfãos, não cria mídia.

Cancel limpa estado/chave e coleta base antes dos próprios e índices.
Antes de retirar o pai, query limitada por nomes confirma que cada filho
restante está no mesmo lote de exclusão. Desconhecidos/recriados/alterados
são preservados sem avanço; não ler prosa nem reautorizar a origem para apagar.
O wire opcional preserva jobs anteriores e C4 1–4 não muda.

## Validação e continuação

Regressões de restauração e novos casos cobrem arquivo real rico, legado,
omissões seletivas, provas originais, leitura ordinária após liberação só
na fixture, rollback/CAS/replay, I/O tardio, revogação, journal e proteção do pai.
A evidência do incremento registra os resultados reais do SDK dirigido.

Variantes/âncoras, binários/biblioteca/pins, universo autorizado, C4 dos jobs,
auditoria física final, ativação e Estúdio/ciclos continuam pendentes.
Macro 8/35 e P3/D/F2-09 continuam abertos.
