# Produção literária — execução

Base inicial: `codex/writer-v2`, commit `8b02f22`. Branch de trabalho: `codex/producao-literaria`.
Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Principal local incorporada: `master` em **`b66623310d487a6052148629d80125a0673e3e0f`**. O fetch desta rodada confirmou HEAD igual à principal local; `origin/master` permaneceu em `16d8af5`, ancestral dessa base. Veja a [reconferência atual](validacao-atual-principal-b666233.md), separada das rodadas históricas abaixo.

## Revalidação dos incrementos 47–50

A principal foi reconferida antes dos testes; não havia commits novos. Veja a
[rodada atual](revalidacao-incrementos-47-50.md), incluindo Functions 5.898/5.898,
frontend 5.480/5.480, correção das fixtures e os limites do gate integral.

## Rodada final solicitada em 2026-11-04

Principal reconferida antes dos testes, sem commits novos. Frontend **5.480/5.480**,
Functions **5.843/5.843**, scripts **116/116**, Chromium **7/7**, build/sintaxe/lint/
formatação aprovados. `validate` continua reprovado por functions **85,85% < 90%**;
Rules completas encerraram por timeout de 30 minutos. Veja o
[relatório desta rodada](validacao-final-2026-11-04.md), que distingue as execuções
integrais das correções e reconferências. Sem integração de volta, commit, push ou deploy.

## Autorização e escopo

Implementar as cinco etapas integralmente conforme o [plano aprovado](plano-integral.md).
A instrução posterior do autor autorizou incorporar a principal consolidada e só então executar os testes.
Essa incorporação ocorreu por fast-forward, preservando o trabalho literário e resolvendo os conflitos.
O checkout original da principal mantém as alterações não commitadas do autor em documentação, código e testes, sem mudanças nossas. Não houve commit, push, integração de volta à principal ou deploy nosso.
O objetivo permanece ativo.

## Progresso real

**0 de 5 etapas formalmente encerradas; as 5 continuam abertas.** Há implementação e testes aprovados em todas as áreas abaixo, mas faltam requisitos funcionais e o gate integral continua reprovado.
Não usar a quantidade de testes como percentual de implementação nem contar código escrito como entrega concluída.

| Etapa                           | Implementado e parcialmente verificado                                                                                                                                                                                                    | Falta para fechar                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contrato e guia              | Modelo privado, decisões, versões, comparação, adoção/inferência, criação assistida e modo operacional versionado. A nova criação unificada oferece contrato opcional somente para livros.                                                | Política tipada de publicação, auditoria integral dos critérios e sinalização completa de impacto de alterações.                             |
| 2. Arquitetura narrativa        | Documentos tipados, vínculos nativos e entre volumes, versões, mapa global, auditoria segmentada e reconciliação estrutural.                                                                                                              | Auditoria final dos critérios de arquitetura/continuidade e gate integral.                                                                   |
| 3. Contexto editorial           | Guia conectado ao chat legado/nativo, autocomplete, personas e assistente contextual da página, com fonte inspecionável e aceite seguro.                                                                                                  | Cobertura comportamental e auditoria completa de invalidação e de todas as entradas.                                                         |
| 4. Preparar, escrever e revisar | Ciclo privado de capítulo: preparação/gate, primeira versão, revisão integral e versão revisada; modos de E1, pausa, recuperação, reconciliação, passagem nativa e sequência com consentimento, orçamento agregado e setores registrados. | Política tipada de passagem por publicação obrigatória, auditoria final dos critérios e gate global.                                         |
| 5. Integração e publicação      | Integração paginada, matrizes, reconferência, progresso por artefato, confirmação pública atômica e guia do leitor. Motor interno e adaptadores de impacto preparados.                                                                    | Validar censo, fence e interface de impacto; portabilidade editorial `.writer` com restauração em nova cópia privada; auditoria dos aceites. |

## Última rodada encerrada — anterior aos incrementos 24–29

