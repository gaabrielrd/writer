# F2-06, subincremento 2 — Ilustração e prévia da cena

**Estado:** implementado e validado localmente; matriz conjunta 78/78 no Chromium,
validate e SDKs dirigidos verdes. CI do novo head pendente. Ver
[evidência da entrega](../../../entregas/2026-10-15-writer-v2-aventuras-e-blocos.md).
**Base:** [Blocos narrativos e audiência](12-aventuras-e-blocos.md).

## Resultado e alcance

Um bloco pode ter uma ilustração da biblioteca existente, com legenda e texto
alternativo. O criador confere a composição de uma cena como Original completo,
Mestre ou Jogadores. Todas as chamadas continuam restritas ao dono da aventura;
não há portal, link público, grant, compra, upload ou licença comercial implícita.
Não ampliar para leitor completo da aventura nesta etapa: partes/cenas continuam
organizadas no planejador, e cada cena tem sua prévia completa paginada.

Original completo (`creator` como modo de prévia) inclui todos os blocos ativos;
Mestre inclui gm + players; Jogadores inclui players. Isso não altera o significado
de `audience: creator` de um bloco, que permanece segredo nos outros dois modos.
O texto principal é um bloco na sua ordem atual; blocos arquivados não entram.

## APIs e DTOs

| API                         | Entrada                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `getAdventureBlockImage`    | adventureId, resource                                               |
| `setAdventureBlockImage`    | adventureId, resource, operationId, expectedRevision, image ou null |
| `readAdventureScenePreview` | adventureId, sceneId, audience, cursor?, limit?                     |
| `readAdventurePreviewImage` | adventureId, sceneId, audience, projectionToken, imageKey           |

`resource` é `{kind: scene | block, id}` do contrato anterior. `image` é somente
`{imageId, alt, caption}`; alt até 1.000 caracteres e caption até 4.000, ambos
validados no servidor. Não receber URL, caminho, MIME, dono ou contador do cliente.
`getAdventureBlockImage` retorna `{revision, image: {imageId, name, alt, caption} | null}`;
é DTO privado de autoria, sem URL permanente. `set` retorna a mesma
AdventureBlockMutation (mainBodyHash e totais confirmados incluídos), liberando a
próxima escrita somente após aceitar a revisão com a base correta.

Prévia retorna `{items, nextCursor, projectionToken}`. Item contém somente
`{key, title, narrativeType, html, image: {imageKey, alt, caption} | null}`.
Não incluir sceneTitle/partTitle/adventureSynopsis, planning, referências, fichas,
aliases, notas, histórico, hashes de manuscrito ou totais/posições dos excluídos.
Título do bloco principal usa mainBlockTitle, nunca título privado da cena como
fallback. Keys identificam somente itens já permitidos; não são grants.

`readAdventurePreviewImage` retorna `{dataUrl}` de derivado seguro da imagem,
sem imageId, caminho Storage ou URL com token da biblioteca. Uma imagem não ganha
audiência própria mais permissiva: herda a do bloco. Remover vínculo usa null.

## Uso da biblioteca e concorrência

Reutilizar ImageLibraryPicker público. Seleção envia ID; servidor autoriza projeto,
cena/parte/bloco e imagem ativa da mesma conta. Principal guarda referência aditiva
mainBlockImage; adicional guarda image. Uma ilustração por bloco mantém duplicação
e alteração limitadas e atômicas; outros blocos podem apresentar outras imagens.

Criar/trocar/remover vínculo atualiza metadado do bloco, revisão real, cena/projeto,
recibo e uso da imagem na mesma transação. Uso tem namespace por tipo, aventura e
identidade do bloco, sem colidir com bookId usado pelas capas. Incrementar/decrementar
useCount só com mudança real; retry não duplica uso. Deleção de imagem vinculada
continua bloqueada. Corrupção de contador falha sem inventar zero.

Duplicar bloco copia sua imagem e cria o uso da cópia na mesma transação do novo
texto/metadados. Imagem revogada/indisponível causa falha inteira; nada parcialmente
pronto. Arquivar conserva vínculo; excluir adicional libera o uso na limpeza
retomável antes de finalizar. História restaura só texto, preservando a imagem e
audiência atuais. Livros/capas e seus jobs mantêm os contratos existentes.

