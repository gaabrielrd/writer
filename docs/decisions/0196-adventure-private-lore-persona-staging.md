# ADR 0196 — Lore e personas privados na restauração de aventuras

Data: 2026-10-27. Status: aceita para incremento interno.
Base: [ADR 0195](0195-adventure-private-resource-staging.md) e
[plano 174](../tasks/writer-v2/execucao/174-lore-e-personas-da-aventura-restaurada.md).

## Decisão

advanceAdventureRestoreProfiles continua itemIndex após resources-ready, mantendo
resourceIndex no fim da seção anterior. Fases lore/personas/profiles-ready têm
contagens fechadas e limitadas pelos totais/manifestos autenticados. Recibos de
fases anteriores continuam válidos. View retorna contadores, sem texto ou perfis.

findLore autentica chave/ordinal do índice, operação/nascimento/hash, unidade e
fonte. O consumidor reconfere todas as provas na transação que escreve. Cabeçalho
vivo e corpo são preparados juntos, por lookup, mesmo com corpo primeiro no arquivo.
Tombstone conserva datas e não recebe corpo; um corpo inesperado impede a escrita.

O lore usa os campos nativos de adventureLore: identidade da nova aventura,
revision 1 e isPublic false, com relationCount recalculado. O token de identidade
usa o nascimento comum de raiz/job que load comprova. A definição privada recebe
loreVersion pelo número de cabeçalhos processados. Nomes, aliases, texto, datas e
relações ficam exatos; normalização que altere valor é incompatibilidade.
Remap pode ampliar as relações além do orçamento nativo: falhar sem truncar,
mantendo fonte/checkpoint e cancelamento. Relações externas continuam ponteiros,
sem leitura de corpo externo ou concessão de acesso.

## Personas e privacidade

Perfis portáteis com ID remapeado e hash ficam em preparedRoot/persona-custom-...;
bindings explícitos, incluindo null, ficam em preparedRoot/binding-....
Cada binding é conferido contra definição da raiz ou scene head comprovado.
Ensure idêntico deduplica perfis; qualquer alvo sem prova ou diferente é recusado.
Snapshots completos conservam instruções, traits, datas, revision e archived.

Nenhum perfil entra ainda em aiPersonas. A integração com biblioteca e sua prova
de disponibilidade continua obrigatória antes da ativação. Não alterar o contrato
de lotes de livros nem permitir que persona parcialmente montada seja consumida.
Blocos conservam a herança da cena e seus complementos já remapeados.

## Escrita sem alteração e limpeza

Uma atualização cujo hash é idêntico ao valor comprovado preserva target e journal.
O SDK pode conservar updateTime numa substituição sem mudança; avançar apenas
o journal quebraria sua prova da última versão nativa. O checkpoint avança junto
das demais provas/efeitos, sem inventar uma atualização do target. Substituição
com alteração continua integral, preservando nascimento/primeiro criador.

Endereços fechados admitem lore/loreBodies e os novos documentos privados. Os
journals existentes já removem target e journal atomicamente; preparedRoot precisa
ficar vazio no fim, inclusive em jobs antigos. Conteúdo estrangeiro, falta,
adulteração ou recriação impede certificação e é preservado.

## Limites

profiles-ready conclui somente esta passagem. A raiz mínima permanece sem ownerId
e countReady false. Universo autorizado, integração de personas, histórico/draft,
mídia, agregados/audit/ativação, recuperação cifrada/UI e roundtrip continuam
obrigatórios. A prova é por etapas e namespaces conhecidos, sem snapshot contra
mutações administrativas externas. P2/P3/D/F2-09 e os gates continuam abertos.