Veja o [relatório de 2026-11-03](validacao-principal-2026-11-03-rodada-final.md).
Os incrementos 24–29 não passaram pelos gates; os resultados abaixo são anteriores a eles.
Frontend: **5.422/5.422**, em 423 arquivos; cobertura de funções **86,24%**, abaixo
dos 90% exigidos. Functions: 5.431/5.436 na rodada completa, depois **91/91** nos
quatro consumidores dos helpers corrigidos. Reconferência de componentes: **50/50**.
Scripts: **116/116**. E2E: **7/7**. Visual afetado: **150/150**. Build/smoke, tipos,
formatação e grupos de lint aprovados. Regras completas excederam o limite de 30 minutos; regras literárias dirigidas **6/6** aprovadas;
**não há validação integral verde**. Nenhum limite foi reduzido.

## Rodada integral histórica — anterior ao mapa

Rodada terminada após incorporar a principal; código de produção de `317abc6`, acrescido do commit apenas documental `b9fc03c`.

- Frontend completo: **5.279/5.279**, em **409 arquivos**, sem timeouts nesta execução.
- Backend dirigido à integração: **118/118**; inclui criação, assistente, roteamento, personas e contratos literários afetados.
- Chromium: criação manual com guia **6/6**, leitor/guia **24/24**, nos três temas, desktop e móvel, incluindo 320 px.
- TypeScript, build e smoke aprovados; sintaxe de **560 módulos** de Functions aprovada.
- Skills, arquitetura, documentação, styleguide e formatação aprovados. Lint completo: zero erros e quatro avisos registrados.
- **`npm run validate` reprovou:** cobertura de funções **86,02%**, abaixo dos **90%** exigidos. Os demais limites de cobertura passaram. Nenhum limite foi reduzido.
- `test:setup` não foi alcançado por esse comando após a reprovação da cobertura. As 5.224 Functions e 116 testes de scripts aprovados anteriormente pertencem à base `1d78ff7`, e não são apresentados como nova rodada completa.

Detalhes, resultados históricos e logs: [relatório de validação](validacao-local-2026-11-02.md).
Próximos incrementos e contexto técnico: [checkpoint](continuacao.md).

## Incremento posterior: mapa global

O [mapa global](02-mapa-global.md) foi implementado e recebe verificações dirigidas após a rodada integral acima. As 5.279 aprovações não são reapresentadas como uma nova rodada completa após essa mudança. O incremento passou em 34 testes de frontend, 23 de backend, seis jornadas Chromium e build/smoke. Lint dirigido não teve erros ou avisos. Os resultados e seus limites constam no relatório de validação.

## Invariantes

Método opcional. Propostas não são cânone e não revogam aprovações anteriores.
Somente substituição aprovada encerra uma decisão aprovada; hipótese aprovada continua hipótese.
Preservar IDs, autoria, versões, CAS, recibos e exclusão completa.
Separar planejamento, fatos do manuscrito, conhecimento do POV e inferências.
Não declarar leitura integral, publicação ou revisão sem evidência correspondente.
Não restaurar credenciais nem autorizações operacionais em pacotes privados.

## Encerramento

Concluir os requisitos faltantes, ampliar testes de comportamento e atingir os limites existentes.
Executar novamente os gates afetados e o `validate` no fechamento do bloco.
Aprovar escopo, segurança, interface, documentação e evidência em `docs/entregas` antes de declarar entrega concluída.

## Incremento posterior: auditoria global

A [auditoria global](03-auditoria-global.md) acrescenta inventário completo da arquitetura,
prévia sem IA, leitura segmentada e conferência terminal, separando cobertura de intenção
e manuscrito. A reconferência detecta alterações no próprio inventário. Não encerra E2:
reconciliação estrutural e entre volumes continua pendente. A rodada integral de 5.279
aprovações e 86,02% de cobertura também é anterior a este incremento.

## Incremento posterior: reconciliação estrutural

A [reconciliação dos achados](04-reconciliacao-estrutural.md) distingue metadados e prosa,
permite escolher destinos estruturais paginados na síntese final e confirma apenas
alterações semânticas salvas, da mesma origem, lidas por sucessora global completa.
O incremento não encerra E2 nem o mapa integral de impacto. Sem commit, push ou deploy.

## Incremento posterior: vínculos entre volumes

O [vínculo explícito de origem](05-vinculos-entre-volumes.md) permite consultar livros do
próprio autor e suas unidades por páginas. Identidade composta e nascimentos nativos
separam homônimos, impedem religar IDs recriados e preservam a origem no contexto e nos
índices. Capítulos compostos usam suas cenas. E2 ainda exige a auditoria final de seus
critérios e o gate integral; os modos operacionais de E4 e o fechamento de E5 permanecem.

