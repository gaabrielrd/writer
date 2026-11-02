# Backup privado de aventuras pela interface

- **Data**: 2026-10-28.
- **Branch**: `codex/writer-v2`; base 7574f04.
- **Plano de origem**: [197](../tasks/writer-v2/execucao/197-geracao-do-backup-de-aventuras-pela-interface.md).
- **Decisão**: [ADR 0219](../decisions/0219-adventure-backup-interface.md).

## Objetivo e funcionalidades entregues

O autor pode gerar um backup completo da aventura pela página do projeto ou
pelos editores de cena/bloco. O arquivo .writer inclui texto salvo, estrutura,
planejamento, lore local, personas, histórico integral e imagens disponíveis.
No editor, pode acrescentar explicitamente o texto aberto como rascunho separado.
Na restauração, o manuscrito salvo permanece e o rascunho vira uma versão.

A seleção do destino começa no gesto do usuário; a captura congela a contribuição
explícita antes de esperar o seletor. A escrita é limitada por partes e confirma
sucesso somente após conferir a prova/selo e fechar o arquivo. Cancelamento,
mudança concorrente da fonte ou falha abortam o destino e não confirmam sucesso.
O fluxo não altera o original, não cobra créditos e não publica.

Os 17 leitores existentes recebem exports públicos explícitos com UID/App Check,
headers privados e limites preservados. O adaptador SDK valida metadata fechada
e conta/aventura em cada fronteira. A composição usa o port de backup de
gerações/ranges; não exporta helpers ou chaves de retomada.

## Critérios de aceite

- [x] Transporte dos 17 leitores, sem helpers ou chaves públicas.
- [x] Destino por stream, prova completa, close e abort comprovados.
- [x] Interface nos três pontos, salvo por padrão e rascunho por escolha.
- [x] Arquivo gerado aceito pela restauração, com conteúdo conservado.
- [x] Testes dirigidos, jornada nativa e validate integral verdes.
- [x] Revisão e documentação; registro em commit local com hooks normais.

## Arquivos alterados

| Grupo                                                                             | Mudança                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| functions/src/adventureBackupCallable.mjs, adventureBackupService.mjs e index.mjs | Fronteira pública e composição somente de leitura.             |
| adventure-portability/services                                                    | Adaptador SDK próprio, seletor/destino, gravação e exportação. |
| AdventureBackupDialog.tsx e CSS                                                   | Consentimento, estados, cancelamento e temas.                  |
| AdventurePage, SceneEditorPage e AdventureBlockEditor                             | Ações públicas e snapshot explícito do texto aberto.           |
| Testes Node/Vitest e fixture de exportação                                        | Transporte, corpus real dos serviços, escrita, conta e UI.     |
| README, ADR, plano, progresso e inventário                                        | Estado local, limites e próximas etapas.                       |

São 24 arquivos de código/CSS/testes, conferidos por SHA antes e depois do
validate. A documentação final foi acrescentada após a validação; os checks
dirigidos de documentação/formato/diff são repetidos antes do commit.

## Testes dirigidos

- Node: **24/24** da fronteira/factory e **2/2** do SDK real, incluindo os
  17 exports/run, configuração e middleware HTTP sem Auth/App Check.
- Vitest: **140/140** em AdventurePage, SceneEditorPage, adventureBlocks e
  adventureArchiveCallables; **27/27** de destino/save/export e **13/13** do diálogo.
  O reteste do serviço de exportação foi **8/8** após o ajuste de lint do nome.
- O corpus usa texto Unicode acima de 64 KiB, lore local, persona, duas versões
  manuais, PNG por dois usos e ausência de URL/token no arquivo.
- Cobrem payload fechado, conta/guard tardios, rascunho congelado, mudança
  concorrente, prova incompleta, disco/close/cleanup, ausência de suporte,
  cancelamento do seletor, desmontagem, troca de conta e tentativa simultânea.

O teste de duplo clique descobriu reutilização do botão Salvar como Cancelar.
Foram atribuídas identidades DOM distintas; a regressão passou. O lint detectou
a expressão com caracteres de controle; a normalização passou a usar a classe
Unicode Cc. As primeiras falhas de fixture/roteiro e esses achados não foram
contados como validações positivas.

