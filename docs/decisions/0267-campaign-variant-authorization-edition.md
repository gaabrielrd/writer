# ADR 0267 — Decisão de edição nas variantes retomáveis

- Data: 2026-10-29.
- Estado: aceita para preparação privada.
- Referência: [plano 237](../tasks/writer-v2/execucao/237-retomada-nativa-das-variantes.md).

## Contexto

Uma variante parcial persistia a prova corrente de acesso, com updateTime
nativo de aventura/mundo/ficha. Revogar e devolver permissão à mesma origem
mudava essa prova e impedia qualquer continuação, apesar de o arquivo e
o nascimento da origem permanecerem os mesmos. A reprodução anterior à
mudança confirmou bloqueio após três corpos, preservando o checkpoint.

Jobs/journals já produzidos não guardam a decisão de disponibilidade em
formato que permita converter o hash antigo sem ambiguidade. Relações opacas
e decisões de alvos não podem ser reconstruídas por suposição.

## Decisão

Novas materializações usam authorizationCodec edition-v1 no estado cifrado,
metadata do job e binding de variantWrites. O campo é opcional para leitura
de jobs antigos; ausente significa validação anterior. Codec desconhecido
ou mistura entre estado/job/journal é recusado. O discriminante é interno,
sem aparecer no progresso público ou no conteúdo da campanha.

A decisão persistida vincula arquivo/edição, testemunha ativa, metadata
autenticada da variante, âncora remapeada e disponibilidades dos alvos. Não
inclui timestamps correntes. Relação opaca do arquivo permanece opaca.
Mudança de disponibilidade durante um corpo interrompe a continuação.

Cada tentativa ainda lê autorização atual de origem/alvos antes da prosa.
Prova corrente estrita, incluindo timestamps nativos, é comparada novamente
dentro da escrita. Revogar/devolver durante os mesmos bytes invalida aquela
escrita. Uma nova tentativa revalidada da mesma origem e das mesmas decisões
pode continuar. Recriação de origem ou alvo não herda a autorização.

Audit do journal usa seu codec e autorização atual, uma entrada por chamada.
Root de geração tem decisão estável própria ligada à edição/testemunha ativa.
Bytes, codec do corpo, revisões, hashes e quotas não mudam.

O journal nativo compartilhado recebe bindingOptionalFields, vazio por padrão.
prepare/verify/cleanup incluem somente os opcionais configurados, fechados.
variantWrites valida edition-v1; own/base/anchor preservam o wire anterior.
Seleção de journals pelas âncoras inclui o discriminante para verificar
o mesmo hash/nascimento do recibo; não muda sua decisão de edição.

Jobs legados conservam cifra/journals/recibos e podem terminar enquanto
a prova anterior ainda se valida. Quando uma prova legada parcial disponível
mudou, retornar variant-authorization-restart-required, mantendo conteúdo e
cancel/coleta. Não converter silenciosamente decisões antigas. Nova preparação
explícita é necessária nesse caso; origem negada continua sem autorizar bytes.

## Evidência histórica e consequências

Fixture Brotli foi produzida de be6a8ca antes da mudança e retomada pelo código
antigo. Contém somente dados fictícios, chave pública de assinatura e AES de
teste, sem chave privada de assinatura/credenciais reais. Helper limita
descompressão; o teste não depende do histórico Git. Wire e prefixos já gravados
são conferidos literalmente pelo novo leitor.

A preparação segue privada: geração/bases preparing e campanha pending.
Não concede acesso, compra ou ativação. Mídia/universo organizacional/C4 dos
temporários/auditoria física/ativação/aposentadoria de journals/Estúdio seguem
pendentes. Layouts C4 1–4 intactos; nenhum contrato de arquivo foi alterado.