## Incremento posterior: primeira versão contínua com limites

A [redação contínua delimitada](06-redacao-continua-delimitada.md) aplica propostas dentro
de limites totais de aplicações/créditos, com pausa no servidor, CAS de autorização e
contadores atômicos. A execução para para decisões ou conflitos e termina na primeira
versão preservada. A orquestração dos modos de colaboração pelas fases completas de E4
continua pendente; este incremento não redefine o escopo integral para apenas redação.

## Incremento posterior: modo operacional do contrato

O [modo versionado](07-modos-operacionais.md) liga a escolha do autor em E1 à redação e
aplicação de prosa de E4. Orientação conserva análises/sugestões e escrita manual;
supervisão recusa autorização contínua; contínuo exige ainda limites explícitos por
capítulo. Alterar modo invalida fontes capturadas e não impede recuperar recibo já
confirmado. A coordenação integral entre fases, capítulos e atos permanece pendente.

## Incremento posterior: ciclo editorial de capítulo

O [ciclo coordenado](08-ciclo-editorial-capitulo.md) conecta as fases de um capítulo com
passagens supervisionadas ou contínuas autorizadas. Conserva versões e gastos nas
retomadas, impede reutilizar pedidos após recriação e distingue edição de prosa de mera
mudança no histórico ao reconciliar. A origem do registro também pode ser confirmada
ou cancelada após interrupção, sem iniciar geração. As condições nativas e sua seleção estão disponíveis pelo incremento10. O núcleo de orçamento agregado e o driver serial interno estão implementados nos incrementos 11 e 12. O incremento 13 acrescenta cliente e recuperação metadata. O incremento 14 acrescenta a seleção/consentimento visual e o registro nos setores para disponibilizar a sequência; o objetivo integral e o gate global permanecem abertos.

- [09 — Condições nativas de passagem: núcleo servidor e pendências de interface/orquestração](09-condicoes-de-passagem.md).

- [10 — Seleção paginada das condições de passagem e recuperação do registro](10-selecao-de-passagem.md).

- [11 — Núcleo nativo de escopo e orçamento agregado, ainda sem driver HTTP](11-orcamento-agregado-nativo.md).

- [12 — Driver serial e outcomes internos, com ponte cliente/UI ainda pendentes](12-driver-serial-e-outcomes.md).

- [13 — Cliente tipado, descoberta metadata e recuperação explícita de sequência](13-cliente-e-recuperacao-de-sequencias.md).

A integração da principal e a validação mais recente estão no
[relatório pós-integração](validacao-pos-integracao-principal-2026-11-03.md).
O gate global de cobertura continua reprovado. O objetivo permanece com 0/5 etapas
formalmente encerradas; testes dirigidos não substituem os aceites integrais.

- [14 — Interface de seleção/consentimento, checkpoints gerenciados e oito ações por setor](14-interface-e-setores-de-sequencia.md).

O incremento 14 torna a sequência acessível na interface local e conecta o registro dos
setores. Não confundir essa composição local com publicação/deploy. A política tipada
que condiciona passagem à publicação anterior e os demais aceites do plano seguem abertos.

- [15 — Unidade tipada de publicação, barreira nativa e confirmação do autor](15-unidade-de-publicacao.md).

O incremento 15 limita novas edições à unidade salva no contrato. A condição de
publicação anterior para avançar continua pendente. A verificação dirigida do novo
incremento passou; a cobertura global anterior não representa este novo snapshot.

- [16 — Prova nativa de edição confirmada na passagem, ainda sem política obrigatória](16-prova-de-publicacao-na-passagem.md).

O incremento 16 está em implementação. Acrescenta prova de edição explicitamente
selecionada; não certifica predecessora imediata nem o ato inteiro. Testes escritos
e não executados; ainda sem seletor na interface.

- [17 — Inspeção paginada da predecessora e vínculo opcional à passagem](17-inspecao-da-predecessora.md).

O incremento 17 acrescenta inspeção nativa em duas passagens, sem limite total de
capítulos, e recusa saltos ao selecioná-la como pré-requisito. Ainda não habilita a
política obrigatória nem sua interface; os novos testes não foram executados.

