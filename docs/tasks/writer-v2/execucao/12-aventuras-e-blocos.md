# F2-06 — Aventuras com blocos narrativos e audiências

**Estado:** implementado e validado localmente; CI do novo head pendente.
**Origem:** [W2-F2-06](../fase-02-criar-e-preparar/06-aventuras-e-estrutura-narrativa.md).
**Base:** F2-05 validado localmente e enviado em `cd5edb0`; CI em paralelo,
sem impedir o próximo incremento pela autorização de 2026-10-15.

## Objetivo e decisões recebidas

Uma cena de aventura pode reunir vários blocos, cada um com texto e audiência
próprios. O operador confirmou em 2026-10-15:

- Vários blocos dentro da mesma cena; não simular isso com cenas separadas.
- Conteúdo novo e legado sem classificação começa privado do criador.
- Classificar não publica, compartilha nem concede acesso a jogadores/compradores.

Tipos mínimos: introdução, preparação, cena, local, missão, pista e encerramento
(`introduction`, `preparation`, `scene`, `location`, `quest`, `clue`, `ending`).
Audiências: `creator`, `gm`, `players`. A prévia Mestre inclui `gm` e `players`;
Jogadores inclui somente `players`. Planejamento e referências privadas não entram.
Tipos são organização autoral e modelos vazios, sem regras SRD ou motor de D&D.

## Reuso e não escopo

Partes, cenas, editor, referências de universo, arquivo, cronologia, progresso e
histórico já existem. Conservar essas identidades e APIs públicas. Aventura sem
universo continua editável; vincular NPC/local existente reutiliza o universo
autorizado, sem copiar ficha completa. CRUD de lore local/importação/backup de
aventura continua em F2-09, onde a integração já está prevista.

Não implementar portal de jogadores, grants, sessões, edições públicas, venda,
upload de mapas/PDF, IA especializada, duplicação integral de cena com todos os
filhos ou cópia automática de lore. Imagens vêm da biblioteca já existente;
direito de reutilização privada não comprova licença comercial.

## Cena e blocos: persistência compatível

O corpo atual `adventures/{id}/scenes/{sceneId}/body/current` continua sendo o
**Texto principal**, um bloco real na interface. Sua identidade e histórico
`{kind: scene, id}` permanecem. Abrir/listar não converte nem copia prosa.
Novas cenas começam com principal vazio e privado. Não oferecer exclusão desse
corpo como se fosse um filho comum; apagar seu texto é edição normal.

Blocos adicionais ficam em `adventures/{id}/sceneBlocks/{blockId}` e
`.../body/current`, com proprietário derivado, sceneId, título, tipo, audiência,
revisão real, arquivo, ordem, palavras, hash/bytes e datas do servidor. Texto
segue 800.000 bytes e envelope 900.000, sem truncamento. Coleção plana permite
histórico por identidade e futura limpeza por projeto; pai/cena/parte são
reautorizados em cada operação.

O principal recebe metadados aditivos na cena: `mainBlockTitle`, `mainBlockType`,
`mainBlockAudience` e `mainBlockOrder`. Fallback somente de leitura: título Texto
principal, tipo scene, audiência creator e ordem 0. Livro não recebe esses campos.

A cena mantém `mainWordCount` (fallback canônico do corpo legado), `blockWordCount`,
`blockCount`, `blocksStructureRevision` e `nextBlockOrder`. `wordCount` passa a ser
principal + adicionais ativos; bodyHash/bodyBytes continuam descrevendo só o
principal. Campos agregados vêm exclusivamente do servidor. Cena que já teve
blocos com contador ausente/inválido falha explicitamente; não inventar zero.

## Ordem, duplicação e ciclo de vida

Ordenação manual mínima usa botões Subir/Descer. Ordens inteiras únicas permitem
troca atômica dos dois vizinhos e revisão estrutural, sem array crescente ou
reescrever todos os filhos. Criação/duplicação anexa no fim por contador seguro
do servidor. Remoção não precisa compactar ordens. Comparar vizinho real e revisão
estrutural; cursor vincula UID/aventura/cena/revisão e última ordem/ID.

Lista mistura o principal virtual com os filhos sem perder/duplicar a fronteira
da página: 25 padrão, 50 máximo + uma janela limitada. Ler corpos só ao selecionar.
Mover em outra página continua válido somente com a revisão estrutural observada.

