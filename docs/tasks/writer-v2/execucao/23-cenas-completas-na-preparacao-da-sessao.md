# F2-08 S2B — Cenas completas na preparação da sessão

**Estado:** implementado e validado localmente; CI do novo head pendente.
**Dependência:** [S2A](22-referencias-de-lore-da-sessao.md), validado localmente no
commit `d9b7988`, enviado ao PR; CI geral e regras 145/145 verdes.
**Origem:** [F2-08](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md),
[captura B](15-captura-de-aventura.md), [blocos](12-aventuras-e-blocos.md) e
[adoção C3B](19-adocao-explicita-de-base-da-campanha.md).

## Objetivo e limites

Vincular cenas da base ativa da aventura à sessão, consultar o planejamento e
todos os seus blocos capturados, incluindo principal, adicionais e ilustrações.
Não copiar material para o texto autoral S1 nem alterar cena, aventura ou universo.
A leitura continua particular ao criador. Audiência é metadado do bloco, sem
compartilhamento, revelação ou execução automática.

A cena capturada contém content e planejamento; o bloco main aponta ao mesmo corpo
content. Ler somente a cena omite adicionais; concatenar content da cena e main
conta o principal duas vezes. A consulta terá planejamento separado e blocos
selecionados na ordem capturada. Não carregar toda a prosa da cena no navegador.

Cena ausente após adotar base nova fica indisponível: não há legado de cenas,
fallback à base anterior, novo pin histórico ou procura por nome. Fichas legadas
C2 continuam com seu próprio contrato aprovado. Origem revogada não impede S1.

Cenas e blocos em Arquivo continuam preservados e consultáveis por ação explícita,
com indicação de arquivo; não entram silenciosamente na composição ativa.
Pistas, missões e pendências permanecem em S3. Não concluir toda F2-08 com S2B.

## Suposições e esforço

Não há escolha humana indispensável identificada: captura integral privada,
separação da preparação própria e regras de arquivo já foram aprovadas. A leitura
usa a base ativa atual e deixa indisponível o que ela não contém. Não criar retenção
histórica de cenas por analogia com a decisão específica de lore legado.

Capacidade informada: 20 h brutas/semana, hipótese de entrega 16 h. Reestimar o
esforço humano deste recorte após revisão dos leitores de blocos/imagem; não usar
6/8/14 h ou metade de S2A. Horas realizadas e saldo restante não foram informados.
A baseline histórica da timeline não é previsão de lançamento.

Referência provisória total (O/C/P), confiança baixa: backend/manifestos/mídia
12/20/32 h, UI/contratos/guardas 12/20/34 h e QA/regressões/docs 10/16/26 h,
somando **34/56/92 h**. O reuso elimina novo journal/C4/pins, mas não a prova dos
novos leitores. Estimativas individuais divergiram; adota-se esta faixa explícita
para não repetir a antiga divisão de S2. Não é hora realizada, saldo nem data.

## Reuso e persistência

Reusar os quatro namespaces S2A e o mesmo controle de coleção por sessão:

```text
campaigns/{cid}/sessionReferences/{referenceId}
campaigns/{cid}/sessionReferenceState/{sessionId}
users/{uid}/campaignSessionReferenceOperations/{operationId}
users/{uid}/campaignSessionReferenceFences/{operationId}
```

Alvo ativo passa a ser union fechada `{kind:'lore'|'scene', sourceKey}`. Sem título,
prosa, imagem, caminho, URL, bodyBinding, anchor ou hash privado persistidos no
vínculo/journal/recibo. Duplicata é por sessão/kind/sourceKey; tombstones e revisão
contínua permanecem. Novo vínculo não reutiliza ID. Não criar job ou namespace.

A mesma revisão de coleção serializa lore/cenas. Alteração em um tipo invalida a
página do outro; não altera revisão da preparação S1. Recibos, cancelamento, CAS
integral, intent persistido e recuperação externa mantêm S2A. Historical replay
vem antes da sessão ativa/origem, mas após campanha própria/reserva C4.

## Compatibilidade de ABI

