# Writer V2 — estrutura privada da aventura restaurada

Data: 2026-10-27. Base: 6366aba.
[Plano 172](../tasks/writer-v2/execucao/172-estrutura-privada-da-aventura-restaurada.md)
e [ADR 0194](../decisions/0194-adventure-private-structure-staging.md).

## Implementado

advanceAdventureRestoreStructure prepara partes, controle sem parte, cenas/blocos
com corpos nativos e workProgress incompleto. A definição da raiz fica privada
no job; a raiz reservada continua sem ownerId. Studio, APIs autorais e SDK não
disponibilizam o projeto antes da futura ativação.

Lookup findResource autentica o índice e seu sourceItemIndex, a unidade e a fonte.
Cabeçalho/corpo e parte/controle são unidos sem varrer o arquivo inteiro; suas
provas são reconferidas na mesma transação dos targets/journals/checkpoint/recibo.
Texto é preservado exatamente, com hashes/bytes/contagem principal recalculados.
Mantém audiência, arquivo, ranks, referências mapeadas e datas autorais presentes;
reinicia revisões operacionais em 1.

Journals por endereço fechado registram origem/criador/atualizador e hash de cada
target. Nascimento/última versão nativos e efeitos da operação provam o documento.
Não adotar alvo ou filho existente. Replay e conflito de checkpoint não duplicam
escritas; falha transacional desfaz corpo, cabeçalho, journal e recibo juntos.

Cleanup inclui stagingArtifacts/preparedRoot em jobs antigos e novos. Confere
documentos grandes por metadata e efeitos, sem abrir a prosa, e remove target/
journal juntos. Antes de descartar o índice, verifica os namespaces dos heads
mapeados da fonte, inclusive ainda não criados. Órfão conhecido, documento
estrangeiro, recriação, falta de target ou de contagem impede certificação,
preservando conteúdo alheio. Reserva/raiz mínima aposentada permanecem.

O orçamento nativo é mantido em 800.000 bytes de texto/900.000 bytes JSON.
Incompatibilidade de representação falha sem truncamento ou par parcial, conserva
fonte/checkpoint anterior e permite cancelar.

## Testes dirigidos

Sete Vitest novos positivos numa chamada com arquivo nativo do Writer, em
7,25 s totais/5,07 s de testes: uma parte, três cenas e um bloco criam 12 targets
com journals. Texto/hash/bytes/revisão e definição privada conferidos; APIs
recusam autoria prematura. Cleanup remove todos os targets, com metadata de corpo
sem campo content. Inclui replay/concorrência, rollback/retry, alvo estrangeiro,
filho órfão antes de head, journal/target recriado ou ausente e lookup adulterado.

Quatro Node de contrato positivos em 1.094,191 ms: cena arquivada/audiência gm,
texto nativo exato, unidade semanticamente válida acima de 800.000 bytes,
cancelamento durante leitura e definição órfã em job antigo. Um quinto Node
de metadata corrompida passou em seleção própria de 480,785 ms após correção.
São cinco casos distintos; não uma chamada única de cinco casos.

Regressão de transporte/validação: 27 Node positivos em 606,775 ms,
incluindo jobs sem staging e limpeza dos novos namespaces vazios.

Três SDK reais distintos positivos no emulador Firestore 1.22.0 demo local,
179.270,184 ms totais. Comprovam targets/journals com nascimento comum à operação,
cena e corpo reais, progresso incompleto, negação a dono/terceiro/anônimo,
cleanup integral dos targets preparados, replay concorrente, rollback entre
targets e checkpoint e recusa de corpo alterado/journal recriado sem apagá-los.
JVM própria encerrada pelo finally; servidor Vite do usuário preservado.

## Revisão e correções

A revisão acrescentou a conferência dos heads derivados da fonte antes de
descartar o índice: um filho estrangeiro pode existir antes de o head ser criado.
O teste de órfão sem head exige recusa tanto de staging quanto de cleanup,
preservando o dado estrangeiro.

Também foi reproduzida uma falha RED na classificação de metadata corrompida:
staging consultava summary antes da validação desse objeto e propagava TypeError.
A ordem agora valida primeiro os metadados semânticos, devolvendo erro tipado
failed-precondition. A seleção dirigida confirma summary nulo e campo privado
injetado sem retorno de conteúdo.

A fixture Node precisou decodificar Uint8Array como UTF-8 e declarar a presença
explícita de scene-planning, mesmo ausente. O validador independente recusou a
fixture incompleta; a obrigação de produção foi preservada, sem afrouxamento.

## Checks e limites

Sintaxe de 342 módulos de Functions positiva, lint dirigido dos módulos/testes,
formatação, docs/arquitetura/styleguide/diff e preflight acompanham o fechamento.
Nenhuma dependência, permissão SDK, configuração de testes ou callable foi criada.
Servidor HTTP local 5173 respondeu 200; isso não é validação de UI da restauração.

Sem novo validate integral, build, browser/a11y ou Node 22 neste incremento.
O verde integral de 170 é base anterior; ajustes receberam somente os testes
necessários. Nova rodada integral ao fechar o próximo grande bloco de montagem.

structure-ready indica apenas o fim da passagem estrutural. countReady permanece
false; agregados de grupos/blocos, recursos restantes e índices, lore, personas/
imagens, universo autorizado, histórico/draft em versão separada, contadores/audit,
ativação, recuperação cifrada/UI e roundtrip continuam obrigatórios.

As provas são por etapa e por namespaces conhecidos, sem alegar varredura de
caminhos arbitrários ou snapshot atômico contra mutações administrativas externas.
Novas famílias/filhos precisam ampliar prova e cleanup antes de escrever.
P2/P3/D/F2-09, gates humanos/comerciais e 8/35 permanecem abertos.
Somente commit local com hooks normais; sem CI/push/PR/merge/deploy/subagentes.
