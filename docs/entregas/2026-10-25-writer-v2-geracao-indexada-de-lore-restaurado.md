# Writer V2 — geração indexada de lore restaurado (D3 em andamento)

## Escopo e resultado

O advanceBookRestoreLore real agora coordena o gravador incremental para gerar
fichas grandes v2 sem base, sete campos independentes e páginas de até 64 relações.
A página termina após o objeto completo, preservando a descrição depois do alvo,
inclusive acima de 8 MiB. A projeção troca somente IDs e delimitadores de páginas;
a prosa, ordem, duplicados e ausências permanecem literais.

Controles de geração e de corpos permanecem nos namespaces privados já
inventariados, com journal/recibo original e verify(tx) da fonte/unidade antes da
escrita. Progresso detalhado não vai para o pedido do cliente. Novo serviço a
cada avanço, replay e cancelamento usam o protocolo de produção. Não regravar
controle sem mudança evita incompatibilidade entre updateTime e journal nativos.

Datas físicas continuam obrigatórias. A metadata portableDates, somente em v2
sem base, preserva datas lógicas ausentes ou zero; C1, leitor lógico, inspeção e
produtor portátil respeitam essa distinção. Os escritores físicos anteriores
mantêm seus invariantes. Resources usa metadata indexada para atravessar lore
grande sem montá-lo integralmente.

## Limite do incremento

A composição interna indexedLoreBodies continua false para novos jobs até
integrar Counts, drenagem e roundtrip. É opção de servidor, recusada no DTO do
cliente; um job já iniciado como streamed retoma mesmo com a opção desligada.
Esta barreira temporária não entrega o caminho grande por padrão e deve ser
removida ou habilitada coordenadamente depois dos consumidores.

Counts ainda precisa comparar fonte projetada e corpos nativos por unidades,
hashes e artefatos comprovados. Drenagem de staging, leitor preparado geral,
recaptura/roundtrip e ativação geral continuam obrigatórios. A leitura lógica dos
testes é harness privado autorizado; não é um novo endpoint nem raiz ativada.

O presente incremento não conclui D3, plano 131, P1, F2-09 ou Writer V2.
Inventário geral/escritores/legados/host/drain/rollout, validate integral de P1,
fases 3–5 e condições humanas/comerciais permanecem.

## Evidência local

**365 casos Node distintos positivos**, não um lote único de 365:

- 285/285 em validação de campos, índice portátil/item, leitura de geração,
  leitura lógica e inspeção da origem.
- 41/41 no lote com lore legado, payload anterior e quatro casos novos.
- Dois casos adicionais dirigidos, 2/2: retomada com opção desligada e Resources.
- 24/24 do transformador/projeção D2 após composição da verificação por unidade.
- 13/13 do leitor de páginas: 1/63/64/65/128/130/1000 relações, descrição acima
  de 8 MiB, Unicode/alvos partidos, troca de contexto e cancelamento.

O gerador novo tem seis casos distintos positivos: campos grandes sem datas/
relações, 130 relações e descrição grande, replay, cancelamento, retomada e
passagem Resources de fonte grande. Cabeça, contagens e leitura lógica conferem.
Os testes antigos mantêm a composição anterior deliberadamente; não foram
reescritos para alegar compatibilidade de representação nova.

**63/63 Vitest** em geração C1 e produtor portátil; typecheck positivo. Cobrem
portableDates vazio, createdAt zero, updatedAt zero e ambas datas presentes,
sem alterar timestamps físicos.

**4 jornadas Chromium positivas**, browser isolado, somente loopback e sem
perfil do usuário: cliente C1 real e produtor portátil preservam campo de
8.800.003 bytes com datas ausentes e com createdAt zero; parser termina a
64ª relação somente após a descrição completa em fonte de 9.902.686 bytes;
recarga retoma a 65ª relação pelo checkpoint limitado. Estado máximo observado
414 bytes, fragmento máximo 65.536 bytes; nenhum Buffer no browser.
O transporte do navegador foi conectado ao serviço real com banco transacional
simulado; isso não comprova Auth/Callable/App Check de produção.

**3/3 SDK Firestore positivos**, zero skipped, 252843.9472 ms, Emulator 1.22.0
com artefato verificado, projeto demo isolado e endereço loopback. O novo fixture
usa upload, validação, estrutura e advanceLore de produção, sem coordenador
sintético de geração:

1. Geração por serviços novos, replay inicial, retomada com novas adesões
   desligadas, duas páginas/65 relações, datas lógicas ausentes e igualdade pelo
   leitor lógico privado. Resources chega a resource-counts sem raiz. Cabeça,
   controle, segmento e chunk confirmados existentes têm leitura SDK negada a
   dono, outro usuário e anônimo; C1 também recusa a ficha antes da raiz.
2. Cancelamento de geração parcial limpa lore, corpos, chunks, segmentos e
   journals do inventário, sem criar a raiz.
3. Controle de geração existente apagado/recriado bloqueia o próximo avanço
   e cleanup, que preservam o documento recriado. Raiz continua ausente.

Não é validação da reconciliação Counts, roundtrip, retry SDK forçado,
Auth/Callable/App Check de produção ou piloto humano.

A revisão automática recusou uma proposta de retirar a verificação explícita
unit.verify(tx). A mudança recusada não foi aplicada; a verificação foi mantida
e o trabalho prosseguiu com essa garantia. Não houve bypass.

Formato, lint dirigido (zero erros; declaração .d.mts ignorada pelo ESLint),
arquitetura, documentação e diff positivos. Typecheck cobre a declaração.
Não executado validate global neste incremento: reservado ao fechamento de P1
conforme orientação. Nenhuma dependência, Rule, endpoint, CI, push, PR, merge,
deploy ou operação de produção. Somente commit local.

## Reprodução dirigida

Executar functions/test/bookRestoreLorePages.test.mjs e
functions/test/bookRestoreLoreStream.test.mjs; os testes de datas ficam em
functions/test/bookLoreSourceInspection.test.mjs e
src/features/lore/tests/bookLoreGenerationRead.test.mjs.
SDK em tests/firestore/bookRestoreLoreStream.rules.test.mjs com Firestore
Emulator verificado, projeto demo isolado e endereço 127.0.0.1.

Scripts e logs de Chromium/SDK ficam na pasta QA externa writer-v2-portability-qa,
com prefixo m38c12d3-generation. Não foram adicionados artefatos grandes ao Git.