Cinco APIs S2A continuam com os mesmos nomes e outcomes. List recebe
`kind?: 'lore'|'scene'`, omissão SEMPRE lore. Filtrar no servidor antes de entregar
linhas; cliente antigo não recebe union scene ou novos campos top-level. ADD
aceita target scene explicitamente; remove/resolve não mudam shape. READ lore
rejeita referência scene antes de resolver corpo.

A union de list fica fechada:

```ts
type Archive = 'active' | 'archived' | 'all';
type ListInput = SessionScope & { cursor?: string; limit?: number } & (
    | { view: 'references'; kind?: 'lore' | 'scene' }
    | { view: 'candidates'; kind?: 'lore'; sourceContext: SourceContext }
    | { view: 'candidates'; kind: 'scene'; sourceContext: SourceContext; archive?: Archive }
  );
```

Archive só entra em candidates scene e no leitor de blocos, com active padrão.
Não acrescentar campos às respostas lore. Cursor inclui kind, view e archive aplicável. Cursor anterior S2A sem kind pode ser recusado com
cursor-invalidated e consulta explícita nova; nunca reinterpretado como scene.
Journals lore existentes continuam válidos byte-shape. Cliente antigo que encontre
controle scene desconhecido o preserva; não o transforma nem apaga. Código servidor
antigo em warmstart pode falhar fechado diante de scene; implantação conjunta é
condição operacional, sem afirmar compatibilidade de writers antigos em execução.

Lore candidate/row preservam o DTO S2A. Scene candidate/target usa DTO próprio,
sem category/mode/legacy ou revisão fictícios de ficha:

```ts
type SceneCandidate = {
  kind: 'scene';
  sourceKey: string;
  title: string;
  stage: string | null;
  archived: boolean;
};
// Disponível: ReferenceMetadata & {available:true,target:SceneCandidate}
// Indisponível: ReferenceMetadata & {available:false}, sem alvo ou título antigo.
```

Stage ausente no snapshot é null, sem inventar estado confirmado. Categoria,
estágio e audiência não concedem acesso. Candidates scene usa janela de metadados
25/50+1 e ordenação capturada orderKey/ID; archive active padrão, arquivo explícito.
Não confundir ordenação da base com ordem manual dos vínculos (fora deste recorte).

## Gates e contexto observado

List/references e candidates conferem autenticação, reserva C4, dono/encarnação,
sessão ativa/revisão e controle da coleção; revisão da coleção entra na resposta
inicial e no cursor. Esses inputs não exigem vínculo individual ou revisão de
coleção fornecida. Os três leitores vinculados conferem também referência
ativa/revisão e expectedReferenceCollectionRevision antes de qualquer material. Bloco deve ser kind block e parentKey igual à cena vinculada.
Não aceitar bloco de outra cena, vínculo de outra sessão ou imagem escolhida por
caminho pelo cliente.

Reusar SourceContext C2 `{baseId,projectionToken}`: inclui geração/revisão e epoch
UID. É conservador: mudar lore pode invalidar consulta de cena também. Não usar
entityHash/manifest hash como sinal de autorização. Contexto antigo ainda autorizado
retorna source-context-changed, sem adotar corpo novo. Ausência raiz normal retorna
contexto null/material neutro; corrupção, dono/token divergente ou C4 continuam erro.
Universo atual indisponível não torna uma cena privada da aventura indisponível
por si só, nem deve anular o legado autorizado de outro universo no painel lore.

## Três leitores específicos propostos

