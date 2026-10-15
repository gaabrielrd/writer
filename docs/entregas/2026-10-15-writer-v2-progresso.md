# Writer V2 — Estados editoriais, metas e retomada

- **Data:** 2026-10-15
- **Branch:** `codex/writer-v2`
- **Plano de origem:** [F2-04](../tasks/writer-v2/execucao/10-estados-metas-e-retomada.md)
- **Estado:** implementado em `7988fb7`; correção de integração validada localmente, nova CI pendente

## Objetivo

Ajudar autores e mestres a reconhecer o próximo trabalho, acompanhar o tamanho
atual do manuscrito e organizar a preparação privada, sem publicar materiais ao
alterar seu estado editorial.

## Funcionalidades entregues

- **Estado editorial:** livros e aventuras distinguem Rascunho, Em revisão e Pronto
  da publicação; campanha conserva seu próprio ciclo de trabalho.
- **Meta total:** palavras do manuscrito composto, com meta opcional e números reais
  mesmo acima de 100%. Edição, remoção, conversão, arquivo e restauração ajustam o
  total; preparação anterior pode ser verificada e retomada sem baixar toda a prosa.
- **Preparação:** checklist privado em aventuras e campanhas, com título, edição,
  conclusão, reabertura, remoção, filtros e paginação com totais globais.
- **Retomada:** Estúdio oferece o último projeto, capítulo ou cena autorizados.
  Recurso removido retorna ao projeto com aviso; perda do projeto não conserva
  título ou navegação privados. Visitas não alteram datas/revisões do manuscrito.
- **Fuso:** preferência por usuário, inicialmente do dispositivo, preservada diante
  de outro dispositivo. A meta total não reinicia por horário ou período.
- **Conflitos e respostas perdidas:** comparação explícita preserva o preenchimento.
  Salvamento confirma o pedido incerto antes da edição seguinte, sem usar uma base
  remota para sobrescrever outro dispositivo. Importação conserva pedido/recibo e
  seleção após iniciar, inclusive se a primeira resposta não chegar.

## Critérios de aceite

- [x] Estado editorial separado de publicação e projeções públicas.
- [x] Total canônico ajustado atomicamente pelos escritores e checkpoint retomável.
- [x] Checklist com revisão por tarefa, paginação e totais autorizados.
- [x] Preferência/retomada privadas, CAS e respostas tardias isoladas por conta.
- [x] Validate integral, cobertura, tipos, build e smoke verdes.
- [x] QA completo nos três temas, teclado e 320 px.
- [x] E2E de produção local com os gates existentes preservados.
- [ ] CI do novo SHA.
- [x] Commit `7988fb7` e envio ao PR em rascunho; correção seguinte descrita abaixo.

## Arquivos alterados

