# P1 / M37a — Texto lógico das fontes de conversão

## Objetivo e escopo

Preservar integralmente original.content das fontes congeladas de conversão
durante restauração, leitura privada e novo backup. O item lógico continua
admitindo até 8 MiB; não reduzir esse contrato ao limite nativo do Firestore.

M37 cobre ainda outros campos grandes: lore (nome/aliases/prosa/relações),
metadados de livro/ato/capítulo, cenas e planejamento/narrativa, rótulos e metadata
de histórico/rascunho. Esses grupos continuam obrigatórios e pendentes após M37a.
Personas e capa mantêm os contratos já implementados. Não declarar suporte
integral aos campos grandes ou encerrar P1 com esta única família.

## Proposta e suposições

Uma fonte guarda o snapshot de um capítulo. Reutilizar o corpo imutável de
capítulo em bookTextBodies, com resource chapter e ID do capítulo congelado,
pins 1 e partes de 64 KiB. Acima do limiar atual de 512 KiB, original.content
fica null e original.contentStorage aponta para a geração. Não inventar tipo de
recurso nem namespace novo: inventário v5 já limpa todas as partes antes do
manifesto; preparação de fontes tem inventário v7 e delete-book v2 já cobre corpos.

- A fonte externa e seus corpos/journals nascem com cursor/recibo na mesma
  transação, até 130 artefatos por item de 8 MiB. Colisão/retry não sobrescreve.
- Texto/hash/presença de campos restantes são preservados; origem congelada não
  depende da existência atual do capítulo. Não criar capítulo para ler a fonte.
- Reconciliação confere o texto lógico completo e o hash da fonte, além das
  provas nativas dos artefatos, sem comparar ponteiro físico com JSON portátil.
- Backup resolve original.content pelo leitor interno autorizado antes de
  projetar JSON; nunca exporta contentStorage.
- Lista de fontes mantém conteúdo inline legado; fonte externa entrega corpo
  null, descriptor e token ligado à encarnação nativa do livro/fonte/corpo.
- Leitor privado paginado reautoriza dono/estado/revisão do livro em cada unidade,
  confere token/manifesto/nascimento e entrega somente uma parte de até 64 KiB.
  Cliente monta texto com hash/UTF-8/BOM e reconfirma antes de devolver; mudança
  de conta, raiz/fonte/corpo ou revisão invalida a leitura.
- Interface pública do serviço cliente continua retornando SceneSource com texto
  completo, sem ponteiro físico nem persistência local. Consumidores existentes
  não recebem null como texto vazio.
- Leitura de corpos via SDK permanece fechada. Fonte reservada sem raiz não é
  autorizada. Cancelamento/coleção/delete-book preservam protocolo nativo existente.
- Conversão autoral atual conserva seus limites de escrita de cena; ampliar
  outros campos/limites pertence aos incrementos seguintes, não ao leitor da fonte.

## Arquivos e sequência

1. [x] Helper de fonte lógica e integração no escritor/reconciliação de recursos,
       reutilizando bookChapterText e inventários existentes.
2. [x] Backup e leitura paginada/lista autorizados; registro do callable e contrato
       cliente sem alterar componentes visuais.
3. [x] Testes Node de fonte acima de 1 MiB e limite lógico, integridade/replay/
       colisão/cleanup; SDK real e regressão dos leitores/deleção afetados.
4. [x] Montagem cliente, troca de conta/origem e compatibilidade inline, com
       Vitest/tipos/lint/build dirigidos.
5. [x] Revisão, ADR/documentação/evidência e commit local.

Arquivos previstos: novo bookSceneSourceText/read, bookRestoreResources,
bookRestoreCountEffects, bookBackupResourceRead, scenes/index, serviços/modelos
de scenes no cliente, testes e documentação. Sem dependência nova ou subagentes.

## Aceites e riscos

- Restauração de fonte acima de 1 MiB termina sem truncamento e sem raiz.
- Original congelado reaparece idêntico no leitor privado e no backup, inclusive
  BOM/Unicode e ausência de campos. Corrupção não se torna fonte vazia.
- Colisão, CAS e retry mantêm atomicidade; cancelamento por metadados remove
  somente corpo/partes próprios, e exclusão do livro continua cobrindo a família.
- Token da lista não autoriza outra encarnação ou revisão; SDK direto não abre corpo.
- Item perto dos 8 MiB pode gerar até 128 partes, preservando o orçamento existente.
  Metadados enormes da fonte continuam pendentes de M37, sem alegar conclusão.
- O leitor de backup existente remonta um item por parte de exportação. Medir
  o custo do caso grande e registrar o limite real; não confundir leitura parcial
  de transporte com permissão de publicar uma origem sem reautorização.
- Nenhuma ativação/deploy neste incremento. Validar somente o necessário durante
  ajustes; validate integral no fechamento de P1. CI ignorada, commits locais.

## Continuação

M37b e seguintes devem suportar os demais campos grandes com seus leitores,
writers, históricos e limpeza antes de disponibilização final/ativação.
Também faltam capa/biblioteca, certificação, limpeza pós-ativação e host/UI/
roundtrip/validate. P1/F2-09 e Writer V2 continuam abertos.

## Evidência e achado de custo

[Entrega M37a](../../../entregas/2026-10-23-writer-v2-texto-logico-das-fontes-de-conversao.md)
e [ADR 0085](../../../decisions/0085-frozen-scene-source-text.md): 110 backend
distintos, 58 Vitest e três SDK positivos; tipos, arquitetura, sintaxe e
build/smoke OK. Raízes de leitura são harnesses, sem ativação do restaurador.

A instrumentação Node contou 361 leituras de partes para 19 páginas de saída.
Otimizar a recomposição quadrática do backup antes de habilitar P1 por completo;
não tratar o sucesso de fidelidade como prova de desempenho no limite de 8 MiB.
