# Ciclo normal das aventuras restauradas

- **Data**: 2026-10-28.
- **Branch**: `codex/writer-v2`; base fe49e9f.
- **Plano**: [198](../tasks/writer-v2/execucao/198-ciclo-normal-das-aventuras-restauradas.md).
- **Decisão**: [ADR 0220](../decisions/0220-adventure-restored-consumers-and-orphans.md).
- **Matriz**: [consumidores](../tasks/writer-v2/consumidores-aventuras-restauradas.md).

## Objetivo e funcionalidades

A cópia restaurada segue o ciclo normal depois da finalização/coleta:
leitura, edição de cena/bloco/lore, histórico, contexto privado de IA, imagem/
persona e segundo backup/restauração. O original permanece intacto.

O planejador passou a apresentar o texto anterior preservado da parte, com
sanitização, separado das cenas. Também oferece localizar cenas sem parte
disponível, conferir seu texto e movê-las explicitamente para Sem parte.
A referência anterior, corpo, blocos, histórico e arquivo são preservados.
A recuperação usa CAS/ausência atual/recibo e não cria parte fictícia.

## Critérios de aceite

- [x] Captura normal, restauração completa e consumidores após coleta.
- [x] Edição, histórico, lore, contexto privado e segunda restauração.
- [x] Corpus vazio/legado/arquivo/órfão/recurso excluído/origem indisponível.
- [x] Matriz por família com exclusão completa de projeto ainda pendente.
- [x] Testes/checks dirigidos, revisão, documentação e commit local normal.

## Arquivos alterados

- functions/src/scenes.mjs e index.mjs: fonte preservada e dois endpoints
  privados de listagem/recuperação.
- scenes: serviço cliente, ScenePlanner, SceneOrphanDialog, CSS e testes.
- adventure-portability/tests: helper e ciclo integrado com produtor real.
- functions/test: nove casos de contrato e dois SDK reais.
- Plano, matriz, ADR, inventário, progresso e README: estado local e limites.

## Testes e resultados reais

- **5/5 Vitest integrados**, 14,34 s na última rodada antes da formatação:
  rich Unicode/partes/cena/bloco/lore/persona/imagens/histórico e rascunho;
  aventura vazia; histórico de bloco excluído sem recriação; legado/arquivo/
  recuperação de órfã; universo original indisponível no destino.
- O caso principal confere referências remapeadas de cena e narrativa, leitores
  de arco/marco/evento, imagem pela biblioteca normal e segunda restauração.
- **30/30 Vitest de UI** em dois arquivos, 18,47 s: planejador e diálogo.
  Reteste final do diálogo: **6/6**, 2,98 s.
- **28/28 Node**, 825,8013 ms: nove novos e 19 de regressão de scenes.
  Reteste dos nove após corrigir a fixture do contador: **9/9**, 254,8986 ms.
- **2/2 SDK real**, 1488,6913 ms: exports/headers/limites/run e middleware
  HTTP sem Auth/App Check, projeto demo e endereço de emulador loopback fechado.

A integração inicialmente selecionou cenas sem parentId e usou campos errados
do DTO de lore/imagem; o roteiro foi corrigido para os contratos públicos.
A biblioteca normal exigiu DocumentReference.set no double, implementado no
helper por transação nativa simulada. Essas falhas não foram contadas como passes.
As incompatibilidades reais de fonte legada invisível e recuperação de parte
ausente foram corrigidas no produto e mantidas como regressões.

## Chromium nativo

**9/9 verificações em 12748 ms**, Chromium **153.0.8010.12**.
O roteiro m110-ui.mjs capturou/restaurou arquivo de 316497 bytes pela interface,
com APIs de arquivo/OPFS e recuperação locais nativas. Depois montou o
ScenePlanner real com parte legada e pai ausente como entrada histórica.

Conferiu sanitização/fonte visível, prévia somente de leitura, confirmação
única, retorno da cena ao planejador Sem parte, corpo exato, referência anterior,
contador e job ativado congelado. Nenhuma parte fictícia foi criada.
Prévia nos três temas e 1280/320 px, sem overflow, ações visíveis e foco
confinado ao diálogo. Capturas móvel claro e desktop escuro inspecionadas.
Há 12 capturas: seis do backup e seis da recuperação.

Auth/App Check/SDK/chooser são sintéticos; serviços de captura/restauração/cenas
reais usam doubles de metadata/Storage. A interface de lore não exercitada no
browser é isolada; lore real foi coberto no ciclo integrado Node/Vitest.
Não comprova credenciais/Firestore/Storage remoto, seletor do SO, leitor de tela,
zoom físico de 200% ou dispositivo real. Entradas temporárias foram removidas
no finally; browser/contexto/HTTP encerrados. Dados/navegador do usuário preservados.

## Checks, revisão e pendências

Tipos, lint dirigido, arquitetura, styleguide, documentação, formatação e
diff passaram. `npm run build`: tipos, **3103 módulos em 2,17 s**, smoke verde.
Há avisos de chunks/imports dinâmicos sem separação, sem erro.
Nenhuma dependência, Rules, índice, formato do backup ou regra global nova.

Revisão conferiu leitura privada/paginação vazia, CAS/parent ausente, recusa de
parte recriada, replay/contadores/ledger, preservação de corpo e renderização
sanitizada, confirmação/resultado incerto e fronteiras públicas.
O fechamento integral 195–197 verde é base anterior, não prova deste código.
Por orientação do operador, o próximo validate integral fecha o bloco de
exclusão/auditoria de P2; aqui foram executados somente checks dirigidos.

Exclusão completa de aventura ainda não existe e é a próxima entrega necessária.
Campanhas/duas mesas do fechamento D e P3/F2-09, gates humanos/comerciais e macro
**8/35** continuam abertos. Endpoints novos ainda sem implantação.
Sem CI, push/PR, merge, deploy ou subagentes; somente commit local.

## Verificação manual

1. Com backend atualizado, abrir o planejamento de uma aventura com texto
   anterior de parte: a fonte preservada deve aparecer separada das cenas.
2. Escolher Recuperar cenas sem parte; continuar a busca se a página tiver cursor.
3. Conferir uma cena e confirmar Mover para Sem parte.
4. Abrir Sem parte no planejador e editar a cena; texto/blocos/histórico permanecem.
5. Se a parte reaparecer ou a revisão mudar antes da confirmação, atualizar/
   conferir o estado atual; a recuperação não deve sobrescrever essa mudança.
