# P3 — captura incremental e segunda passagem dos próprios

- Data: 2026-10-29.
- Base: 17f073b; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md),
  [202](202-inventario-proprio-da-portabilidade-de-campanhas.md) e
  [203](203-conteudo-proprio-da-portabilidade-de-campanhas.md).
- Estado: captura própria interna validada por testes direcionados; P3/D/F2-09 abertos, macro 8/35.

## Objetivo e descoberta

Compor a seção própria como fluxo provisório de partes e reconferir todo o
inventário antes de retornar uma prova limitada à seção. Usar o padrão atual
de aventuras: hash incremental de páginas/itens e segunda passagem completa.
Não é necessário índice de projeto em RAM ou persistência temporária para essa
comparação: página atual, hashes e contadores bastam.

O resultado não é arquivo de campanha completo, selo, autorização da base,
contrato de restauração ou validação semântica do arquivo. Não habilitar download/
endpoint/arquivo parcial como campanha completa. Base congelada/procedência,
autorização vigente, variantes/legadas e mídia continuam obrigatórios em P3.

## Arquivos e arquitetura

- Extrair as definições puras já existentes de inventário/limites para
  functions/src/campaignBackupOwnDefinitions.mjs e declaração .d.mts.
- Reutilizá-las no inventário e no contrato de conteúdo, preservando tokens/DTOs.
- Acrescentar feature folha campaign-portability, com interface pública index.ts,
  contratos e serviço streamCampaignOwnData; dependências de produto somente
  auth/shared e definições puras, sem importar internals de adventures/books.
- Reutilizar shared/streams.asyncRecordStream e @noble/hashes já existentes.
  Nenhuma dependência, rota, UI, armazenamento ou comando HTTP novo.

## Contrato da captura

API injetada: getCampaignBackupSource, listCampaignBackupOwnInventory e
readCampaignBackupOwnContent, com respostas unknown validadas na fronteira.
Options capturam guard obrigatório, AbortSignal e source opcional. Guard deve
conferir a conta/projeto atuais; executá-lo antes/depois de await e do consumo.

1. Obter a âncora própria e fixá-la. Nenhum RPC antes do primeiro pull.
2. Transmitir campaign e progress como singleton da mesma âncora.
3. Percorrer as nove famílias em ordem fixa, páginas de 25 com cursor até null.
   Validar envelope fechado, âncora/família, IDs ordenados, itemToken, pageToken,
   tamanho e cursor canônico vinculado a conta/campanha/fonte/família/limite/ID.
   Desprender a página completa antes do primeiro await do consumidor.
4. Para cada unidade, conferir respostas fechadas e mesma identidade/manifesto
   em todas as partes. Base64 canônico e parte decodificada de até 65.536 bytes,
   tamanhos exatos, SHA-256 incremental completo antes de aceitar a unidade.
   Não reunir JSON completo nem decodificar partes isoladas como texto.
5. Omisso é permitido somente para controle, tombstone ou vínculo com pai inativo,
   conforme os tipos do servidor. Contar a omissão sem emitir payload operacional.
6. Emitir partes provisórias somente com kind/id/index/payload. Não há header/
   footer/selo de arquivo. Respeitar pressão de consumo com um slot, sem novos
   RPCs enquanto o consumidor não retomar.
7. Hash incremental do inventário cobre família, início, itens/tokens, pageToken
   e próximo cursor; inclui páginas vazias/término/lookahead pela prova servidor.
   Guardar apenas página atual, último ID/cursor e contadores/hash.
8. Após todo o conteúdo, repetir as nove famílias desde o início com a mesma
   âncora e comparar digest/contagens/páginas. Nunca verificar só o último cursor:
   inserção atrás de cursor, remoção e troca de controle precisam invalidar.
9. Revalidar a âncora ao final. Retornar own-data-only com inventário, contadores/
   hash do conteúdo e omissões, somente no término natural.
   Encerramento, abort, erro, conta trocada ou resposta tardia não retornam prova.

Hash/counters/prova em memória são privados do host e não grants. O futuro
consumidor de arquivo precisa guardar em destino temporário e compor as demais
seções; a futura restauração valida conteúdo/cobertura no servidor, sem confiar
no relatório do cliente.

## Critérios de aceite

- [x] Captura raiz/progresso e todas as famílias, incluindo páginas vazias e omissões.
- [x] Partes exatas e limitadas, SHA completo, sem arrays do projeto ou texto inteiro.
- [x] Segunda passagem completa detecta mudanças S2/S3 que não alteram a âncora,
      inclusive inserção atrás do cursor e remoção; fonte final reconferida.
- [x] Respostas/cursor/base64/manifestações cruzadas ou corrompidas recusam.
- [x] Conta/abort/encerramento têm efeito durante RPC/consumo; pressão de consumo
      limita leitura adiantada e resposta tardia não gera prova.
- [x] Testes usam os leitores/escritores reais e preservam as 57 regressões
      pertinentes dos incrementos anteriores.
- [x] Tipos/lint/arquitetura/documentação/formato e evidência real registrados.
      Testes direcionados; validate integral no fechamento do grande bloco.

## Não escopo e continuidade

Sem índice persistido, job, pin, chave ou prosa nova por campanha: C4 permanece
v1–v4. Evoluí-lo antes de persistência dos produtores futuros. Não exportar
tokens/provas/controles no fluxo de payload. Texto próprio mantém seus literais.

Não conclui P3, D, F2-09, Writer V2, política final das perguntas de 199 ou gates
humanos/comerciais. Sem CI, GitHub, push, PR, merge, deploy ou reinício do servidor.
