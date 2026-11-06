# Incremento 30 — contrato portátil do processo editorial

Estado: núcleo puro e testes preparados. A seção editorial ainda NÃO está ligada ao
pacote `.writer`, ao stream de captura, à validação incremental ou à restauração.
Nenhum produtor/formato novo foi habilitado. Não há entrega funcional de portabilidade.

## Requisito e base existente

O item 5.5 do plano exige contrato, decisões, planejamento, evidências, relatórios e
checkpoints, com relações e versões explícitas. A restauração deve criar nova cópia
privada, remapear IDs, indicar fontes indisponíveis e não reativar execução antiga.

A base existente usa `writer-book-archive` versão 1, sete seções, contêiner com selo,
validação semântica incremental e preparação sob reserva/journals nativos, mantendo a
raiz ausente até ativação atômica. Este incremento não muda esses contratos. A futura
seção exige versão nova do pacote, compatibilidade de leitura v1 e atualização completa
dos consumidores antes do primeiro byte de produção.

## Núcleo implementado

`bookEditorialProtocol.mjs` define DTOs fechados, compartilháveis entre servidor e
browser, sem I/O, Buffer, env ou credenciais. Há oito famílias:

| Família    | Conteúdo preservado                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------- |
| contract   | Guia, decisões, substituições, categorias, situações e preferências de colaboração/publicação       |
| plan       | Tipo, título, situação, campos canônicos e finalidade dos vínculos                                  |
| document   | Seções textuais de arquitetura, série, preparação, progresso, guia e manifesto histórico            |
| decision   | Justificativa, classificação, substituição e evidências                                             |
| evidence   | Trecho literal, fonte lógica, intervalo UTF-16 ou ausência explícita, classificação e justificativa |
| report     | Achados, observações, evidências e cobertura declarada na origem                                    |
| checkpoint | Fase histórica, contadores observados, unidade, bloqueio e próxima ação textual                     |
| prose      | Proposta/cópia textual, formato, justificativa e fonte lógica                                       |

Versão, datas originais e ausência de fonte são explícitas. Datas ausentes permanecem
null. Texto preserva BOM, CRLF, Unicode e literais; o codec não traduz ou trunca prosa.
O teto de 8 MiB é físico por item, alinhado ao validador existente, não um limite de
livros, capítulos ou cenas. O manuscrito e o histórico extensos continuam nos streams
próprios; projeções não devem juntar um projeto inteiro em um item editorial.

Campos canônicos foram extraídos para `literaryEditorialFields` e `literaryPlanFields`,
sem alterar seus valores, ordem, limites, normalizadores ou exportações públicas antigas.
O protocolo portátil usa esses registros em vez de criar outro catálogo editorial.

Referências incluem tipo, ID, pai quando composto, escopo, revisão observada, hash de
conteúdo quando realmente conhecido, condição recorded/unavailable e finalidade
source/subject. Não possuem sourceToken, contextToken, jobToken ou caminho físico.
Hashes lógicos não podem ser preenchidos com um token nativo apenas por terem o mesmo
formato hexadecimal. Links independentes preservam relações sem se tornarem grants.

O extrator de referências permite ao futuro host semântico registrar e reconferir
vínculos por índice temporário, sem reter o projeto inteiro em RAM. Ainda faltam as
provas globais de existência/tipo/versão e ciclos entre artefatos.

## Remapeamento implementado

`bookEditorialRemap.mjs` recebe somente contexto do host: livro original, nova reserva,
hash puro e o projetor nativo de IDs. Não aceita contexto operacional vindo do arquivo.

Artefatos, decisões internas, achados e links recebem IDs novos e determinísticos por
cópia. Os recursos de estrutura/lore/histórico/personas/imagem usam o remapeador nativo
existente; marcos conservam identidade do pai. Cadeias de substituição e referências de
evidência acompanham os novos IDs. O original não é alterado.