| Área                                                     | Mudança                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/work-progress`                             | Modelos, serviços, hooks e painéis públicos da feature                                  |
| Páginas de livros/aventuras/campanhas/Estúdio e editores | Progresso, preparação, retomada e estado editorial                                      |
| `books/services`, importação e autosave                  | Escritores protegidos, base observada e confirmação de resposta incerta                 |
| `functions/src/workProgress*.mjs`                        | Autorização, contratos, preferências, atividade, checklist, ledger e escritores legados |
| `functions/src/visibleWordCount.mjs`                     | Contador canônico de texto visível com `parse5` explícito no servidor                   |
| Escritores de cenas, jobs e aplicação de IA              | Atualização de contribuição no commit do conteúdo e limpeza dos recursos                |
| `firestore.rules` e `firestore.indexes.json`             | Campos/coleções privados protegidos e consultas paginadas                               |
| Testes colocalizados, Functions, regras e `e2e/visual`   | Comportamento, paridade, concorrência e interface                                       |
| README, arquitetura, testes, AGENTS e ADR 0028           | Contratos, regras verificáveis e limites reais                                          |

## Testes

Os dirigidos são subconjuntos da suíte integral; suas contagens não devem ser
somadas ao total de testes.

| Evidência                                 | Resultado observado         | Cobertura                                                       |
| ----------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| Frontend integral                         | 151 arquivos / 1.361 testes | Features novas e regressões existentes                          |
| Scripts                                   | 77/77                       | Ferramentas e portões do projeto                                |
| Functions integral                        | 220/220                     | Serviços, contratos, escritores e contador                      |
| Frontend dirigido da feature/integrações  | 158/158                     | Metas, checklist, fuso, retomada, troca de conta e conflitos    |
| Escritores/autosave/organização dirigidos | 75/75                       | Base observada, fila, ativação concorrente e respostas incertas |
| Importação dirigida                       | 17/17                       | Recibo estável e seleção preservada após resposta perdida       |
| SDK real / emulador                       | 83/83                       | Autorização, regras, ledger e interleaving com escritores       |
| Corpus de paridade                        | 69 entradas                 | Mesmo texto visível no servidor, JSDOM e Chromium               |

QA final após a correção do cursor: **90/90 diretos**, 145,32 s (a rodada anterior
também passou 90/90 em 149,72 s), seis projetos, dois workers, retries 0,
sem falhas, skips ou flaky. As 69 entradas nativas por projeto pertencem a esses
90 casos; não são uma suíte adicional de 414 testes. Nove capturas de meta,
checklist e retomada em 320 px foram revisadas pela raiz nos três temas; barra
usa a cor semântica e o cabeçalho acompanha o total após verificação. A captura
de retomada também foi conferida na resolução original, sem corte horizontal.

Produção local: **6 passaram / 1 skip preexistente**, 14,7 s, configuração intacta,
um worker e retries 0. O skip conserva a ausência da referência visual Windows do
styleguide; não foi convertido em aprovação. Navegação, três temas, preferência
do sistema e menu/tooltip do modal passaram no bundle real.

O controle SDK verifica B confirmado, edição E de outro dispositivo e replay de B:
o servidor recusa o recibo antigo sem mudar capítulo E, total, controle ou recibos.
Escolher a versão salva conserva a base A; uma edição C posterior não usa o hash
do rascunho B descartado. O total pode ser atualizado com o painel aberto sem
rebasear a revisão CAS nem apagar meta/estado em preenchimento.

### Controles negativos e correções

- Duas regressões de salvamento reprovaram antes da correção: B aplicado/resposta
  perdida seguido de C e duas respostas perdidas seguidas de D. Depois passaram
  com replay exato dos próprios pedidos e controles de edição externa/troca de conta.
- A movimentação de Sem capítulo para capítulo revelou seleção incorreta da revisão
  de origem: 81/82 no emulador antes; após corrigir a origem nula, 82/82. O controle
  adicional de replay externo elevou a suíte real para 83/83.
- Importação com primeira resposta perdida revelou seleção/título ainda editáveis;
  o controle dirigido reprovou antes e passou depois de preservar a seleção iniciada.
- A primeira validação integral teve 1.360/1.361: uma asserção antiga não esperava
  `creationId`. O título e a prosa continuaram obrigatórios após atualizar o contrato.
- A rodada seguinte passou frontend e scripts, mas foi interrompida antes de concluir
  Functions/build; não foi registrada como validate integral verde.
- Smoke visual inicialmente teve seletor de publicação incorreto; após comparar o
  badge visível, passou. Desktop teve ambiguidade entre região e combobox de fuso;
  o controle dirigido passou com papel/nome exatos. Relatórios negativos preservados.
- A revisão dos pixels encontrou barra nativa verde; o CSS passou a usar tokens do
  tema também nos pseudo-elementos de progresso. Capturas finais confirmaram a correção.
- A comparação paginada do checklist podia repetir um cursor vencido se a lista
  mudasse entre páginas. O teste fortalecido reprovou em 19/20 antes; a correção
  reinicia somente a leitura após conflito, preservando título e revisão observada.
  A feature passou 72/72 depois da correção. Validate integral e os 90 casos visuais
  foram repetidos e passaram nesse snapshot.

## Validações executadas

Em 2026-10-15, `npm ci --prefix functions` instalou 251 pacotes, auditou 252 e
reportou zero vulnerabilidades. O aviso de engine Node 22 versus runtime local
24 permanece; o CI verifica ambos. Nenhuma dependência de frontend foi acrescentada.

`npm run validate` terminou com exit 0:

```text
Test Files  151 passed (151)
Tests  1361 passed (1361)
Duration  133.36s
All files | 93.11 | 86.46 | 92.01 | 95.34
Scripts: tests 77; pass 77; fail 0
Functions: tests 220; pass 220; fail 0
built in 2.05s
Smoke test do bundle OK.
```

Arquitetura, documentação, styleguide, formato, lint, cobertura, sintaxe de todos
os módulos novos, tipos e build passaram, sem reduzir limites. Avisos existentes
de tamanho do bundle e importação dinâmica de DOCX permanecem.

Depois da correção do cursor, o validate integral foi repetido com exit 0:
151 arquivos / 1.361 testes frontend em 111,94 s, 77 scripts, 220 Functions,
cobertura 93,13 / 86,47 / 92,01 / 95,35 e build em 1,16 s, com smoke verde.
O backend/regras permaneceu idêntico ao snapshot SDK 83/83; a mudança atingiu
somente a recuperação da consulta no diálogo e fortaleceu um teste existente.

Revisões independentes de backend, frontend e integração não encontraram P0–P2
remanescente nos caminhos conferidos. As provas de navegador e CI conservam seus
próprios portões; fixture não comprova autorização ou persistência reais.

## Correção de integração — 2026-10-15

A [CI de `7988fb7`](https://github.com/gaabrielrd/writer/actions/runs/38695798057)
aprovou validate em Node 22/24, auditoria e produção (7/7 no Linux). As
[regras reais](https://github.com/gaabrielrd/writer/actions/runs/38695798053)
passaram 83/83. A suíte visual reprovou e não foi considerada concluída.

O Estúdio havia perdido os filtros Rascunho/Pronto das aventuras ao separar
estado editorial de arquivo. A correção oferece Rascunho/Em revisão/Pronto em
livros e aventuras, independentemente da publicação/condição de arquivo, e
conserva o ciclo das campanhas. O estado atual prevalece sobre o status legado;
documentos antigos continuam representados sem alterar seus manuscritos.

O servidor filtra janelas limitadas de metadados sem corpos e usa a última fonte
examinada no cursor, vinculado à conta e aos dois filtros. A interface atravessa
janelas vazias com carregamento e cancelamento por conta/filtro; falha ao carregar
mais conserva os itens e permite retry. Nenhuma quota de projetos foi criada.

Os traces também comprovaram roteiros que agiam antes da transição de página ou
recurso: editar o marco anterior ao voltar ao arco, procurar título da obra ainda
no Estúdio e assumir que End focava Arcos depois da inclusão de Progresso. Os
controles agora aguardam o recurso correto e provam a nova aba, com papéis e nomes
acessíveis exatos. Não houve aumento de timeout/retries ou uso novo de `.first()`.

Validação da correção, com exit 0 em `npm run validate`:

```text
Test Files  152 passed (152)
Tests  1380 passed (1380)
Duration  133.84s
All files | 93.16 | 86.56 | 92.03 | 95.36
Scripts: tests 77; pass 77; fail 0
Functions: tests 224; pass 224; fail 0
built in 1.49s
Smoke test do bundle OK.
```

- SDK real: 85/85, zero falhas/skips, 26.891,52 ms; casos novos conferem as
  janelas vazias, estado atual/legado, projeção de metadados e escopo dos cursores.
- Frontend dirigido: 39/39, incluindo resposta tardia, troca de conta/filtro,
  cancelamento durante preparação e continuação após erro. São parte dos 1.380.
- Navegador: 24/24 diretos, 67,895 s, seis projetos, dois workers e retries 0.
  O cenário original continua exigindo exatamente um Rascunho e campanhas
  independentes; acrescenta revisão além da primeira janela e publicação separada.
- Uma rodada anterior desses controles passou 18/24: os seis restantes revelaram
  ambiguidade entre Tipo de projeto e Retomar tipo de projeto. O combobox exato
  corrigiu o roteiro; relatórios negativos preservados.
- Seis controles adicionais passaram em 24,764 s para enquadrar os filtros nas
  capturas 320 px. A raiz revisou livros/aventuras nos três temas, com ambos os
  controles legíveis. Esses controles são repetição de um cenário, não novas jornadas.
- Produção local: seis passaram e um skip preexistente Windows, 18,1 s, um worker,
  retries 0 e configuração preservada.
- A repetição dos percursos de progresso passou 90/90 diretos em 149,87 s,
  seis projetos, dois workers e retries 0, sem falhas/skips/flaky. A CI do próximo
  SHA permanece pendente.
- Revisão estática independente do frontend e revisão da integração não encontraram
  P0–P2 nos caminhos conferidos. Fixtures não substituem SDK/regras reais.

Arquivos desta correção: serviço e testes de Estúdio em Functions/SDK, tipos e
serviços públicos de books/adventures, hook/seção do Estúdio, testes colocalizados,
fixtures e três roteiros visuais, arquitetura, testes, ADR e contrato de execução.
`npm ci --prefix functions` foi repetido: 251 pacotes instalados, 252 auditados,
zero vulnerabilidades; o aviso local Node 24 versus engine 22 permanece.

## Fora do escopo

Metas diárias, calendário, prazos, ranking, notificações, sessões jogáveis,
histórico/restauração integral, comércio e lançamento público do Writer V2.

## Limitações e pendências conhecidas

O incremento exige implantação conjunta das funções, regras e índices antes do
uso real. Não houve deploy ou integração na master. Pilotos humanos, Connect,
contratos e ensaio comercial continuam nas entregas próprias. O próximo incremento
pode começar após os gates locais: em 2026-10-15, o operador autorizou acompanhar
a CI em paralelo. A correção foi enviada em `16e71f6`; sua aprovação remota
permanece distinta da validação local.

## Como verificar manualmente

1. Abrir livro e aba Progresso; verificar o manuscrito, definir meta e marcar Pronto.
   Conferir o indicador de publicação independente e a barra limitada com total real.
2. Editar/importar, atualizar a contagem e conferir os campos ainda em preenchimento.
3. Em aventura/campanha, criar, editar, concluir, reabrir e remover tarefa; filtrar e
   carregar mais páginas, mantendo totais globais.
4. Abrir capítulo/cena/campanha, voltar ao Estúdio e continuar o recurso. Retirar a
   origem e confirmar o retorno seguro ao projeto ou a indisponibilidade genérica.
5. Salvar um fuso, voltar/recarregar e conferir a preferência; repetir a navegação
   por teclado em 320 px e nos temas claro, escuro e sépia.