- [18 — Admissão por publicação anterior: núcleo servidor e cobertura do ato](18-admissao-por-publicacao.md).

O incremento 18 compõe a exigência explícita no servidor, incluindo a primeira unidade
e continuidade do ato, mas ainda exige interface e integração ao controle de sequências.
Os novos testes foram escritos e não executados; não há aceite integral de E1/E4.

- [19 — Interface de política e inspeção, com recuperação nativa ainda em fechamento](19-interface-da-admissao.md).

O incremento 19 liga a escolha à preparação/ciclo e prepara retomada por IDs. Antes
de integrar, é obrigatório congelar a encarnação nativa antes do start e fechar o
início incerto sem registro observado. Testes escritos e não executados.

- [20 — Origem nativa, cancelamento de início incerto e intenção de encerramento durável](20-recuperacao-nativa-da-inspecao.md).

O incremento 20 compõe as pendências nativas do início/encerramento descritas no 19.
Os casos estão preparados, sem execução; sequências e gates integrais permanecem abertos.

- [21 — Admissão por unidade nas sequências e recuperação do pedido congelado](21-admissao-nas-sequencias.md).
- [22 — Composição e prova editorial na análise de lore, com testes preparados](22-contexto-editorial-na-analise-de-lore.md).

A documentação do incremento 21 foi gravada depois de a aprovação automática voltar a
funcionar. O incremento 22 liga a análise de lore ao guia comum e sua invalidação nativa.
Classificação estruturada e o fechamento de impacto/portabilidade continuam pendentes.
Não houve nova execução de testes ou validações; os aceites integrais seguem abertos.

- [23 — Afirmações classificadas e revisão explícita na análise de lore](23-classificacao-das-afirmacoes.md).

O incremento 23 distingue observação textual, interpretação e proposta por trecho/campo.
Legado permanece não classificado; sugestões exigem seleção explícita. Testes preparados,
sem execução. Retenção histórica/proveniência continuam na auditoria de E5.

- [24 — Inventário de ciclos, sequências, inspeções e partes da publicação](24-impacto-dos-processos.md).

O incremento 24 amplia o grafo interno e as verificações de origem, distinguindo
identidade nativa de versão de texto. Há dez testes preparados, ainda não executados.
Guia público, origem de unidades/ciclo atual, orquestração e interface permanecem
pendentes explícitas; não há certificação de inventário completo ou leitura literária.

- [25 — Prova metadata de unidades publicadas e vínculo original do ciclo atual](25-origens-das-unidades-e-do-ciclo-atual.md).

O incremento 25 usa a mesma identidade de unidade da integração sem abrir prosa e
cruza o ciclo atual com seu recibo nativo original. Sete casos adicionais foram
preparados (17 desde o 24), ainda não executados. O índice do guia e a composição
pública do mapa continuam pendentes; o objetivo integral não foi encerrado.

- [26 — Índice nativo das evidências e relações do guia, com backfill interno explícito](26-indice-das-dependencias-do-guia.md).

O produtor salva o índice com a versão e o clock; leitura do mapa usa metadata e
não transforma associação em prova do texto citado. Rules/limpeza foram ampliadas.
Doze testes de backend e três de SDK preparados, não executados. A preparação pública,
o fence/censo completos, a resolução e a interface ainda precisam ser compostos.

- [27 — Controlador público do mapa: preparação autorizada, censos, propagação e resoluções](27-controlador-do-mapa-de-impacto.md).

Nove ações foram ligadas a planningApi (445 ações/16 setores no registro local).
O controlador tem 17 casos de backend/transporte e três SDK preparados, não executados.
A auditoria de origens legadas continua uma lacuna explícita: o mapa ainda termina
parcial, e a interface/recuperação do cliente precisam ser compostas. Sem deploy.

- [28 — Interface, journal metadata e encerramento nativo de pedidos de impacto](28-interface-e-recuperacao-do-impacto.md).

O incremento 28 compõe a interface e a recuperação, sem produção ao abrir. Há 27 casos
de frontend, cinco adicionais de backend, um SDK e um cenário visual preparados, não
executados. A cobertura histórica continua parcial. As métricas da última validação
não cobrem 24–28; o objetivo mantém 0/5 etapas formalmente encerradas.

