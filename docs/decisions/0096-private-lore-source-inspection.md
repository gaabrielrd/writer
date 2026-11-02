# ADR 0096 — Inspeção privada da metadata lógica do lore

- Estado: aceita para inspeção; adoção de edição continua pendente.
- Data: 2026-10-23.
- Contexto: P1 M38c3d, passo 3b do [plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).

## Problema

Stubs v1 não carregam isPublic e suas datas não substituem o JSON lógico.
Reunir uma base acima de 8 MiB numa transação de adoção ultrapassaria o orçamento.
O cliente não pode declarar a privacidade anterior para decidir revogação.
É necessário obter metadata validada no servidor em unidades retomáveis.

## Decisão

O validador de campo ganha uma entrada de prefixo que para ao terminar um valor.
A entrada anterior continua exigindo o consumo integral da unidade.
bookLoreBaseIndex reutiliza esse parser para uma base v1 fechada: campos
conhecidos, name/category/bookId/createdAt/updatedAt obrigatórios, domínio dos
valores, UTF-8 e JSON canônicos. Datas são inteiros finitos válidos; bookId
deve coincidir literalmente com o escopo autorizado.

Cada unidade aceita até 64 KiB, sem teto total de 8 MiB/128 partes.
O checkpoint contém sintaxe, máscaras, ID esperado e metadata limitada.
Nenhuma string livre ou lista completa é acumulada. O resultado informa
presença, isPublic, datas e ranges de bytes dos campos da base original.
Esses ranges pertencem à base; não são posições dos valores substituídos
por overlays v2 e não podem ser usados como índice da ficha final.
Parser e ranges não constituem autorização nem prova SHA.

O serviço interno cria users/uid/bookLoreSourceInspections/inspectionId
antes da leitura. Início aceita somente livro, ficha, inspectionId e sourceToken.
O servidor fixa nascimento do livro, modo e manifesto da fonte observada.
Não aceita bytes, privacidade ou datas declarados pelo cliente.

Estados são checking, base, privacy, ready e cancelled. Payloads v1 leem uma
parte por unidade, verificando prova nativa/Merkle e SHA integral incremental.
V2 conserva a base e aplica presença/datas do descriptor autorizado; um override
isPublic é lido e conferido numa unidade própria. Inline usa a projeção completa
já validada, limitada pelo tamanho do documento nativo. Geração v2 sem base
não exige criar uma base sintética.

Relações entram somente como presença e contagem. Sua prosa e páginas não são
varridas por esta inspeção de metadata. Alterações de nome/descrição também
não são reenviadas. Fonte e clock permanecem intactos.

Job e recibos guardam metadata, nunca prosa. SHA serializado fica em state/current
privado separado; pode conter bytes do buffer interno e é excluído ao terminar
a base ou cancelar. Algoritmo/ABI ficam fixos, e retry recarrega o estado original
mesmo após digest. Cada mutação usa CAS e recibo/âncora imutáveis com nascimento
pareado e atualização nativa vinculada ao job original.

Reenvio confirma o evento próprio antes de ler novamente a fonte.
Avanço novo reautoriza dono/livro/estado/token da ficha em toda unidade.
Cancelamento independe da autorização atual da origem, limpa estado privado,
conserva recibos/fences e pode preceder o start. Um fence bloqueia início tardio.
Artefatos órfãos desconhecidos são preservados, sem adoção implícita.

ready cria certificado imutável de hashes da metadata/contexto, com o mesmo
nascimento da última atualização/recibo. A abertura interna revalida o job,
certificado e a mesma origem atual. Progresso externo contém só status/contadores,
sem isPublic/datas/ranges, estado SHA ou ponteiros físicos.
Rules negam todo acesso SDK ao namespace; o serviço não tem callable habilitada.

## Limites e próximos passos

O certificado prova a metadata lógica inspecionada sob aquele manifesto/contexto.
Ele não concede leitura nem prova disponibilidade física atual de todos os chunks,
campos ou páginas. Uma parte removida depois da inspeção continua indisponível
ao reader de conteúdo, mesmo que a metadata histórica permaneça confirmável.

A futura adoção deve consumir a abertura interna na transação autorizada,
revalidar artefatos/provas e coordenar referências/leases/inventário antes de
trocar a cabeça, privacidade e clock. Não aceitar o progresso ready como grant
ou como certificação integral dos corpos. Não houve adoção ou raiz ativada aqui.

Criação/exclusão/coleta, coordenação com exclusão do livro, descoberta/recuperação
de operações e integração dos demais writers/cliente precedem habilitação.
Jobs/recibos/certificados privados permanecem até o protocolo de descarte
explicitamente definido; não existe worker automático novo.

## Evidência

A [entrega M38c3d](../entregas/2026-10-23-writer-v2-inspecao-da-origem-do-lore.md)
registra 205 Node distintos e quatro cenários SDK positivos, incluindo 141 partes,
retry concorrente real, revogação, cancelamento e recusa de certificado recriado.