```ts
type ReadReferenceScope = SessionScope & {
  referenceId: string; expectedRevision: number;
  expectedReferenceCollectionRevision: number; sourceContext: SourceContext;
};
type SceneReadEnvelope = ReferenceEnvelope & {
  referenceId: string; referenceRevision: number; sourceContext: SourceContext|null;
};
listCampaignSessionSceneBlocks(ReadReferenceScope & {archive?:Archive;cursor?:string;limit?:number})
  -> SceneReadEnvelope & {
    scene: SceneCandidate|null; items: BlockSummary[]; nextCursor:string|null;
  };
readCampaignSessionSceneReference(ReadReferenceScope & {blockKey?:string;cursor?:string;limit?:number})
  -> SceneReadEnvelope & {
    blockKey:string|null; // eco do input ou null para plano
    resourceKey:string|null; resourceKind:'scene-plan'|'block';
    material:null|{item:ProjectedItem;chunks:CampaignBaseChunk[];nextCursor:string|null};
  };
readCampaignSessionSceneImage(ReadReferenceScope & {blockKey:string})
  -> SceneReadEnvelope & {
    blockKey:string; imageKey:string|null; dataUrl:string|null;
  };
```

Sem blockKey, resource é planejamento da cena: somente objective/conflict/
pointOfView e metadados projetados; nunca content. Com blockKey, exige filho da
cena e retorna somente esse bloco/content. Principal é lido somente por seu item
main, uma vez. Os DTOs ficam fechados assim:

```ts
type NarrativeType =
  'introduction' | 'preparation' | 'scene' | 'location' | 'quest' | 'clue' | 'ending';
type BlockSummary = {
  kind: 'block';
  sourceKey: string;
  parentKey: string;
  title: string;
  orderKey: string;
  type: NarrativeType;
  audience: 'creator' | 'gm' | 'players';
  role: 'main' | 'additional';
  archived: boolean;
  ownArchived: boolean | null;
};
type PublicManifest = { field: string; sha256: string; bytes: number; chunkCount: number };
type ScenePlanItem = {
  kind: 'scene-plan';
  sourceKey: string;
  title: string;
  stage: string | null;
  archived: boolean;
  fields: PublicManifest[];
};
type SceneBlockItem = BlockSummary & {
  fields: PublicManifest[];
  image: { imageKey: string; alt: string; caption: string } | null;
};
type ProjectedItem = ScenePlanItem | SceneBlockItem;
```

Sem origin/bodySourceKey, caminho Storage, binding, contadores internos ou corpo
de outro recurso. OwnArchived do principal é null (não aplicável), pois não foi
capturado separadamente; não inventar false como dado confirmado. No adicional
vem de structured.ownArchived capturado e é obrigatório/booleano. Archived efetivo
do main coincide com scene.archived; do adicional com scene.archived OR ownArchived. Não inventar composição ativa para
cena arquivada; indicar Arquivo da cena e consultar seus blocos arquivados por
seleção explícita. A ordem capturada pode colocar main depois de outro bloco.

ResourceKind casa item.kind e resourceKey casa item.sourceKey em toda página com
material. Quando indisponível, resourceKey e material são null; não reexpor a key
armazenada da cena revogada. BlockKey top-level ecoa somente o input conhecido,
nunca deriva outro alvo. ReferenceId/revision e contexto continuam conferidos.
Ausência de imagem, bloco ou origem retorna imageKey/dataUrl null juntos; quando
presentes, imageKey deve coincidir com o metadado do bloco selecionado.

Reusar validação de item, projetores e loadContent de B na MESMA transação após
gate de sessão. Para plano, validar todos os descritores capturados sem carregar
content e então selecionar os campos de planejamento; filtrar antes de validar
não pode mascarar manifesto corrompido. Validar binding interno antes de corpo:
scene e bloco additional usam bodySourceKey igual à própria sourceKey; main usa a
key da cena e seu descritor content deve ser idêntico ao content da cena. Conferir
parentKey, role, identidade de origem capturada e aventura da base. Regex hash
sozinha não prova pertença. Extrair validador puro de formato/duplicatas/hash/bytes/
chunks/total de todos os descritores; a validação estrutural do plano não comprova
o hash dos bytes main ainda não lidos. Esse hash é conferido ao ler o bloco main.
Não chamar o loader HTTP de B por trás.

