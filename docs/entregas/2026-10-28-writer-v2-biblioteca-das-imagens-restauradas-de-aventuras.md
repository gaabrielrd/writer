# Writer V2 — biblioteca das imagens restauradas de aventuras

Data: 2026-10-28. Base: 62987b1.
[Plano 185](../tasks/writer-v2/execucao/185-biblioteca-das-imagens-de-aventuras-restauradas.md)
e [ADR 0207](../decisions/0207-adventure-image-library-preparation.md).

## Implementado

A preparação interna instala uma imagem e seu uso por unidade, com preparing,
URL null e useCount 1. Leitores, rename, seleção, exclusão e listagem existentes
mantêm a cópia pendente indisponível como imagem ativa. A origem v2 tipa a
aventura e sua instalação, sem fabricar livro ou ativação. Livros v1 preservados.

Imagem/uso/journals/checkpoint/recibo nascem juntos; ausência e filhos são
conferidos. O selo inicial fica como prova histórica e é invalidado operacionalmente
antes de instalar. Outra auditoria inclui imagens/usos e o contexto da biblioteca.
O replay do selo anterior continua válido após reiniciar os contadores da rodada
final. Cancelamento fecha Storage e remove usos antes das imagens pelos journals.

A preparação física em unidades revisa explicitamente a formulação de 182:
disponibilidade continua posterior à ativação/finalização. Não há teto artificial
de imagens para concentrar todos os writes na última transação, novo endpoint,
dependência, índice ou alteração de Rules.

## Testes dirigidos e SDK

Onze casos Node novos de biblioteca passaram em seleções: quatro em
3.295,135 ms totais, seis em 7.036,860 ms e um replay histórico em
907,640 ms de teste/1.150,743 ms totais. Cobrem nascimento conjunto, preparing,
invalidação/nova auditoria, vazio, CAS/replay, listagem com imagem legada,
presença estrangeira/uso órfão, rollback de recibo, ACK perdido, imagem recriada
e cancelamento parcial/completo.

A primeira instalação encontrou o pai do uso ainda com escopo adventure no
helper genérico; corrigido para preservar o escopo image do endereço. O teste
dirigido reproduziu também a falha de replay do selo inicial contra os contadores
reiniciados; a comparação passou a respeitar o checkpoint nativo dessa fronteira,
mantendo demais barreiras e assertivas. Ambas as reproduções passaram após a
correção; não houve relaxamento de testes ou contagens.

Dois casos Node novos de retirada v2 passaram em 107,614 ms totais, com estados
pendente/publicado, upload atrasado e origem inválida. Onze regressões anteriores
de retirada passaram em 104,411 ms. Três regressões de auditoria selecionadas
passaram em 2.778,092 ms, incluindo geração estrangeira e cancelamento retido.

Um Vitest com arquivo real do Writer passou em 4,05 s totais/1,26 s de testes:
duas imagens da mesma origem tornam-se pares separados de biblioteca/uso,
nascimento conjunto, original intacto, nova auditoria e cleanup com dois fences.

Um SDK integrado Firestore/GCS real passou em 243.759,992 ms totais.
Emulador demo Firestore 1.22.0 em loopback 49505 e servidor GCS HTTP local
confirmaram rollback completo da instalação, concorrência idempotente,
nascimento conjunto de imagem/uso/journal/recibo, estado pendente, listagem
oculta, metadata permitida só ao dono, SDK sem escrita/usos, raiz privada,
replay histórico após reinício da auditoria, nova varredura e cleanup integral.
JVM dedicada encerrada no finally; ausência dos processos conferida depois.
Não é teste em serviços de produção.

## Fechamento do bloco

Formatação, ESLint/sintaxe dos arquivos alterados, docs/arquitetura/styleguide
dirigidos positivos. A revisão confere origem tipada, ausência/filhos, limite
por unidade, visibilidade pendente e preservação de dados estrangeiros/recriados.
O fechamento integral local de 183–185 está registrado ao final. O validate
anterior de 10708fd não é atribuído a este código novo.
Nenhum limite/cobertura reduzido; sem CI, push/PR/merge/deploy ou subagentes.

## Limites

A raiz não é ativada neste incremento e as imagens não são aceitas/publicadas.
Permanecem ativação atômica com reautorização do universo, finalização de mídia
por ativo respeitando desvínculo/retirada, recuperação/UI/roundtrip,
P2/P3/D/F2-09, fases 3–5 e gates humanos/comerciais. Macro 8/35 inalterada.

## Validação integral do bloco 183–185

npm run validate encerrou naturalmente com código 0 em 1.515,26 s.
Passaram skills, arquitetura, documentação, styleguide, formatação integral e
as 32 partições de lint; 4.329 testes frontend em 334 arquivos, 90 scripts e
3.610 Functions. Cobertura statements/branches/functions/lines: 89,94/85,71/91,12/93,24%, com limites preservados.
Sintaxe de 376 módulos das Functions, tipos, bundle e smoke positivos.

Os 18 hashes de código/testes congelados no início foram reconferidos sem
alterações. A revisão final e os checks documentais/diff/preflight são
conferidos antes do commit local com hooks normais. Esse gate fecha somente o
grande bloco local 183–185; os limites e próximos passos desta entrega continuam.
Nenhuma CI remota, push, PR, merge, deploy ou subagente.