- [29 — Censo das origens nativas e lacunas concretas de cobertura](29-censo-das-origens-nativas.md).

O marcador de lacuna incondicional foi substituído por onze segmentos metadata de
origens privadas, com três passagens e checks para ausências reais. Foram preparados
22 casos novos (15 do censo, 3 do controlador, 3 SDK e 1 UI), ainda não executados.
O inventário registrado pode encerrar sem certificar completude histórica ou editorial;
catálogo sem clock permanece explicitamente untracked. Não há novo aceite integral.

- [30 — Núcleo do formato portátil editorial e remapeamento sem reativação](30-contrato-da-portabilidade-editorial.md).

O incremento 30 acrescenta DTOs fechados, referências lógicas, registros canônicos
compartilhados e remapeamento para uma cópia privada. Há 34 testes preparados, não
executados. A seção ainda não está ligada ao `.writer`; captura, framing/semântica,
cleanup, materialização e ativação continuam pendentes. Nenhum produtor foi habilitado.

O [incremento 31](31-leitura-e-semantica-do-pacote-editorial.md) integra a leitura
explícita de archive v2 e a semântica editorial compartilhada, com referências
paginadas e ciclos conferidos incrementalmente. O produtor continua em v1 e a
restauração v2 permanece bloqueada até completar captura, cleanup e materialização.
Há 27 casos novos preparados, sem execução; portabilidade funcional ainda pendente.

O [incremento 32](32-fence-explicito-dos-ciclos.md) coordena explicitamente as
escritas de cabeçalhos dos ciclos com um marcador privado transacional. A cobertura
é `workflow-headers-only`, com Rules e limpeza; não habilita captura global. Há 12
casos novos e um caso de exclusão ampliado, todos sem execução.

O [incremento 33](33-coordenacao-dos-escritores-do-processo.md) amplia o marcador
para escritores explícitos de 11 famílias e os checkpoints de publicação. A cobertura
passa a `process-headers-partial`; a captura v2 segue desligada. A exclusão reconfere
escritas tardias antes da raiz. Há 27 novos casos preparados, inclusive SDK real,
ainda sem execução.

O [incremento 34](34-captura-de-contratos-e-fichas.md) acrescenta linhagem lógica
atual/versão e o leitor interno paginado de contratos/fichas, com partes e fontes
reautorizadas. A versão imutável idêntica à atual vira alias sem bytes duplicados.
Há 31 casos novos preparados, ainda não executados. O leitor não foi exposto e a
exportação/restauração editorial completa continua pendente.

O [incremento 35](35-captura-de-preparacao-e-notas.md) acrescenta captura interna
de notas próprias e preparação histórica. A preparação autoriza o manifesto antes
do corpo; revogação gera placeholder sem citações. Notas próprias permanecem com
vínculos indisponíveis quando necessário. Há 23 casos novos preparados, sem execução;
composição do pacote e restauração completa continuam pendentes.

O [incremento 36](36-captura-de-decisoes-proprias.md) captura decisões próprias
de achados/impacto por máscaras fechadas, preservando estados, versões e justificativas
sem copiar resultados, checks ou grants ativos. Impacto confere UID antes do corpo.
Há 22 casos novos preparados, sem execução; pacote completo e restauração seguem pendentes.

## Reconferência após incorporar a principal

A [rodada sobre a principal b666233](validacao-principal-b666233.md) executou os
checks e testes após incorporar a direção desktop da principal local. Esse registro
atualiza o estado de execução dos testes preparados nos incrementos acima e separa
as suítes completas das reconferências dirigidas. Não há validação agregada verde
nem encerramento formal das cinco etapas.

O [incremento 37](37-captura-de-propostas-e-analises-de-texto.md) acrescenta a captura interna das propostas e análises
nativas de texto. Instrução própria, segmento, proposta, relatório e evidências
mantêm vínculos tipados; a autorização precede o cache e é repetida entre partes.
A cobertura registra somente o segmento/cena fornecido, sem certificar capítulo
ou livro. Há 27 casos novos preparados, sem execução. São treze famílias internas;
composição do pacote e restauração editorial completa continuam pendentes.

