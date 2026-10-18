# F2-08 S2A — Referências de lore da sessão

**Estado:** implementado e validado localmente; CI do novo head pendente.
**Dependência:** [S1](21-sessoes-privadas-da-campanha.md), validado localmente e
enviado em `c95253a`; CI geral e regras remotas verdes (140/140 nas regras).
**Origem:** [F2-08](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md),
[C2](17-variantes-de-lore-da-campanha.md), [C3B](19-adocao-explicita-de-base-da-campanha.md)
e [C4](20-exclusao-integral-da-campanha.md).

## Objetivo e recorte

Vincular fichas efetivas do lore da mesa a uma sessão e consultar o material
autorizado sem copiar nome, alias ou prosa para o plano autoral. Incluir variantes
e fichas legadas que já permanecem autorizadas pelo contrato C3B. Um vínculo
indisponível não bloqueia a preparação própria ou a consulta aos demais vínculos.

O recorte seguinte S2B trata cenas e seus blocos completos; S3 trata pistas,
missões e pendências. Não simular cena como apenas seu Texto principal. S2A não
conclui a preparação completa de F2-08. A divisão anterior de S2 12/16/28 h
servia como hipótese inicial. Recibos/fences, projeção legada e composição de
diálogos exigem reestimar S2A/S2B antes de atualizar a timeline; não apresentar
6/8/14 h por metade como capacidade confirmada. Capacidade solo 20 h/semana,
hipótese de entrega 16 h/semana; horas humanas realizadas não foram informadas.
Não há data comprometida nem estimativa de trabalho restante validada.

Referência provisória de esforço humano total de S2A (O/C/P): backend/projeção/
fences/C4 12/20/32 h, cliente/picker/renderer/slot/recuperação 12/18/28 h e
QA/SDK/navegador/docs 10/16/24 h, somando **34/54/84 h**. Confiança baixa;
não são horas já gastas nem saldo restante. S2B depende do contrato de cenas,
blocos completos e mídia antes de receber nova faixa. A timeline conserva a
baseline de 13/10 como histórica, sem usá-la como previsão atual de F2-08.

Não há pergunta humana indispensável: base congelada, legado autorizado e
privacidade já foram decididos. Ordenação manual de vínculos, lore vivo de universo
em campanhas independentes e permanência histórica de cenas ficam fora deste recorte.

## Dados próprios e projeção derivada

```text
campaigns/{cid}/sessionReferences/{referenceId}
campaigns/{cid}/sessionReferenceState/{sessionId}
users/{uid}/campaignSessionReferenceOperations/{operationId}
users/{uid}/campaignSessionReferenceFences/{operationId}
```

Referência schema 1: dono, campanha/token preciso, sessionId, id, revision contínua,
createdAt/updatedAt do servidor e deleted. Ativos têm somente alvo
`{kind:'lore', sourceKey}`. Não persistir título, categoria, alias, anotação, prosa,
hash do corpo, anchor, bodyBinding, caminho, URL, chave ou imagem. Tombstone remove
o alvo, conservando identidade/revisão/datas mínimas contra replay.

Criar usa referenceId igual a operationId novo. A mesma ficha ativa só pode estar
vinculada uma vez por sessão; consulta de duplicata limitada a um resultado, com
comparação atômica do controle da coleção. Remover e vincular novamente cria nova
identidade, sem reutilizar tombstone. Não criar índice autoral por nomes.

Controle por sessão contém schema/dono/campanha/token/sessionId e revision dos
vínculos. Ausência só equivale a zero após consulta limitada que prove ausência
de referências, inclusive tombstones. Controle perdido/corrompido não é reparado
silenciosamente. Alterar vínculos não incrementa a revisão do texto S1.

Recibos/fences são seletivos por campaignId, contêm somente identidade,
fingerprint e resultado mínimo. Não guardam payload projetado ou sourceContext
inteiro. C4 os reduz a marcadores mínimos. Regras SDK permanecem fechadas.

