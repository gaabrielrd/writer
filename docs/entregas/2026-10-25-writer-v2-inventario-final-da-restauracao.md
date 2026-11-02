# Writer V2 — inventário final da preparação de livros

## Resultado

O serviço interno advanceBookRestoreAudit congela a preparação completa em
schema13/resources-audit, confere journals e 32 namespaces físicos e termina em
activation-ready. Cada página tem até oito itens; pais de coleções filhas são
autenticados separadamente. Progresso fechado não guarda prosa ou catálogo.

Contexto e âncora fixam origem nativa, destino, validação, layout e contagens.
Journals/recibos/nascimentos são revalidados por unidade. Órfãos, stageKind
remanescente e origens recriadas bloqueiam o avanço sem apagar dados incertos.
Somente job e recibo são escritos. Cancelamento cleanup14 conserva o saldo
exato e o replay histórico confirma sem aplicar novamente.

Raiz continua ausente, countReady false, personas preparando e capa privada.
Nenhuma ativação, nova API callable, Rule, dependência ou permissão foi criada.
Preparações anteriores continuam aceitas; a representação monolítica não migra.

## Testes executados

18/18 Node passaram no lote final bookRestoreAudit.test.mjs, zero skipped,
11924.328 ms. Outros 17/17 de bookRestoreSourceIndexes.test.mjs passaram no
lote dirigido anterior: são 35 casos distintos positivos, não um lote único.

Cobertura observável: preparação completa com fontes/corpos grandes, limite de
página/cursor/leituras, ausência de writes em conteúdo, metadados sem prosa,
fase/conta/CAS, replay/resposta perdida, falha de commit e retry; alvo/journal/
recibo ausente ou recriado, pai aninhado recriado, documento e filho sem journal,
perfil estrangeiro no mesmo escopo e perfil de outra obra preservado.
Cancelamento durante a auditoria e depois de ready fecha criados = retirados +
limpos. Capa PNG com adaptador Storage preserva bytes/metadata e accepted false;
cancelamento instala o fence permanente vazio. Lore monolítico anterior mantém
exatamente sua cabeça/payload schema1.

Na execução inicial, a asserção de metadata recusava campos legítimos do leitor
de lote de personas; foi corrigida para uma lista explícita sem prosa. Outro
esperado comparava Buffer com Uint8Array de structuredClone; foi corrigida só
a representação do esperado. As seleções corrigidas passaram, assim como o
lote final de 18. Validação de sealOperationId foi limitada a 128 caracteres;
progresso fechado e representação antiga passaram também na seleção 2/2.

## Firestore SDK real

2/2 positivos, zero skipped, 225759.1417 ms. Firestore Emulator 1.22.0 verificado,
projeto demo isolado em loopback, serviços/Admin/Rules reais:

1. Preparação, inventário completo, retomada e replay reais; cabeças e controles
   amostrados conservam dados/createTime/updateTime. Dono, outro usuário e anônimo
   não leem a cabeça existente via SDK sem raiz. Cancelamento após ready fecha
   saldo exato; recibo anterior permanece consultável.
2. Recriar journal original da âncora bloqueia a página seguinte e a limpeza.
   Conteúdo incerto e journal recriado são preservados; raiz não aparece.

Scripts/log de reprodução fora do Git: prefixo m39-audit-sdk. O teste de PNG
usa Storage simulado; não é prova de Storage, Auth, Callable ou App Check de
produção. O inventário não promete snapshot contra alterações Admin arbitrárias.

## Verificações e limites

Formato, lint dirigido, arquitetura, documentação e diff passaram. Revisão final
conferiu os caminhos nativos, congelamento, contrato fechado e saldo histórico.
Não houve nova fronteira de UI; Vitest, browser, build e validate global não
foram repetidos. Validate integral permanece no fechamento de P1, conforme
orientação do operador.

Próxima entrega: revisão e ativação atômica do livro; depois composição do host,
roundtrip integral, inventários gerais/writers/exclusão, legados e rollout.
P1/D3/F2-09/V2 e fases 3–5/gates humanos e comerciais continuam abertos.
Padrão de novas gerações indexadas permanece false.

[Plano 132](../tasks/writer-v2/execucao/132-inventario-final-da-restauracao.md) e
[ADR 0152](../decisions/0152-native-restore-final-audit.md).
Somente trabalho local; sem CI, push, PR, merge, deploy ou produção.