Duplicar um bloco captura no servidor o texto, tipo, audiência e vínculos de imagem
autorizados, comparando revisão; nunca aplica audiência mais permissiva por padrão.
Duplicar principal produz um adicional; não duplica a cena. Pedido é idempotente.
Se uma imagem da origem ficou indisponível, falha sem cópia parcial ou novo uso.

Arquivo de adicional conserva texto/histórico e retira sua contribuição; restaurar
arquivo devolve-a uma vez. Exclusão explícita marca indisponibilidade antes da
limpeza retomável de materiais/corpo; histórico fica consultável no projeto sem
recriação implícita. Remover parte/mover/arquivar cena mantém os filhos pelo sceneId
e ajusta a contribuição do conjunto uma única vez. Futura exclusão de aventura
deverá limpar esses filhos; o projeto ainda não oferece essa operação.

## Escritores, contagem e histórico

Mutação usa operationId, revisão observada do bloco e autorização do pai. Principal
reutiliza o escritor de cena; adicionais usam um plano transacional reutilizável.
Corpo, metadados, agregado da cena, parte, ledger, revisão do projeto e recibo são
gravados juntos. Nada recebe palavras/hash/autoridade calculados pelo cliente.
Alterar tipo/audiência não muda o total; escrever texto privado também conta na
meta atual, conforme o contrato existente. Notas em planning continuam fora.

Ledger conserva uma fonte `scene`: texto principal + adicional canônico protegido.
Fingerprint inclui agregado/revisão dos blocos. Escritores, preparação retomável,
composição e arquivo devem usar esse total sem contar filhos novamente. A leitura
dos metadados necessários é limitada; não varrer todos os corpos por autosave.
Uma verificação explícita do agregado percorre metadados protegidos em páginas,
com revisão observada e checkpoint, publicando o resultado só se a revisão ainda
coincidir. Concorrência conserva o total atual e solicita nova verificação.

Histórico F2-05 ganha `{kind: block, id}` somente em aventura. O servidor deriva
sceneId do registro e autoriza cena/parte; não aceita um pai informado como grant.
Token usa snapshots precisos do bloco/corpo e revisão real. Restaurar reutiliza o
escritor do bloco, preserva predecessor e atualiza contagens/recibo juntos.
Não restaura audiência, tipo, ordem ou imagem. Principal mantém snapshots e escrita
existentes, preservando adicionais. Confirmação mostra a audiência atual do destino.

`VersionSource` acrescenta `sceneWordCount` para fonte de aventura, confirmando o
total da cena junto da prosa/revisão. O editor não substitui esse total pela
contagem do principal nem busca uma nova base depois de restaurar. Validar o campo
na nova integração; livros mantêm contrato existente.

## Contrato público mínimo para implementação paralela

Feature pública proposta: `adventure-blocks`, separada de `shared`. Identidade do
editor/histórico: `{kind: scene | block, id}`; alvo adventure. DTOs usam os mesmos
nomes em frontend/backend:

- `AdventureBlockSummary`: resource, sceneId, revision, title, narrativeType,
  audience, archived, order, wordCount, bodyHash, bodyBytes, createdAt, updatedAt.
  Principal herda revisão real da cena e não possui arquivo individual
  (`archived: false`); palavras aqui são só do bloco. Lista retorna também total
  confirmado da cena. Arquivo da cena é estado separado do conjunto.
- `AdventureBlockDocument`: summary + content + sceneTitle, adventureTitle,
  universeId, sceneRevision, sceneWordCount, sceneArchived e structureRevision. Dados de editor
  são privados; nunca reaproveitar esse DTO como projeção.
- `AdventureBlockPage`: items, nextCursor, structureRevision, sceneRevision,
  sceneWordCount e mainBodyHash. Principal aparece uma vez; arquivo filtra adicionais sem
  transformar principal ativo em item arquivado individual.
- `AdventureBlockMutation`: block (summary), sceneRevision, sceneWordCount,
  structureRevision e mainBodyHash. Remoção responde complete/processed e totais quando aplicável.

Todos os totais, inclusive Document/Job, incluem `mainBodyHash` da cena no mesmo
snapshot/commit. O host do principal só adota nova sceneRevision se esse hash
coincidir com sua prosa confirmada; caso contrário mantém sua base e solicita
comparação. Alterar um adicional não pode liberar a sobrescrita de um principal
que outro dispositivo editou. O extraeditor não adota revisão do principal como
revisão do seu corpo.

APIs (todas owner-only):