## Identidade e autorização

Toda consulta material, inclusive páginas de candidatos do seletor, confere
autenticação, reserva C4, dono/encarnação da
campanha e sessão ativa/revisão observada antes de resolver alvo ou ler corpo.
Não aceitar referência de outra sessão/campanha. Uma sessão S1 tombstonada deixa
todos os seus vínculos imediatamente indisponíveis. Seus IDs flat ficam somente
no servidor até C4, sem afirmar apagamento físico imediato desses metadados.
Se vínculos futuramente receberem notas ou nomes copiados, essa retenção deixa de
ser suficiente e exige limpeza própria antes de habilitar tais campos.

Lore resolve pelo contexto C2 atual: base, variante inteira ou legado autorizado.
Não receber anchor no cliente, resolver por nome, consultar lore vivo ou recuperar
título antigo do vínculo. Modo removed/inactive, ficha ausente e revogação normal
produzem linha neutra indisponível. Corrupção estrutural continua erro explícito,
sem inventar lista vazia nem truncar texto.

O envelope material combina base ativa, geração/revisão efetiva e projeção C2,
incluindo seu epoch de autorização por UID. Reusar loreContext/loreEnvelope,
loreRecord/loreState/projectEntity; não usar entityHash como sinal de mudança.
Uma mudança de base/projeção invalida páginas e leitura composta sem rebasear S1.

## ABI proposta para revisão

Cinco APIs específicas, sem serviço genérico de jobs:

```ts
type SessionScope = {
  campaignId: string; campaignToken: string;
  sessionId: string; expectedSessionRevision: number;
};
type SourceContext = { baseId: string; projectionToken: string };
type ReferenceEnvelope = {
  schemaVersion: 1; ownerId: string; campaignId: string; campaignToken: string;
  sessionId: string; sessionRevision: number; referenceCollectionRevision: number;
};
type ReferenceMetadata = {
  id: string; revision: number; createdAt: number; updatedAt: number;
};
type ReferenceRow = ReferenceMetadata & (
  | { available: false }
  | { available: true; target: {
      kind: 'lore'; sourceKey: string; name: string; category: string;
      revision: number; mode: 'base' | 'override'; legacy: boolean;
    } }
);
type LoreCandidate = {
  sourceKey: string; name: string; category: CampaignLoreCategory;
  revision: number; mode: 'base' | 'override'; legacy: boolean;
};
type ListReferencesInput = SessionScope & { cursor?: string; limit?: number } & (
  | { view: 'references' }
  | { view: 'candidates'; sourceContext: SourceContext }
);
listCampaignSessionReferences(ListReferencesInput)
  -> ReferenceEnvelope & (
    | { view: 'references'; sourceContext: SourceContext | null;
        items: ReferenceRow[]; nextCursor: string | null }
    | { view: 'candidates'; sourceContext: SourceContext | null;
        items: LoreCandidate[]; nextCursor: string | null }
  );
addCampaignSessionReference(SessionScope & {
  referenceId; operationId; expectedReferenceCollectionRevision;
  sourceContext: SourceContext; target: { kind: 'lore'; sourceKey: string };
}) -> ReferenceOutcome;
removeCampaignSessionReference(SessionScope & {
  referenceId; operationId; expectedRevision; expectedReferenceCollectionRevision;
}) -> ReferenceOutcome;
readCampaignSessionLoreReference(SessionScope & {
  referenceId; expectedRevision; expectedReferenceCollectionRevision;
  sourceContext: SourceContext;
}) -> ReferenceEnvelope & {
  referenceId: string; referenceRevision: number;
  sourceContext: SourceContext | null;
  material: null | { kind: 'lore'; sourceKey: string; revision: number;
    mode: 'base' | 'override'; legacy: boolean; entity: CampaignLoreEntityView };
};
resolveCampaignSessionReferenceOperation({
  action: 'add' | 'remove'; request: AddInput | RemoveInput; intent: 'cancel';
}) -> ReferenceOutcome;
```