O [incremento 38](38-captura-de-geracoes-editoriais.md) captura gerações de planejamento, auditoria de ficha e
inferência de contrato usando o mesmo gate estrito do leitor nativo. Preserva
rascunho/instrução próprios, propostas sem adoção e evidências sem offsets
inventados. O índice mantém procedência original, sem preencher universo legado
pelo atual. São quatorze famílias internas e 28 casos novos preparados, sem
execução. Composição do pacote e restauração editorial completa continuam pendentes.

O [incremento 39](39-captura-de-ciclos-de-revisao.md) preserva ciclos de revisão,
unidades e associações aos relatórios originais de Prose. Inspeção sem escrita,
testemunhos nativos privados e indisponibilidade de vínculos legados impedem
adotar registros recriados. São dezessete famílias internas e dezesseis casos
preparados, sem execução. A rodada anterior não valida os incrementos 37–39.
Produtor e restauração editorial completa permanecem pendentes; 0/5 etapas
formalmente encerradas.

O [incremento 40](40-captura-de-integracao-literaria.md) captura jobs e relatórios
de integração pelo gate nativo estrito, sem escrita durante o backup. Preserva
citações com offsets e associações de síntese por linha, separando referências a
relatórios de evidências literais. Testemunhos privados impedem adotar pais/fontes
recriados. Dezenove famílias internas, 26 casos preparados sem execução. Produtor,
restauração editorial completa e auditoria E1–E5 continuam pendentes; 0/5 etapas
formalmente encerradas.

O [incremento 41](41-captura-de-guias-e-manifestos.md) captura guias atuais/versões
e manifestos por job/capítulo/retirada. Preserva estrutura autoral, citações sem
offsets inventados, tombstones e aliases. A origem do livro precede o corpo;
mudança do manuscrito não elimina história autoral permitida. Chaves lógicas mantêm
relações e agrupamento privados, sem reativar publicação. São 24 famílias internas
e 26 casos preparados sem execução. Produtor/restauração e aceites E1–E5 permanecem
pendentes; 0/5 etapas formalmente encerradas.

O [incremento 42](42-checkpoints-de-redacao-e-preservacao.md) captura jobs/unidades
de redação e preservação por metadata. Distingue aplicações de IA, adoção de texto
existente e verificação de versões. Testemunhos privados fixam vínculos originais;
legado/recriações ficam indisponíveis sem backfill. Checkpoints permanecem privados
e desabilitados, sem corpos duplicados. São 28 famílias internas e 18 casos
preparados sem execução. Produtor/restauração completa e auditoria E1–E5 continuam
pendentes; 0/5 etapas formalmente encerradas.

O [incremento 43](43-checkpoints-de-workflows-e-sequencias.md) preserva configuração
e checkpoints de workflows/sequências, com ator e origem conferidos antes de
instrução/limites. Relações concluídas usam nascimento original; ponteiros sem prova
ficam indisponíveis. Limites/fases são histórico, sem grants ou retomada. São 30
famílias internas e 16 casos preparados sem execução. Produtor/restauração e
aceites E1–E5 continuam pendentes; 0/5 etapas formalmente encerradas.

O [incremento 44](44-captura-do-mapa-de-impacto.md) preserva controle e topologia
histórica do impacto pelo mesmo gate nativo do leitor, sem motor mutável, rótulos
ou corpos privados. Referências conectam nós, vínculos, visitas e testemunhos;
verificações técnicas ficam distintas das decisões autorais e da leitura de prosa.
São 37 famílias internas e 14 casos preparados sem execução. Host produtor,
restauração útil e auditoria E1–E5 continuam pendentes; 0/5 etapas formalmente
encerradas.

O [incremento 45](45-produtor-e-arquivo-editorial-provisorio.md) compõe o catálogo
com 37 famílias, o censo nativo e o produtor optativo v2. O salvamento acrescenta
estágio cifrado limitado e validação semântica real antes de confirmar o destino,
com limpeza própria obrigatória. São 14 casos adicionais preparados sem execução;
a [rodada anterior](validacao-atual-principal-b666233.md) não valida esses ajustes.
O formato padrão continua v1. Restauração editorial útil e auditoria E1–E5 seguem
pendentes; 0/5 etapas formalmente encerradas. O objetivo integral continua ativo.

