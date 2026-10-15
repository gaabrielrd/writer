# Writer V2 — Blocos, ilustrações e prévias de aventura

- **Data:** 2026-10-15
- **Branch:** `codex/writer-v2`
- **Estado:** Validado localmente; enviado em `a3150a3`, CI do novo head pendente
- **Planos:** [Blocos narrativos](../tasks/writer-v2/execucao/12-aventuras-e-blocos.md),
  [Ilustração e prévia](../tasks/writer-v2/execucao/13-imagens-e-previa-de-aventura.md)

## Objetivo

Preparar uma aventura com vários textos e públicos na mesma cena, conservando a
prosa existente e permitindo conferir o que Mestre e Jogadores receberiam. A
prévia continua privada do criador e não publica nem compartilha o conteúdo.

## Funcionalidades entregues

- Texto principal preservado e blocos adicionais com texto, tipo e audiência próprios.
- Privado do criador como padrão de conteúdo novo e legado sem classificação.
- Ordem manual, duplicação sem ampliar audiência, arquivo/restauração e exclusão explícita.
- Contagem individual e total da cena, integrados à meta e ao ledger existente.
- Consulta de situação e reparo explícito paginado quando o agregado impede abrir a cena.
- Histórico por bloco, com cópia anterior e restauração só do texto, conservando audiência/imagem atuais.
- Ilustração da biblioteca, com texto alternativo e legenda, no principal e adicionais.
- Prévia Original completo, Mestre e Jogadores, com paginação e mídia autorizada no servidor.
- Recuperação do mesmo pedido após resposta perdida, reserva de escrita e comparação de conflito.
- Indicação de usos na biblioteca cobrindo capas e ilustrações de aventuras.

## Critérios de aceite

- [x] Aventura independente reúne vários blocos na mesma cena sem simular um livro.
- [x] Novo/legado privado; mover ou duplicar conserva audiência.
- [x] Texto principal, adicionais, contagens e histórico mantêm suas identidades.
- [x] Referências existentes de universo continuam autorizadas na cena; não há cópia automática de fichas.
- [x] Prévia recebe só os itens permitidos, sem fichas, atributos de lore, títulos de agrupadores ou URLs permanentes.
- [x] Imagem vinculada tem uso/exclusão/cópia/replay transacionais e revogação após I/O.
- [x] Edição após ilustração/restauração usa a base confirmada e não sobrescreve texto remoto silenciosamente.
- [x] Temas, teclado, celular e 320 px verificados no navegador.
- [x] Validate e checagem de produção locais passaram; revisão independente sem bloqueadores restantes.
- [ ] CI do novo head verde; implantação, pilotos e habilitação comercial não estão comprovados por esta entrega.

## Arquivos alterados

