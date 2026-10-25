# Writer V2 — leitura preparada e recaptura do lore (D3 em andamento)

## Resultado

openPreparedBookRestoreLore é um port interno do servidor, aberto por conta,
restoreId e jobToken originais. A abertura e cada operação revalidam job,
reserva/marcador nativos, raiz ausente, content-verified, Counts done e drenagem
done quando existe inventário de payload. Não cria raiz sintética ou concede
leitura pela API normal de um livro ativo.

As operações C1 compartilham validação e transporte com dois ports explícitos.
A composição pública continua com autorização normal de livro; não aceita
autorizador do DTO. No port preparado, cada cabeça listada/lida e cada header,
parte e segmento precisam de journal/recibo original, além de codec/Merkle/
barreiras nativas. Ausência simultânea de cabeça/journal pode retornar null;
cabeça existente sem prova ou com origem recriada falha sem fallback.

Tokens preparados incorporam escopo criptográfico do job. Os hashes e cursores
normais v1/v2 permanecem iguais. O token da lista fixa o checkpoint; cancelar,
recriar origem/provas ou fazer surgir uma raiz bloqueia leituras posteriores.
Transporte não contém jobToken, chaves ou ponteiros físicos.

Com indexedLoreBodies=true, todo lore com índice original validado usa geração
v2, inclusive pequeno. Isso preserva ausência de datas e zero em vez de usar
timestamps físicos como datas portáteis. Prefixos monolíticos iniciados e a
opção false mantêm o protocolo anterior. O padrão permanece false até integração
do host, demais consumidores/roundtrip e habilitação coordenada.

## Evidência Node

**118 casos distintos positivos**: 95 de leitura C1/gerações/tokens anteriores,
com log terminal próprio, e 23 do port preparado. Não é alegação de lote único
verde de 118.

O primeiro fixture mínimo novo usou estado de rascunho absent, que o schema
recusou antes da preparação (o estado correto é none). Corrigido só o fixture;
os testes novos foram repetidos, sem relaxar o validador. Nessa repetição,
18/19 passaram; o teste da reserva usava o caminho de outra capacidade. Corrigido
para bookRestoreReservations e repetidos apenas reserva/segmento: 2/2 positivos.
O teste de segmento também foi corrigido para não enviar field:undefined, que
acionava a validação de DTO antes de alcançar o segmento. Os três contratos
adicionais de ausência/orçamento/job antigo passaram em execução própria, 3/3.
As regressões C1 tiveram 95/95 positivos em execução terminal separada.
Um caso adicional de prefixo monolítico já iniciado passou isoladamente, 1/1:
habilitar o modo indexado não o migra e preserva seus bytes/payload schema1.

Verificações: fichas pequenas com datas ausentes/zero/ambas; campos vazios e
relações ausentes/vazias; protocolo inline anterior com opção false; fase/conta/
destino e tentativa de injetar autorização recusados; paginação e checkpoint
mudado; cabeça/parte/header/segmento/journal/recibo/job/reserva/marcador recriados;
journal ausente, cabeça não inventariada, tokens normais exatos e escopos
distintos; cancelamento, raiz posterior e job antigo sem drenagem recusados.
Uma unidade de campo toca somente uma parte física e não grava dados nativos.

## Cliente real e arquivo

**7 casos Vitest distintos positivos** no arquivo de roundtrip do port preparado.
O lote inicial teve seis positivos e um grande vermelho: o esperado mantinha um
ID local sem ficha, mas o contrato original também remapeia esse ID em cada
cópia. Corrigida somente a asserção de identidade e repetido só o caso grande:
1/1 positivo, com seis não selecionados. O caso pequeno foi depois ampliado aos
sete campos (incluindo false e structuredDetails vazio) e repetido isoladamente.

O caso grande usa campo e descrição individual >8 MiB, 65 relações, duplicados,
BOM/UTF-8 e datas ausentes. O produtor portátil real recaptura o lore preparado;
um arquivo selado completo de fixture mínima é validado semanticamente e
restaurado em segundo job privado. Igualdade de toda a prosa e remap composto
conferidos; ambas as raízes permanecem ausentes. Casos menores verificam datas,
ausências e campos vazios; cancelamento e perda de journal impedem conclusão.

A fixture é um livro mínimo contendo somente lore. Não representa o restante
do livro original e não comprova roundtrip integral de manuscrito/histórico/
mídia/personas ou a UI final de restauração.

## SDK e Chromium

**2/2 SDK positivos**, zero skipped, 139816.1373 ms, Firestore Emulator 1.22.0
verificado, projeto demo isolado/loopback e Admin/serviços/Rules reais:

1. Upload, validação, geração pequena, reconciliação/drenagem e port preparado
   reais; campos/páginas literais, 65 relações e updatedAt zero. Cabeça/header/
   parte confirmados existentes têm leitura SDK negada para dono, outro e
   anônimo. A API normal recusa sem raiz; cancelar revoga a unidade seguinte e
   cleanup fecha o saldo retirados + limpos == criados.
2. Journal original de parte apagado/recriado impede a leitura mesmo com bytes
   físicos válidos e header anterior. Parte, journal recriado e raiz ausente
   são preservados. Não é Auth/Callable/App Check de produção ou piloto humano.

**4 jornadas Chromium positivas**, contexto isolado e somente loopback:

1. Port real preparado -> cliente/produtor portátil reais -> arquivo OPFS selado
   de 8.832.380 bytes -> validador público semântico. updatedAt zero, createdAt
   ausente, BOM/campo grande/aliases duplicados/65 relações preservados, sem Buffer.
2. Após recarga, ficha pequena conserva datas e relações ausentes na recaptura.
3. Cancelar após unidade autorizada impede conclusão; abort do sink OPFS conserva
   o arquivo confirmado anterior.
4. Trocar o ator por outro objeto com o mesmo UID rejeita a resposta obsoleta
   antes de emitir bytes.

O transporte Chromium está ligado ao serviço de produção com banco transacional
simulado. O contêiner de teste mínimo foi montado em memória no harness; isso
não é prova de composição streaming do livro completo pelo host.

## Limites e próximos passos

D3/P1/F2-09/V2 continuam abertos. Integrar host e roundtrip integral do livro,
consumidores/inventários gerais, legados necessários, drenagem/rollout e
habilitação coordenada. O port é interno; nenhum endpoint, namespace, Rule,
dependência, publicação, compra ou grant novo. Padrão de novas gerações false.
Validate integral de P1, fases 3–5 e condições humanas/comerciais continuam.

Formato, lint dirigido, typecheck, arquitetura, documentação e diff positivos.
Validate global e build não repetidos: permanecem no fechamento de P1 conforme
orientação. Escopo, segredos, LF e integridade dos arquivos conferidos antes
do commit local.

Sem CI, push, PR, merge, deploy ou operação de produção. Somente commit local.

## Reprodução

Node: bookRestorePreparedLore.test.mjs e os três testes C1 citados.
Vitest: src/features/lore/tests/bookRestorePreparedLoreRoundtrip.test.mjs.
SDK: tests/firestore/bookRestorePreparedLore.rules.test.mjs.
Scripts/logs QA externos com prefixo m38c12d3-prepared, sem artefatos grandes no Git.