| API                            | Entrada essencial                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `listAdventureBlocks`          | adventureId, sceneId, archived?, cursor?, limit?                                                    |
| `getAdventureBlock`            | adventureId, resource                                                                               |
| `getAdventureBlockCountStatus` | adventureId, sceneId; metadados autorizados sem corpo ou gravação                                   |
| `createAdventureBlock`         | adventureId, sceneId, operationId, title, narrativeType?, audience?, content?                       |
| `updateAdventureBlock`         | adventureId, resource, operationId, expectedRevision, patch de title/narrativeType/audience/content |
| `duplicateAdventureBlock`      | adventureId, resource, operationId, expectedRevision                                                |
| `moveAdventureBlock`           | adventureId, resource, operationId, expectedRevision, expectedStructureRevision, direction up/down  |
| `archiveAdventureBlock`        | adventureId, blockId, operationId, expectedRevision, archived                                       |
| `deleteAdventureBlock`         | adventureId, blockId, operationId, expectedRevision no início; repetir pedido para limpar           |
| `verifyAdventureBlockCount`    | adventureId, sceneId, operationId, expectedSceneRevision, limit?                                    |

Replay reautoriza alvo e não apresenta confirmação antiga como texto atual. Erros
definitivos preservam preenchimento; resposta incerta guarda payload estável por
UID/recurso antes de liberar a edição seguinte. Sem corpo em recibo de histórico;
rascunhos/pedidos de texto usam adaptador privado já autorizado para recuperação.

Verificação retorna complete, processed, sceneRevision, sceneWordCount e
structureRevision e mainBodyHash; limite padrão 25/máximo 50 metadados por etapa. Confere a revisão
original em cada etapa e no commit final, sem adotar outra base silenciosamente.
Conflito pede nova leitura e novo operationId após aceite, sem zerar o total ou
mostrar recibo concluído antigo como verificação da revisão nova.
Esse reparo de metadados recompõe o agregado dos adicionais. Principal e total
corrompidos também falham explicitamente; a operação não inventa a prosa principal
nem declara completa uma contagem inválida.
Enquanto `complete: false`, a resposta de verificação tem `sceneWordCount: null`,
pois o agregado pode estar em reparo. Só `complete: true` confirma inteiro válido.
A UI não converte null em zero nem adota totais de página parcial. Essa união é
específica de verificação; exclusão pode já ter aplicado seu delta atomicamente.

Sem cache, um agregado inválido pode impedir getScene/lista antes de a UI obter
revisão. `getAdventureBlockCountStatus({adventureId, sceneId})` reautoriza cena/parte
e retorna null se indisponível, ou sceneRevision, mainBodyHash, structureRevision,
sceneWordCount (inteiro ou null), needsVerification e repairable. Não lê corpos
nem grava. Identidade inválida falha sem inventar token; principal/total inválidos
indicam repairable:false. O erro do loader de cena oferece esse caminho de
recuperação, com verificação explícita e retry só após confirmação.

## Interface e integração

Navegador paginado de blocos dentro da cena; um RichEditor por vez. Selecionar
bloco equivale a trocar documento: identidade de sessão, rascunho, fila, histórico,
undo e respostas tardias incluem UID/aventura/cena/bloco. Texto não confirmado
exige salvar/recuperar ou saída explícita com rascunho; armazenamento indisponível
não permite descartar silenciosamente. Histórico pendente bloqueia troca/escrita.

Principal continua acessível pela rota atual; novos blocos podem usar rota filha,
com retorno ao mesmo planejamento. Usar exports públicos de editor/scenes e
shared/ui, Lucide e tokens nos três temas. Exibir audiência atual junto do título,
contagem do bloco e total confirmado da cena separadamente. Tipos narrativos não
substituem estágio editorial. Cenas de livro conservam a experiência atual.

## Materiais e prévia: segundo subincremento

Contrato detalhado em [Ilustração e prévia da cena](13-imagens-e-previa-de-aventura.md).

Depois de estabilizar escritores/integração dos blocos, adicionar uma ilustração
opcional por bloco, com legenda e texto alternativo, da biblioteca existente.
Mais blocos podem apresentar outras imagens; pacote de materiais/arquivos tem
tarefa própria posterior. Essa unidade mantém duplicação atômica e limitada.
Seleção usa ImageLibraryPicker público e envia somente ID,
alt e legenda. Vínculo/alteração/exclusão/duplicação atualizam uso tipado da imagem
atomicamente no servidor, sem colisão com usos existentes de capa. Bloquear remoção
de imagem vinculada e reautorizar state/owner; materiais continuam privados.

