# Writer V2 — Bytes da capa no backup (P1 M9)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2, desenvolvimento local.
- **Plano:** [contrato 42](../tasks/writer-v2/execucao/42-midia-autorizada-no-backup.md).
- **Decisão:** [ADR 0053](../decisions/0053-book-cover-bytes.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 continuam abertos.

## Comportamento entregue

- [x] Capturar bytes PNG autorizados da capa gerenciada, com hash e versão fixada.
- [x] Reautorizar livro/biblioteca/uso/objeto antes e depois do I/O.
- [x] Detectar troca de arquivo, metadata, accepted ABA ou revogação.
- [x] Ler hash por stream e partes de até 64 KiB sem juntar a imagem no produtor.
- [x] Distinguir none e legacy-unavailable, sem buscar URL externa.
- [x] Não copiar paths, download tokens, geração Storage, contadores ou grants.
- [x] Conferir hash integral e impedir selo em corrupção ou prova alterada.
- [x] Oferecer comando local reproduzível com Firestore e Storage.
- [ ] Schema integral, arquivo persistente, revisão e restauração completos.

Arquivos: contrato/projeção de capa, adaptador Storage, três leituras servidor,
headers/dispatcher/check Functions, gerador/adapter/API pública book-portability,
testes Functions/cliente/Storage, runner test:media, README e documentação.
Nenhuma dependência/Rules/coleção nova ou escrita de conteúdo do livro.

## Resultados reais

Functions **12/12**, 122 ms: quatro de streams/ranges e oito de autorização/
captura. Cobre metadata privada, CRC32C/generation, range inclusivo, excesso/
truncamento/erro, uso/path/contador, revogação após I/O, metageneration/ABA,
PNG/tamanho, argumentos fechados e cabeçalhos. Streams destruídos em sucesso/erro.
Hash de parte usa SHA-256 dos bytes, distinto do digest canônico de objetos.

Cliente primeiro **9/9**, 2,72 s. Com adaptador e regressão de callables:
**17/17**, dois arquivos, 2,75 s. Cobre **16 MiB/256 partes** sem reter partes
no consumidor desse caso, ausência/legado, manifesto/partes/hash/assinatura,
pressão de consumo, abort/contexto/retorno antecipado e falha sem retry.
Corrupção integral deixa M2 sem selo.

A primeira prova do SDK Storage interrompeu por falta de registro do emulador
no harness privado; corrigido o registro, sem alterar produto. Probe seguinte
passou: Storage SDK real, PNG de 470 bytes, hash e range inclusivo de 32 bytes.
Runtime Storage 1.1.3 em cache teve tamanho/SHA-256 conferidos; Firestore 1.22.0
também verificado. Emuladores privados usam somente loopback/projetos demo.

SDK conjunto **5/5**, 8,42 s; comando público novo **npm run test:media**
repetiu os cinco casos com sucesso, 8,72 s, saída 0. Usa writer real de biblioteca/
vínculo e Storage SDK/Rules reais; confirma uso/contador, bytes, CRC, hash, ranges,
troca de generation, accepted/metageneration ABA, leitores próprios/alheios/
anônimos, remoção bloqueada em uso, desvinculação e revogação após range.
Sem skips/retries. Suite separada em tests/storage evita exigir Storage na
descoberta Firestore-only existente, sem mascarar precondições com skips.

Chromium com Firestore+Storage reais no emulador: **20 cenários em um probe**,
25,81 s. Compõe M3b–M9 em **168 registros e 1.461.344 bytes** de fixture.
Capa PNG de **367.074 bytes em seis partes**, decodificada pelo navegador em
1200x1800, com hash Web Crypto independente. Mantém 58 versões, lore, personas,
universo e rascunho. Troca da imagem com livro imóvel e revogação depois do range
impedem selo. Zero erros de runtime do navegador e requisições externas bloqueadas.

## Checks, revisão e avisos reais

Build/typecheck/bundle/smoke, arquitetura e sintaxe Functions passaram.
Lint dirigido identificou throw em finally do runner e asserção de tipo
desnecessária; corrigidos. O runner passou checagem privada de códigos 0/3
e limpeza apenas de suas configurações. Lint/formato/links/diff conferidos antes
do commit, hooks preservados. Sem repetir suite ampla por ajustes de lint.

Leituras Storage emitiram MaxListenersExceededWarning. Repetição dirigida com
trace passou e localizou adição de listeners na pipeline interna de
teeny-request 11.0.1 usada por @google-cloud/storage 8.4.0. Não houve supressão/
aumento do limite nem alteração da dependência. Destruição dos streams próprios
é testada; ausência de vazamento em produção não foi demonstrada.
Após os cinco testes positivos e a parada dos emuladores, o CLI registrou
NullPointerException no encerramento por EOF do runtime Storage Java 1.1.3;
o comando encerrou em 0. Não tratar isso como falha funcional corrigida.

Build mantém avisos conhecidos de chunks e imports estáticos/dinâmicos de
workHistoryCallables/exportDocx. Auditoria M4 tem três moderados preexistentes;
não houve nova auditoria ou alegação de audit verde. Validate completo continua
para fechar P1. Nenhuma CI consultada/disparada, push, PR, merge ou deploy.

## Limites e continuidade

Ponte HTTP nativa fixa UID de teste; autorização tem prova SDK/Rules distinta,
sem alegar Auth/App Check produtivos. Vínculo de capa do probe BOM é fixture Admin;
writer normal tem prova SDK separada. Fixture acumula frames/Blob pequenos para
asserções e decodificação, sem representar sink final, disco ou UI do produto.
Contrato usa PNG aceito produzido pelo servidor; validação/importação de imagem
do arquivo na restauração ainda será implementada.

Capas legadas por URL têm ausência explícita de bytes. Imagens não são inferidas
de URLs na prosa. Livro atual tem capa gerenciada; ilustrações de aventuras são P2.
Schema/leitor legado, sink persistente, revisão, preparação/remapeamento/
ativação/cleanup/recuperação ainda faltam. Não fecha P1 ou tarefa ampla da V2.
