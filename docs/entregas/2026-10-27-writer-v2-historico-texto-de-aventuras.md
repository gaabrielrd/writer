# Writer V2 — histórico e texto do rascunho da aventura

Data: 2026-10-27. Base: 3cb9e5d.
[Plano 175](../tasks/writer-v2/execucao/175-historico-e-texto-do-rascunho-de-aventuras.md)
e [ADR 0197](../decisions/0197-adventure-streamed-history-draft-staging.md).

## Implementado

O serviço interno monta versões históricas em partes UTF-8 nativas, por frame
autenticado, com estado privado retomável. SHA/UTF-8 completo precede o manifesto
da versão; conserva motivo, data, label, hash e wordCount fonte, remapeando
recurso/ID e recalculando partes. Mantém também versões vazias e histórico de
recurso já ausente, sem recriar uma cena/bloco ativo.

O rascunho explícito tem texto separado sob ID exclusivo de versão recuperada.
Descriptor privado preserva origem/baseRevision/savedAt/hash/partes e confirma o
corpo salvo antes de prosseguir. O manuscrito não é alterado. O descriptor ainda
está pending-finalization: wordCount exato e manifesto nativo do draft continuam
na próxima etapa, antes de disponibilizá-lo como versão. Não há metadado fictício.

Origem do universo fica somente como candidata privada pendente de autorização,
sem copiar mundo ou conceder acesso. history-ready encerra a passagem textual;
raiz mínima continua sem ownerId, controle de palavras incompleto e biblioteca/
ativação indisponíveis. A auditoria seguinte ainda precisa reabrir os targets.

Estado raw/checkpoint/tail pertence ao host e só é retomado depois de provar
journal/hash/versão nativa. Transação reconfirma provas e confirma partes/estado/
checkpoint/recibo juntos. A view contém somente contadores e indicador de
pendência. Cleanup inclui os novos endereços, sem adotar ou remover estrangeiros.

## Testes dirigidos

13 Node novos positivos em uma chamada de 7.521,111 ms. Cobrem UTF-8 cortado,
BOM, vazio, partes legais e buffer limitado, manifesto somente ao final,
retomada após recarga, histórico sem cena ativa, draft separado com manuscrito
intacto, replay/concorrência, rollback/retry automático, cancelamento durante
leitura, prefixo alterado/ausente/journal recriado, corpo estrangeiro e metadata
fechada. Um arquivo maior com mais de 50 frames confirma texto exato e cleanup
em páginas de sete. Não houve limite reduzido para facilitar os testes.

Seleção conjunta posterior: 78 Node positivos em 10.178,065 ms, incluindo os
13 novos, profiles/resources/structure/transfer/validation e raw reader afetados.

Dois Vitest novos com arquivo gerado pelo Writer e serviços reais, 7,62 s totais/
1,77 s de testes. Criam versões manual e before-restore, versão vazia e draft de
cena/bloco, conferindo contratos nativos, texto/hash/metadata e limpeza integral.
Após reforçar o validador, regressão conjunta de histórico/profiles passou:
quatro Vitest em dois arquivos, 7,25 s totais/3,85 s de testes.

Três SDK reais positivos no Firestore 1.22.0 demo local, 242.299,071 ms totais:
conteúdo Unicode/draft, corpo salvo sem atualização, leitores nativos e negação
de SDK a dono/terceiro/anônimo; rollback entre estado/partes/checkpoint,
replay/concorrência; prefixo adulterado recusado tanto na retomada quanto na
certificação de cleanup, preservando o dado. JVM própria encerrada pelo finally.

## Revisão e correções

A revisão tornou o estado privado fechado também para header/raw/correspondência
entre unidade e fase. O teste reproduziu a rejeição indevida de cabeçalho:
o guard usava restore-... para a raiz, cujo contrato real é restore-a-....
Corrigido o guard; os 13 Node e quatro Vitest acima passaram depois. Nenhuma
identidade de raiz foi alterada para acomodar o teste.

A geração do fixture SDK teve uma falha de sintaxe em expressão de preparação,
corrigida antes de iniciar o runner. Lint encontrou variável sem uso no teste de
metadata; sua atribuição foi removida mantendo a preparação observada.
O teste e as regressões relevantes já haviam passado; lint do escopo foi repetido.

A escrita é limitada: até duas partes por avanço, cada uma até 64 KiB; buffer
remanescente menor que uma parte e estado privado até 100.000 bytes serializados.
Todo texto fica fora de view/recibo. Essa privacidade não é a futura recuperação
cifrada de rascunhos no navegador, que ainda possui etapa própria.

## Checks e continuação

Sintaxe de 350 módulos de Functions positiva e ESLint/formatação de 15 módulos/
testes positivos. Checks de docs/arquitetura/styleguide/diff e preflight acompanham
o fechamento, com escopo/HEAD/index/UTF-8/LF/tamanho/segredos/hashes e hooks normais.

Sem novo validate integral, build, browser/a11y ou Node 22 neste incremento.
O verde integral de 170 é base anterior; a rodada integral continua no fechamento
do bloco maior, conforme orientação do operador.

Finalização do draft, universo autorizado, integração de personas, mídia,
agregados/audit/ativação, recuperação cifrada/UI e roundtrip permanecem obrigatórios.
P2/P3/D/F2-09, fases seguintes, gates humanos/comerciais e macro 8/35 seguem abertos.
Somente commit local; sem CI/push/PR/merge/deploy/agentes. Dev server preservado.