Prévia é callable owner-only, com whitelist e filtro no servidor, paginação por
revisão observada e resposta cancelável. Não expor planning, histórico, referências
brutas, fichas, aliases/notas, títulos de partes/cenas secretas, IDs/contagens de
blocos excluídos ou placeholders que denunciem sua existência. Mostrar somente
título/tipo/texto do bloco permitido. Texto rico precisa de projeção sanitizada no
servidor, retirando atributos de lore, URLs/tokens e imagens externas; não confiar
apenas no sanitizer/CSS do cliente para remover segredo.

Imagem recebe entrega autenticada de bytes autorizados e metadata projetada,
revalidada após I/O; não transportar a URL com token permanente da biblioteca,
caminho Storage ou imageId interno na projeção. Página/mídia têm orçamento de
resposta e erros recuperáveis; não truncar silenciosamente. A prévia não ativa
link público, grant nem edição comercial.

## Sequência e arquivos previstos

1. Backend de blocos, agregado/ledger, principal compatível e extensão do histórico;
   testes dirigidos de CAS, concorrência, contagem, arquivo, ordem e roundtrip.
2. Feature pública de blocos com serviços/hook/navegador/editor e testes observáveis;
   integração dos editores depende do contrato acima. Trabalho independente pode
   usar subagentes sem edição concorrente dos mesmos arquivos.
3. Integração de cena/rotas/histórico, preservando bloqueios de F2-05; testar fluxo
   de principal e adicionais, próxima revisão, restauração e rascunhos isolados.
4. Materiais e projeção, com contrato detalhado antes desse código; provar ausência
   de segredo no DTO/HTML, uso de imagem e falhas/revogação, não apenas visibilidade.
5. Documentação/ADR/AGENTS, revisão e navegador dirigido aos caminhos alterados;
   validate uma vez no fechamento, SDK pertinente e produção. Registrar entrega,
   commit/envio autorizados; CI continua em paralelo.

Arquivos: novo `functions/src/adventureBlocks*.mjs`, escritores/ledger/progresso,
histórico, imageLibrary, exports/regras/índices; nova feature adventure-blocks,
integrações scenes/adventures/editor/routes/manuscript-history, testes e fixtures.
Não introduzir dependências sem necessidade demonstrada.

## Aceite e riscos

- Mestre prepara aventura independente com vários blocos tipados na mesma cena.
- Novo/legado privado por padrão; mover/duplicar não amplia audiência.
- Prosa legada, livros, histórico, créditos e contagens mantêm seus contratos.
- Mestre e jogadores não recebem segredos de outra audiência em DTO/HTML/mídia da prévia.
- NPC/local reutiliza referência autorizada de universo sem copiar ficha.
- Imagem vinculada tem uso/exclusão verificados no servidor.
- Ordem/páginas não perdem principal, corpo ou filhos; recuperação é por identidade.
- Teclado, 320 px e temas funcionam; evidência local/CI permanece distinta.

Riscos principais: contar principal duas vezes; tratar metadado ausente como zero;
restauração sobre base errada; corpo/recibo atravessando blocos; mistura de contexto
privado na projeção; token de imagem; duplicação parcial; deriva de contadores.
Os subincrementos não encerram F2-06 antes de materiais e prévia passarem no aceite.

## Validação local — 2026-10-15

O subincremento de blocos passou 36/36 jornadas Chromium nos seis projetos, com
dois workers e zero retries. A integração adicional de ilustração/prévia tem sete
percursos desktop confirmados por execuções dirigidas. A matriz conjunta final
passou **78/78**, 146,17 s, sem falhas/skips/flaky e retries 0. O validate final
terminou exit 0: 1.477 testes frontend com cobertura, 77 scripts, 258 Functions,
tipos, build e smoke. Produção passou seis casos e conservou um skip Windows de
referência visual, 14,4 s. SDKs dirigidos: blocos 4/4, recuperação 1/1 e prévia 4/4.
Ver [entrega e limites da evidência](../../../entregas/2026-10-15-writer-v2-aventuras-e-blocos.md).
Isso não comprova CI do novo SHA, deploy ou aceites humanos/comerciais.

A revisão independente encontrou adoção de revisão do adicional com hash remoto
divergente e lista desatualizada após restauração. O controle negativo reproduziu
o primeiro defeito antes da correção. O hash confirmado agora acompanha gravação,
comparação e restauração; metadado de outra prosa conserva a base e exige comparar.
A lista é invalidada após restauração sem inventar revisão de cena nem buscar nova
base do texto. Testes afetados e releitura independente confirmaram as correções.