| Área                                                                                         | Mudança                                                           |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/adventure-blocks`                                                              | Modelos, serviços, recuperação, editores de texto/imagem e prévia |
| `src/features/scenes`, `src/app/routes`                                                      | Principal compatível, recuperação do agregado e rota do adicional |
| `src/features/manuscript-history`                                                            | Identidade block, total de aventura e aviso da audiência atual    |
| `functions/src/adventureBlocks*.mjs`, `adventureBlockImages.mjs`, `adventurePreview*.mjs`    | Escritores, projeção e mídia                                      |
| `functions/src/scenes.mjs`, `workProgressLedger.mjs`, `workHistory*.mjs`, `imageLibrary.mjs` | Integrações transacionais                                         |
| `firestore.rules`, `firestore.indexes.json`, `functions/src/index.mjs`                       | Fronteiras privadas, consultas e callables                        |
| `e2e/visual`, `vite.visual.config.ts`, testes colocalizados/SDK                              | Jornadas e transporte local isolado                               |
| `.github/workflows/ci.yml`, `scripts/ci-contracts.test.mjs`                                  | Oito shards mantendo todos os portões e limites                   |
| `AGENTS.md`, README e documentação                                                           | Regras, contratos, arquitetura e ADR 0030                         |

## Testes e validações executadas

`npm ci --prefix functions` passou. A primeira tentativa de validate parou no
lint de um teste que devolvia o booleano de acceptMetadata ao act. O callback foi
corrigido sem mudar o produto; as suítes ainda não tinham executado. A tentativa
final de **`npm run validate` terminou com exit 0**, incluindo todos os portões.

```text
Test Files  158 passed (158)
Tests       1477 passed (1477)
Duration    112.91s
All files   91.45 statements | 84.82 branches | 90.52 functions | 93.84 lines
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ tests 258
ℹ pass 258
ℹ fail 0
✓ built in 1.26s
Smoke test do bundle OK.
```

| Validação                    | Resultado real                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| SDK novo de blocos           | 4/4, 15.489,174 ms; concorrência, contagem, histórico, ordem e regras privadas   |
| SDK de recuperação sem cache | 1/1, 3.217,6581 ms; situação autêntica antes do reparo explícito                 |
| SDK de ilustração/prévia     | 4/4, 10.940,8635 ms; usos, corrida com exclusão, segredo, bytes e revogação      |
| Chromium integrado           | 78/78, 146.174,08 ms; zero skips/falhas/flaky, dois workers, retries 0           |
| Chromium de produção         | 6 verdes e um skip Windows preexistente de referência visual; 14,4 s, retries 0  |
| Contratos da CI              | 8/8 dirigidos; novamente incluídos nos 77 scripts do validate                    |
| Enumeração dos oito shards   | 948 IDs únicos, 119/119/119/119/118/118/118/118; zero omissões/duplicatas        |
| Capturas de 320 px           | Pixels conferidos nos três temas; foco e ausência de overflow também verificados |
| Revisões independentes       | P1/P2 corrigidos e relidos; nenhum bloqueador restante no escopo revisto         |

Os SDKs acima foram execuções dirigidas separadas, não uma execução local da suíte
inteira de regras. Unitários protegem também 800.000 bytes escapados, orçamento de
4 MiB sem salto/truncamento, whitelist de HTML, usos coexistindo com capas e mídia
WebP sem metadados. A prévia filtra antes de ler corpos secretos. Testes de navegador
substituem apenas transportes; não comprovam credenciais ou ativação em produção.

A revisão reproduziu adoção indevida de revisão no adicional: metadados com outro
hash mantinham prosa antiga e podiam liberar sua gravação sobre texto remoto. O
teste negativo falhou antes; hash confirmado, conflito e comparação explícita
corrigiram a cadeia. Outra correção invalida a lista após restaurar, sem inventar
revisão de cena ou adotar nova base de prosa.

Ensaios nativos intermediários passaram 1/6, 3/6 e 2/3 enquanto bootstrap/retenção
StrictMode da fixture e seletores do teste eram corrigidos. O último caso de teclado
passou 1/1 aguardando cada foco real do menu. A matriz final 78/78 conserva todas as
asserções de privacidade, readonly, teclado e recuperação. Nenhum timeout foi ampliado.

## Ajuste da CI

O commit `a3150a31ba6eccf6719fdbfc88f7adb381aa1fe2` foi enviado ao
[PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21). Hooks mantidos:
pre-push confirmou tipos e 1.477 testes em 158 arquivos, 102,57 s. O SHA remoto
foi conferido com ls-remote. [CI](https://github.com/gaabrielrd/writer/actions/runs/38715097202)
e [regras](https://github.com/gaabrielrd/writer/actions/runs/38715097104) terminaram.
Validate Node 22/24, auditoria, produção (7/7) e regras reais (99/99, sem skips)
passaram. Sete shards visuais passaram; o shard 6 falhou no histórico de capítulo,
tema sépia: depois de restaurar e desfazer, refazer não recuperou o texto esperado,
também no retry. O gate agregado falhou corretamente. Essa regressão está em
investigação dirigida; F2-05/F2-06 não têm conclusão técnica remota neste SHA.
O trabalho seguinte pode avançar conforme a autorização de acompanhamento
assíncrono, sem presumir aprovação desses checks.

A causa foi confirmada no retorno diferido de foco do Dialog e corrigida em
`7070a0c`. Validate integrado e 12 percursos afetados passaram localmente;
[evidência de foco e campanhas](2026-10-15-writer-v2-gestao-de-campanhas.md).
O próximo head ainda precisa de confirmação remota, sem alterar timeouts/asserções.

A CI anterior de F2-05 cancelou um shard próximo de 15 minutos, sem falhas registradas
nos 141 casos concluídos. F2-06 distribui a suíte completa em oito shards, preservando
15 min/job, 45 s/teste, expectativa de 10 s, dois workers, retry existente e gate
agregado. A enumeração não roda testes nem comprova duração remota. Ver
[ADR 0024](../decisions/0024-test-pipeline-sharding.md) e a
[evidência anterior](2026-10-15-writer-v2-historico.md).

## Fora do escopo

Portal/convites, compartilhamento real, grants, sessões, compra, edição comercial,
regras de combate/SRD, upload de materiais, duplicação integral de cena e geração por IA.

## Limitações e pendências conhecidas

- Prévia é por cena e restrita ao dono; classificar não concede acesso.
- Histórico/backup integral de aventuras e blocos permanece em F2-09; backup v6 não inclui esse histórico.
- Projeto de aventura ainda não possui exclusão integral; sua futura limpeza deve incluir blocos/imagens/versões.
- Caminhos, regras, índices e Functions não foram implantados. CI do novo SHA é pendência própria.
- Pilotos humanos, contratos e capacidade comercial real continuam pendentes.
- Build conserva avisos existentes de chunk grande e importação mista de DOCX.
- Evidência externa deste chat: `writer-v2-blocks-*`, `writer-v2-blocks-qa` e `writer-v2-adventure-preview-sdk.log`.
- Checkout original `E:/Mega/dev/writer` e trabalhos paralelos permanecem preservados.

## Como verificar manualmente

1. Abra/crie uma aventura, uma parte e uma cena; confira o Texto principal privado.
2. Crie blocos de pista/preparação com públicos diferentes e escreva seus textos.
3. Mova, duplique, arquive e restaure um bloco; confira audiência e total da cena.
4. Guarde uma versão; altere e restaure o texto; escreva novamente após a confirmação.
5. Vincule uma ilustração pela biblioteca, preencha alt/legenda e salve; confira que o texto permanece.
6. Abra Prévia da cena; compare Original completo, Mestre e Jogadores e seus materiais permitidos.
7. Confira teclado e 320 px nos três temas; fechar a prévia devolve o foco ao gatilho.