SourceContext null representa campanha independente ou indisponibilidade normal
do gate raiz da base/aventura. Universo atual indisponível não anula todo contexto:
legado de outro universo ainda autorizado continua disponível. Ficha/universo
isolado indisponível afeta somente suas linhas. Não converter C4, dono/token
divergente, schema inválido ou corrupção em null por catch amplo. A resolução
opcional deve classificar explicitamente a ausência autorizada. S1 continua
independente. O seletor só aparece quando há contexto autorizado. Vincular,
consultar candidatos e ler corpo exigem igualdade da base/projeção observadas;
mudança retorna `failed-precondition` com reason `source-context-changed`, sem
material novo ou adoção automática. Origem raiz atualmente indisponível retorna
contexto null e nenhum material/candidato após o gate da sessão. Remover referência
própria não depende da autorização da origem.

Listar 25 por padrão, máximo 50, um lookahead, somente metadados projetados,
ordenados por createdAt/ID crescentes na view references. Candidatos reutilizam
a janela limitada e a ordenação de C2, incluindo legado autorizado; não carregar
todo o catálogo para filtrar no navegador. Cursor fechado vinculado à view, UID, campanha,
token, sessão/revisão, revisão dos vínculos e sourceContext observado, inclusive
null. Nenhuma página antiga é misturada depois de mudança de projeção. Tamanho
máximo 4 MiB; declarar índices e limitar cada resolução. Não carregar corpos na lista.

Leitura inteira só acontece pelo vínculo ativo e sessão conferida, na mesma
transação dos projetores C2. Devolver somente os campos projetados de exibição,
sem entityHash ou descriptor. CampaignLoreEntityView contém name, aliases, category
(character/location/concept/other), summary, details, structuredDetails com
appearance/personality/history/notes e relações autorizadas com targetKey,
relationType, description e targetName. Reusar um renderer público puro de C2 para esse DTO;
não buscar corpo por um segundo GET C2 que escape ao gate da sessão.

## Recibos históricos e encerramento de pedido

```ts
type ReferenceReceipt = {
  operationId: string;
  action: 'add' | 'remove';
  referenceId: string;
  sessionId: string;
  expectedSessionRevision: number;
  expectedReferenceCollectionRevision: number;
  revision: number;
  referenceCollectionRevision: number;
};
type ReferenceOutcome = {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  sessionId: string;
} & (
  | { kind: 'confirmed'; receipt: ReferenceReceipt }
  | { kind: 'canceled'; action: 'add'; request: AddInput }
  | { kind: 'canceled'; action: 'remove'; request: RemoveInput }
);
```

Recibo confirma somente o evento original, sem corpo, nome ou revisão atual do
alvo. Uma revisão posterior do vínculo ou da sessão não apaga esse evento.
Repetição confere fingerprint exato e identidades antes de confirmar; não escreve.
O gate de campanha própria/C4 vem antes do recibo. A conferência histórica da sessão
é de identidade, não exige que continue ativa para reconhecer metadados do evento.

Adicionar começa revisão 1. Remover confirma expectedRevision + 1. Ambas confirmam
referenceCollectionRevision igual à coleção esperada + 1. O envelope do resultado
é identidade do evento, não um snapshot material atual. Canceled ecoa o request
metadata-only integral congelado; validar sua igualdade exata após reload, sem
armazenar esse request inteiro no fence servidor (somente fingerprint). O cliente encerra o pedido
e consulta explicitamente a lista atual, sem adotar corpo pelo recibo.

Novos add/remove exigem sessão ativa na revisão observada. Replays exatos e
resolver histórico conferem a identidade congelada, sem exigir sessão existente,
ativa ou revisão atual. Separar esses gates antes de resolver origem ou recibos.