Corpo mantém os limites de B: 4 chunks por padrão, 8 no máximo, cada chunk≤64KiB,
≤2MiB por item e resposta≤4MiB. Não criar limite artificial para o conjunto de
blocos. Cliente verifica bytes, chunks, UTF8, hashes e identidade estável em todas
as páginas antes de renderizar. Nenhuma composição parcial é apresentada como
texto inteiro. Campos de planejamento não capturados são sinalizados, sem inventar
vazio confirmado. HTML do bloco usa renderRichText seguro já compartilhado.

Imagem é obtida somente pelo bloco autorizado. Reusar readBaseImageAccess,
checkCapturedImageStorage, geração e pin campaign-base; revalidar TODOS os gates
antes/depois de readGeneration e derivação. Conferir identidade da mídia e tamanho,
entregar WebP limitado (origem≤16MiB, derivado≤1,5MiB), nunca URL/caminho/credencial.
Binding privado da mídia inclui UID/campanha/token, sessão/revisão, referência/
revisão/coleção, sourceContext, cena, bloco, imageKey e identidade do pin. Comparar
binding completo nas reautorizações, sem expor o digest ao cliente. HTTP private,no-store também
nos erros da aplicação, conforme wrapper existente B; não afirmar cobertura de
respostas AppCheck/CORS anteriores ao callback. Sessão excluída ou vínculo
removido durante I/O impede qualquer byte.
Storage injetado em testes é evidência distinta de Storage real.

## Interface e arquitetura

S1 segue folha auth/shared; slot público sem prosa. Campaigns mantém composição e
OR de pendências. Campaign-session-references pode usar deliberadamente tipos e
verificador puro públicos de campaign-bases além das APIs puras C2; nenhum loader
B fora do gate de sessão. Atualizar regra AST/AGENTS somente para esse reuso.

CampaignSessionReferencesPanel mantém API pública e vira host único com áreas
Fichas/Cenas em Dropdown. Um hook de operação e uma ReferenceRecoveryActions no
slot; controles globais atuais permanecem fora. Filhos privados cuidam de listas,
ScenePicker e SceneReader. Trocar área/arquivo limpa derivados, sem remontar S1.
Picker de cenas e renderer de plano/blocos usam DTOs próprios. Não adaptar cena a
LoreCandidate nem duplicar recuperação em dois painéis visíveis. Fechar seletor,
leitor ou imagem volta ao opener no diálogo S1; GET tardio não reabre material.
Uma cena vinculada abre planejamento e lista paginada dos blocos; selecionar bloco
lê/valida somente seu texto. Ilustração é ação explícita, com alt/legenda capturados.
Arquivo tem estado visível e consulta deliberada; não concatena filhos arquivados
como manuscrito ativo. S1 permanece editável quando consulta derivada falha.

UID, sessão/revisão, referência/revisão, coleção, sourceContext, bloco e imagem
integram guardas de RAM. Foco, troca/fechamento e projeção observada limpam derivados
antes do GET; não acumular corpos e imagens de todos os blocos. Journal continua
metadata-only, único UID/campanha, recuperável sem sessão existente.

## C4 e rollout

Mesmas coleções/recibos/fences: C4 v3 já cobre os novos alvos. Não criar v4 ou
reinterpretar inventários v1/v2/v3. Conferir limpeza de vínculos scene e reserva
antes dos novos leitores, inclusive mídia durante exclusão. Nenhum novo pin por
vínculo: a base congelada mantém seus pins existentes.

Implantar oito APIs, guardas, readers/writers, regras/índices pertinentes e C4
conjuntamente e drenar versões antigas antes da UI. Não há deploy, migração real,
exclusão de dados do operador ou novo processamento pago autorizado por este plano.

## Tarefas e critérios de aceite

1. [x] Fechar DTOs/ABI, arquivo, seleção de descritores e composição pública.
2. [x] Evoluir referência kind opt-in preservando lore e recuperação antigos.
3. [x] Implementar leitores session-scoped de plano/blocos/mídia com testes de gates.
4. [x] Implementar composição/picker/leitor seguros e testes de draft/foco/recovery.
5. [x] SDK real com captura completa, main compartilhado/adicionais/arquivo, páginas,
       wrong parent, ausência após adoção, perda de sessão/vínculo durante I/O e C4v1/v2/v3.