O [incremento 46](46-inventario-e-projecao-da-restauracao-editorial.md) prepara
inventário v15 e cleanup editorial autenticado, com partes antes de headers e
migração somente após base auditada e namespaces vazios. O leitor mapeado compõe
os IDs nativos e mantém a política histórica sem grants. São 22 casos preparados
sem execução. V2 continua recusado e v15 não ativa: faltam materializador, contrato/
planos editáveis, limites após remapeamento, ativação, leitores, recaptura e exclusão.
O objetivo integral permanece ativo, sem encerramento formal de etapas.

O [incremento 47](47-materializacao-editorial-privada.md) acrescenta materializador
privado por bytes originais e confirmação nativa antes de partes/headers. Corrige
hash semântico do leitor, posição do rascunho na cauda v2 e ordem do cancelamento
após a barreira da capa. Admissão pública/ativação continuam fechadas. São15casos
novos preparados, sem execução; os resultados da rodada anterior são históricos.
Estados editáveis, censo final, ativação, leitores, recaptura, exclusão e auditoria
E1–E5 seguem pendentes. O objetivo integral permanece ativo,0/5 formalmente encerradas.

O [incremento 48](48-contrato-e-planos-restaurados.md) prepara contrato/plano no
formato nativo com primeira versão e revisão privada atômicas, após a cópia
histórica. Fontes ficam pendentes sem tokens e planos começam como propostas;
o inventário inclui as novas coleções antes dos writes. São18casos dedicados
preparados, nenhum executado. Raiz/ativação/registro público continuam fechados;
censo, revisão, clocks, leitores, recaptura, exclusão e auditoria integral seguem
pendentes. Objetivo ativo,0/5 etapas formalmente encerradas.

O [incremento 49](49-censo-final-da-restauracao-editorial.md) separa a contribuição
editorial da contagem da base e acrescenta censo físico integral, selo nativo e
consumo transacional. Coleções operacionais não restauradas devem estar vazias;
recursos estranhos são preservados sem certificado. São13casosNode e1SDK preparados,
sem execução. Ativação/registro público continuam fechados; revisão, clocks,
leitores, recaptura, exclusão e auditoria integral seguem pendentes. Objetivoativo,
0/5 etapas formalmente encerradas.

O [incremento50](50-exclusao-do-arquivo-editorial.md) integra o arquivo e revisões
pendentes à exclusão normal do livro: metadata limitada, partes antes de headers,
commit conjunto e conferência final para retomadas antigas. São8Node+1SDK
preparados, sem execução. Ativação continua fechada; revisão/clocks, leitores,
recaptura e auditoria integral seguem pendentes. Objetivoativo,0/5 encerradas.

O [incremento 51](51-ativacao-editorial-interna.md) liga revisão/ativação ao censo
v15 sob opção interna desligada. O recibo fixa contexto e tokens nativos; a raiz
privada recebe clocks literários, preservando arquivo original e pendências.
Retirada de pedido incerto avança só o selo editorial, com replay e base intactos.
Foram preparados 17Node+1SDK, nenhum executado. Leitor, CAS das pendências,
recaptura e interface ainda faltam; a rodada 5.898/5.480 não valida este código.
O objetivo integral continua ativo, 0/5 etapas formalmente encerradas.

O [incremento 52](52-leitor-privado-do-arquivo-editorial.md) prepara o leitor interno
por autorização atual, raiz nativa e testemunho de ativação preservado após
cleanup da origem. Leitura limitada por partes e prova transacional; pendências
expõem a base atual sem restaurar grants. São 22Node+2SDK preparados, sem execução.
Aceite com CAS, recaptura e interface permanecem pendentes. As aprovações da
rodada anterior não validam 51–52; o objetivo integral segue ativo, 0/5 encerradas.

O [incremento 53](53-aceite-e-reconciliacao-das-pendencias.md) implementa o escritor
interno de aceite/CAS: manter corrente ou reconciliar somente referências
reautorizadas pelo escritor nativo compartilhado. Resolução/recibo/clock e
plano/índice/versão quando alterados são atômicos; histórico permanece imutável.
Novos namespaces já entram na exclusão e na ausência pré-ativação, com SDK negado.
São26Node+2SDK preparados, sem execução. Interface, recuperação cliente, recaptura
e gates permanecem pendentes. Objetivo integral ativo,0/5 formalmente encerradas.