Pedido ainda desconhecido pode ser encerrado por intenção explícita: o resolver
valida o input congelado, gate da campanha e registro opaco, sem consultar corpo,
base ou alvo. Se já existe recibo, retorna confirmação e não desfaz o vínculo.
Caso contrário grava fence mínima e retorna canceled. Mutação atrasada com o mesmo
input encontra essa fence antes de qualquer resolução do alvo e não executa.
Outro fingerprint não pode sequestrar ou cancelar uma operação diferente.

Persistir a intenção de encerramento sob Web Locks/CAS **antes** do RPC, substituindo
somente o snapshot integral observado. Após reload, repetir cancelamento em vez de
reenviar a mutação original. Resposta perdida do resolver mantém esse mesmo controle.
Erro de permissão/origem indisponível sozinho não prova cancelamento e não limpa
journal. Sessão apagada não impede resolver metadados próprios; campanha C4 usa
a prova permanente e o closer já previsto.

## Interface e composição

Proposta de feature `campaign-session-references`, sem dependência de S1/C4; importa
auth/shared e somente APIs públicas deliberadas de C2. Campaigns compõe um slot
público de referências no editor S1 salvo, preservando montagem e texto autoral.
Slot recebe somente campaignId, campaignToken, sessionId, sessionRevision, isActive
e readOnly; montagem vinculada à identidade/epoch da sessão salva, sem título/summary.
Não anexar campos ao Session S1 fechado nem permitir imports inversos em S1.

API pública mínima C2: seletor paginado puro com loader injetado, ligado ao
envelope/projectionToken observados, onSelect retorna somente sourceKey. Em S2A
o loader usa listCampaignSessionReferences view candidates, nunca listCampaignLore
sem gate da sessão; renderer puro da ficha projetada
e tipos/validador de exibição correspondentes. Reusar esses componentes, sem
abrir o editor de variantes para escolher uma ficha. O leitor existente pode usar
o mesmo renderer, sem alterar seus contratos de edição/recuperação.

Vínculos formam lista separada do texto. Ação Vincular ficha abre seletor, mostra
somente nomes atuais autorizados; leitura é particular e não oferece edição da
origem. Linha indisponível mostra apenas estado neutro e Remover vínculo.
Preparação S1 permanece utilizável quando a projeção derivada falha. Fechar
seletor/leitor aninhado restaura foco no opener dentro do diálogo S1 e preserva
texto dirty; GET atrasado não substitui rascunho nem reabre material. Não desabilitar
o opener antes de capturar o foco a restaurar.

Journal único por UID/campanha para vínculos, com request e intenção inteiros,
somente IDs/tokens/revisões. Sem nomes, prosa ou chaves persistidos. Listeners,
Web Locks, persistência confirmada antes do RPC, CAS integral e HTTP fora do lock.
Uma operação incerta bloqueia outra; dois widgets não substituem seu controle.

Controle de recuperação fica descobrível também fora do diálogo S1, inclusive
após reload ou exclusão de sessão. Encerrar pedido não promete desfazer vínculo
já confirmado. Campaigns agrega pendência própria sem liberar a de S1/gestão e
compõe closer público na revisão C4. Journal inválido/futuro/B sobre A é preservado.

UID, campanha, sessão/revisão, vínculo/revisão, base/projeção e revisão da lista
integram a guarda do leitor. Resposta atrasada não repõe nomes, aliases, categorias,
relações ou corpo. Lista/foco não enviam mutações nem rebaseiam a preparação.
Erro C4 próprio validado oculta antes do CAS, sem apagar o journal automaticamente.

## Exclusão C4 v3 e habilitação

Novos starts usam cleanupVersion 3. V1 preserva recovery 3/children 7; v2 preserva
4/9; v3 acrescenta os dois namespaces de recibo/fence e as duas coleções flat,
ficando 6/11. Mesmos limites por etapa, whitelist terminal sem versão interna e
falha fechada para versão desconhecida. Não reinterpretar partes antigas.