6. [x] Duas jornadas × seis perfis, sem ampliar matriz sem risco concreto.
7. [x] Validate no fechamento, revisão, docs/ADR/AGENTS/evidência, commit/envio.
8. [x] CI da correção `56cbb06` e regras verdes, acompanhadas em paralelo.

Aceite: vincular cena atual, consultar plano e principal/adicionais na ordem
capturada uma vez, imagem particular do bloco e arquivo explícito; referência
indisponível pode ser removida, S1/original/outra mesa preservados. Lore antigo
continua compatível. Cursores/UID/contexto, cancelamento histórico e corpo/mídia
após gate inválido têm negativos; nenhuma resposta tardia repõe material antigo.

## Matriz de validação revisada

Cinco famílias SDK: (1) compat lore/kind/view, CAS compartilhado, cursores e SDK
fechado; (2) captura real com Unicode/chunks, plano sem content, main compartilhado,
adicionais/páginas/arquivo; (3) wrong parent/escopos e cena ausente após adoção,
sem confundir universo indisponível com perda da cena ou legado lore U1;
(4) mídia e revogação após download/derivação, pin/generation/tamanho;
(5) histórico/fence scene e limpeza C4v1/v2/v3. Drivers usam revisão de recibo
confirmado e consultam páginas nas asserções finais, evitando O(n²).

Duas jornadas em seis perfis: J1 vínculo de cena, planejamento, principal uma vez,
adicional depois da primeira página, arquivo, imagem explícita, troca de bloco,
foco/320 px e S1 dirty; J2 pedido incerto/reload/fence, adoção retirando cena sem
fallback, remoção independente da origem, resposta derivada tardia e C4/closer
preservando controle lore antigo. Não repetir toda matriz S2A. Corrupções de
manifest/chunk e corridas detalhadas ficam em unidades dirigidas; SDK prova os
gates reais, transporte visual não comprova autorização ou Storage real.

## Não escopo e riscos

Legado de cenas, nova captura/migração de bases, notas no vínculo, concatenação
integral automática, edição de blocos, revelação, jogadores, pistas/missões, IA,
backup, histórico e mídia permanente ficam fora de S2B.

Riscos: main duplicado; adicionais ignorados; B HTTP fora do gate de sessão;
imagem entregue após revogação; cliente S2A recebendo union inesperada; arquivo
tratado como composição ativa; manifesto parcial tratado como texto inteiro;
recovery duplicada ou bloqueada pela origem. Critérios e testes tratam as fronteiras.

## Evidência de fechamento local

`npm run validate` exit 0: 189 arquivos/1.935 testes frontend, 84 scripts e
395 Functions, sem falhas/skips; build e smoke verdes. Cinco famílias SDK únicas
comprovadas; primeira execução 5/5, reforço de cursores com uma falha de expectativa
corrigida e repetição somente da família afetada. Chromium 12/12, sem retry/skip,
75.352,899 ms. Revisão independente encontrou dois P2 de refresh e filtro atual;
ambos têm negativos antes/depois e nenhum bloqueador restante. [Entrega S2B](../../../entregas/2026-10-18-writer-v2-cenas-completas-da-sessao.md).
CI de cacd71e: regras 150/150 verdes; geral falhou por prazo no antigo cenário
visual J2. Correção em 2026-10-21 separa dois comportamentos independentes,
preservando as 69 asserções e acrescentando duas. Afetados 12/12 sem retries;
validate repetido verde (1.935 frontend, 84 scripts, 395 Functions). CI da correção
será acompanhada em paralelo; não confundir com aprovação do head anterior.
A entrega vinculada registra traces, lotes e limites da evidência.

CI final da correção `56cbb06` confirmada em 2026-10-21: [geral](https://github.com/gaabrielrd/writer/actions/runs/39586473749)
com 17 jobs verdes, incluindo doze shards visuais; [regras](https://github.com/gaabrielrd/writer/actions/runs/39586473753)
verdes. S2B concluído tecnicamente, sem merge/deploy. S3 segue em seu próprio contrato.