## Projeção e mídia

O servidor filtra audiência/arquivo ANTES de ler ou devolver corpos. Consultas de
extras são por sceneId, archived/deleting, audiência permitida e ordem/ID, com
principal virtual mesclado de forma limitada. Página padrão 25/máximo 50 metadados,
mais orçamento de 4 MiB para JSON UTF-8 projetado; isso comporta um corpo válido
mesmo após escapar texto. Se a soma exceder a página, parar antes do próximo item
e continuar pelo último item incluído; nunca truncar um bloco ou pular o excedente.
Primeiro item que não couber falha explicitamente e conserva a origem.

Token vincula UID/aventura/cena/modo/revisão real. Cursor inclui somente escopo
opaco e o último item PERMITIDO, sem IDs/posições de itens secretos examinados.
Mudança de corpo, ordem, audiência, arquivo ou imagem invalida páginas antigas.
Cliente cancela e limpa páginas/mídias ao mudar modo, conta, alvo ou token; erro
de acesso limpa conteúdo anterior em vez de conservar um preview indisponível.

HTML é reconstruído no servidor com whitelist usando parse5 já existente:
parágrafos, títulos, ênfases, listas, citação, código e quebra/regra. Não devolver
script/style/form/iframe/objetos, atributos de lore, href/src, URLs/token de imagem
ou HTML original escondido por CSS. Nenhuma ficha de lore é expandida na projeção.
Conteúdo literal escrito pelo autor em um bloco permitido mantém seu texto.

imageKey é referência opaca ao bloco permitido e token da projeção, não a imageId.
Cada entrega reautoriza cena/bloco/audiência/imagem antes e depois do I/O e rejeita
alteração de token ou revogação. Criar derivado por sharp já instalado: dentro de
1.024 × 1.024, WebP, sem metadados; orçamento 1,5 MiB de bytes. Não alterar original.
Não devolver bytes nem dataUrl parcial em falha. Paths vêm só do registro de imagem
autorizado. A URI base64 é permitida no DTO de transporte da prévia, nunca persistida
em documento Firestore ou histórico.

## Interface, integração e arquivos

Feature adventure-blocks expõe editor de ilustração e diálogo de prévia somente
leitura, alimentado por DTO próprio. Mostrar imagem apenas com alt/legenda
projetados. Loading/vazio/erro/retry/paginação por modo, teclado/foco e três temas.
Original completo permite conferir todos os textos ativos, sem mudar a API legada
readSceneAssembly, que só tem consumidor de livros na UI atual.

Host do principal e editor adicional reservam escrita antes de escolher/confirmar
imagem, serializados com autosave/histórico e recibos incertos. Não buscar nova
base para aceitar uma resposta. O seletor pode fechar antes de iniciar a mutação;
depois de iniciar, pedido estável é conservado até confirmar. Falha mantém seleção
e preenchimento quando possível. Prévia não monta RichEditor, contexto privado,
SceneReferences ou o DTO completo do editor.

Servidor: novos adventurePreview*.mjs, extensão limitada do escritor de blocos e
imageLibrary/uses, assets de derivado, exports/índices/regras/testes. Frontend:
modelos/serviços/hooks/componentes públicos de adventure-blocks e integrações dos
editores. Transporte fica separado e aliasável no native; filtro/controle de
paginação/renderer no cliente não devem ser substituídos por fixture.

## Validação e aceite

- Original conserva texto e imagem; Mestre/Jogadores recebem somente o permitido.
- Segredo ausente do DTO e HTML, incluindo títulos de agrupadores, atributos de
  lore, URLs, caminhos, imagem privada, cursor e respostas tardias.
- Vínculo/troca/unlink/duplicação/deleção/replay preservam useCount e direitos;
  falha/revogação não deixa cópia parcial nem mídia antiga disponível.
- Metadados e prosa mantêm CAS, contagem, arquivo e histórico do subincremento 1.
- Aventura independente continua manual, sem saldo/IA/universo obrigatório.
- Testes dirigidos de serviço, projeção, bytes e SDK; navegador com ilustração,
  três modos, teclado, 320 px, temas, erro e revogação. Revisão independente.
- Só depois deste aceite fechar F2-06 com validate, documentação e entrega.