Universo, biblioteca e outros volumes não são adotados automaticamente, mesmo quando
um ID coincidir. Permanecem indisponíveis até reconciliação. Recurso local ausente fica
como descriptor da origem antiga, sem inventar identidade da cópia.

Todo artefato remapeado recebe política fixa: execução desabilitada, publicação privada,
revisão requerida e natureza histórica. Checkpoints exigem controlsDisabled true e não
aceitam orçamento autorizado, fases autorizadas, recibo, operação pendente ou nonce.
Fase running e custo histórico podem ser preservados como informação, sem continuação
ou nova cobrança. As preferências do contrato não constituem autorização de execução.

## Fronteiras ainda obrigatórias

- Projetar cada família a partir dos campos nativos conhecidos; nunca despejar JSON de
  um job bruto em uma seção textual. Credenciais/recibos/grants não são conteúdo portátil.
- Reautorizar origens e conferir nascimento/versão antes/depois das partes e no fechamento.
  Schema/hash isolados não autorizam exportação de derivado revogado.
- Preservar conteúdo próprio aprovado conforme os contratos existentes. Quando o corpo
  derivado não puder ser lido, emitir ausência tipada, sem copiar cache antigo.
- Parâmetros públicos de geração podem constar apenas como snapshot histórico. Não
  resolvem modelos atuais nem incluem chave BYOK. Exportações reais ainda precisam
  projetar a configuração pública pela origem congelada autorizada.
- Integrar framing v2, oito seções, máquina semântica e índices/ponteiros nativos, mantendo
  leitura dos pacotes v1 e ausência editorial legada explícita.
- Ampliar inventário/cleanup antes de preparar recursos novos; conferir journals e provas
  por unidade, manter raiz ausente, reconciliar e ativar tudo pela transação final.
- Materializar guia/planos utilizáveis e arquivo privado histórico, com relações remapeadas
  e reconciliação visível. Nenhum leitor/gate pode tratar aprovação antiga como atual.
- Conferir relações/EIDs, versões, tipos e ciclos; conteúdo de arquivo não é grant para
  buscar universo, biblioteca ou outro volume.
- Exibir texto de arquivo sem executá-lo; eventual adoção no editor usa o fluxo existente
  de prévia/validação/aceite. HTML portátil não é permissão de renderizar código ativo.

## Testes preparados e estado

20 casos do protocolo e 14 do remapeamento foram escritos. Cobrem paridade dos campos
nativos, planos, Unicode/BOM/CRLF, bytes, ciclos de decisões, escopos, finalidade dos
vínculos, campos proibidos, ausência legada, modelos históricos e nova cópia privada.
Os testes de remapeamento usam `createBookRestoreRemapper.identity` para os recursos,
sem substituir sua fórmula por uma segunda implementação de teste.

Nenhum teste/typecheck/lint/formatter/build/browser/coverage/validate foi executado.
Não houve alteração de formato ativo, API/callable, Rules, inventário, raiz de projeto
ou deploy. A portabilidade completa e a auditoria E1–E5 continuam abertas; 0/5 etapas
formalmente encerradas. Os testes antigos não validam este núcleo novo.

## Captura consistente — evidência que orienta o próximo incremento

O token atual de `readBookBackupSource` deriva da identidade nativa da raiz e do
controle de progresso. Há escritores de checkpoint (por exemplo, finish de
LiterarySequenceDriver e de LiteraryWorkflow) que atualizam job/recibo sem alterar a
raiz. Esse token isolado não prova uma seção editorial inteira estável.

O SDK instalado oferece ReadOnlyTransactionOptions.readTime, mas sua declaração
comenta limite de 60 segundos; a implementação passa o timestamp à leitura. Nenhuma
captura longa por readTime foi implementada ou assumida válida. Antes de escolher esse
contrato, conferir documentação primária e SDK real. Alternativamente, coordenar um
clock próprio com todos os escritores e cleanup/Rules antes de habilitar o produtor,
sem invalidar o próprio mapa por seus writes internos. A captura continua pendente.