## Jornada nativa

**9/9 verificações em 14674 ms**, Chromium **153.0.8010.12**. Roteiro e resultados
locais: m109-ui.mjs, m109-ui-result.json e seis capturas na pasta de QA externa
ao Git. A entrada Vite temporária foi removida e os recursos do ensaio encerrados.

A interface gerou **316497 bytes**, escrita máxima **65706 bytes** incluindo
framing, usando os 17 leitores reais. A restauração fez inspeção e duas revisões
explícitas, ativou uma nova cópia, abriu por acesso atual e concluiu mídia/coleta.
Verificou o texto salvo exato, três versões (duas manuais e o rascunho recuperado
com texto exato), lore local, definição de persona restaurada e duas imagens
ativas. O original ficou idêntico.

O rascunho continuou sendo o snapshot inicial mesmo após alteração do objeto
durante a espera do seletor. Mudança da fonte e cancelamento abortaram o writable
nativo e conservaram o arquivo anterior byte a byte. Cancelar o chooser não
iniciou captura nem abriu escrita.

FileHandle/createWritable OPFS, File, IndexedDB, Web Locks e WebCrypto são nativos.
Chooser, Auth/App Check e SDK são sintéticos; serviços reais sobre doubles de
metadata/Storage. Não comprova seletor do SO, credenciais reais ou serviços remotos.
Não usa nem modifica dados ou navegador do usuário.

Três temas em 1280/320 px, sem overflow e com ações visíveis; teclado, armadilha
de foco, Escape e retorno assíncrono ao botão. Capturas claro móvel, escuro
desktop e sépia móvel inspecionadas após as transições.

## Validação integral do bloco 195–197

`npm run validate`: **exit 0 em 1642,97 s**, Node 24.21.0, com
VITEST_MAX_WORKERS=2. Log/status e 24 hashes estão na pasta de QA externa.

```text
Test Files  359 passed (359)
Tests       4791 passed (4791)
Duration    848.88s
All files   89.59 statements | 85.72 branches | 90.79 functions | 92.75 lines
scripts:    tests 90 | pass 90 | fail 0
Functions:  tests 3798 | pass 3798 | fail 0 | duration_ms 435607.8195
Functions syntax checked: 393 modules
3102 modules transformed
built in 2.60s
Smoke test do bundle OK.
```

Skills, arquitetura, documentação, styleguide, formatação, lint integral,
cobertura, infraestrutura, Functions, sintaxe, tipos, bundle e smoke passaram.
Limites 85/75/90/85 preservados. Há avisos de chunks grandes e imports dinâmicos
também estáticos; o build não apresentou erro.

## Revisão, limites e pendências

Revisão conferiu lista pública/dispatch, port correto de Storage, schema
cliente, captura antes de await, ausência de persistência do arquivo/rascunhos
alheios, guard por conta/sessão, fechamento, abort e falhas de limpeza. Sem
dependência, Rules, índices, segredo ou configuração remota novos. Regras
globais existentes continuam cobrindo o fluxo; AGENTS não foi alterado.

O seletor exige File System Access/contexto seguro. Não há fallback com o
arquivo inteiro em Blob/localStorage. Os endpoints novos precisam de implantação
coordenada antes do uso com conta real. Zoom físico, leitor de tela, dispositivo
físico e seletor do SO não foram validados neste recorte.

O fechamento integral cobre 195–197. A auditoria ampla do corpus e dos
consumidores/exclusão de P2 ainda é necessária; P3/D, F2-09, gates
humanos/comerciais e macro **8/35** permanecem abertos. Sem subagentes,
CI, push/PR, merge ou deploy; somente commit local.

## Como verificar manualmente

1. Com backend atualizado e conta autorizada, abrir uma aventura e escolher
   Backup da aventura; gerar somente o salvo.
2. No editor de cena/bloco, escolher incluir o texto aberto e selecionar destino.
3. No Estúdio, restaurar o arquivo, conferir as duas revisões e criar a cópia.
4. Conferir o salvo no manuscrito e o rascunho como versão separada, além das imagens.
5. Cancelar outra geração ou alterar a origem em outra aba: não deve confirmar
   backup completo; o arquivo previamente confirmado deve continuar disponível.