Adicionar recursos em campanha já reservada por job v1/v2/v3 é proibido. Antes de
habilitar writers/UI, implantar serviço, guardas, C4 start/advance, regras/índices
e drenar versões antigas, inclusive start v2. Manutenção Admin respeita o protocolo.
Sem deploy, migração de dados reais ou limpeza de conta neste planejamento.

## Tarefas sequenciais e critérios

1. [x] Rever ABI, deltas/recibos, cancelamento, projeção e APIs públicas C2.
2. [x] Implementar serviço/contextos bounded, recibos/fences e testes de domínio.
3. [x] Compor APIs e C4 v3 com compatibilidade v1/v2; regras/índices e SDK real.
4. [x] Implementar picker/renderer públicos C2 e regressões dos consumidores atuais.
5. [x] Implementar referências, journal/recuperação/closer e slot composto em campaigns.
6. [x] Validar duas jornadas × seis perfis, teclado/foco, três temas e celular.
7. [ ] Validate de fechamento, revisão, docs/ADR/AGENTS e entrega; commit/envio autorizados.
8. [ ] Acompanhar CI do próprio head sem bloquear estudo independente.

Critérios: vincular/ler/remover ficha efetiva e legado autorizado sem alterar
S1/original; duplicata não cria outro vínculo; alvo revogado não revela nome e pode
ser desvinculado; outra sessão/campanha intacta. Replays históricos/fences, duas abas,
UID, sessão tombstonada, controle perdido, cursor/projeção antiga e C4 v1/v2/v3
devem ter negativos significativos, sem escrita parcial ou corpo antes do gate.

Navegador usa transporte simulado; SDK real comprova os gates. Não confundir
fixtures, CI verde anterior, piloto humano ou Storage/rollout em produção.
Testes dirigidos durante ajustes e validate no fechamento; sem alterar limites,
exclusões, retries ou timeouts.

## Não escopo e riscos

Cenas/blocos/imagens, lore vivo de campanhas independentes, busca global por nomes,
ordem manual de vínculos, notas nos vínculos, pistas/missões, consequências, jogadores,
compartilhamento, cânone, IA, backup e histórico de referências ficam fora de S2A.

Riscos centrais: leitor C2 fora do gate da sessão; contexto antigo ressuscitar
nome/relacionamento revogado; journal preso após perda da origem; cancelamento
perdido reenviar adição; controle do texto S1 adotado por metadados; C4 antigo criar
job sem as novas coleções. As tarefas e critérios tratam cada fronteira.

## Resultado local

`npm run validate` exit 0: 186 arquivos/1.910 testes frontend (143,94 s),
83 scripts (9.333,2792 ms) e 383 Functions (2.962,1547 ms), sem falhas/skips.
Cobertura 90,65% instruções, 84,98% ramos, 90,35% funções e 93,21% linhas;
limites/exclusões intactos. A primeira tentativa parou no lint de um mock novo;
corrigido somente o teste, o validate completo passou. Build 1,38 s e smoke OK.

Cinco famílias SDK únicas comprovadas, com primeira execução 3/5 positiva e duas
falhas de IDs globais no preparo do teste. Repetição afetada 2/2 verde; driver
foi otimizado sem reduzir mutações/asserts e somente famílias 3/5 foram repetidas,
2/2 verdes. Não há alegação de batch único 5/5. Doze combinações nativas passaram
(70.338,127 ms), zero retries/skips/flaky/erros. Console/pageerrors/externos em zero;
seis capturas 320 px inspecionadas pela raiz nos três temas. Fontes de produto
permaneceram congeladas durante a matriz e após o validate.

Ver [entrega S2A](../../../entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md)
e [ADR 0038](../../../decisions/0038-session-lore-references.md). Commit/envio e CI
são acompanhados separadamente; F2-08 completa, cenas/blocos e S3 continuam abertos.
