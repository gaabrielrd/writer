# F2-07 C3B — Adotar explicitamente uma candidata da campanha

**Estado:** planejamento em revisão; implementação não iniciada. A escolha de
produto abaixo e os contratos técnicos indicados ainda precisam ser fechados.
**Base:** C3A validado localmente e enviado em `fe10b15`; regras remotas verdes e
CI geral em paralelo na primeira consulta.
**Origem:** [D-02](02-modelo-de-dominio.md), [campanhas](14-campanhas-e-variantes.md),
[C2](17-variantes-de-lore-da-campanha.md), [C3A](18-comparacao-de-bases-da-campanha.md)
e [ADR 0034](../../../decisions/0034-campaign-base-comparisons.md).

## Objetivo

Depois de comparar uma candidata congelada, permitir ao mestre decidir sobre as
variantes inteiras e adotar essa geração explicitamente. Manter a base anterior
legível durante a preparação; confirmar a nova base e o lore da mesa coerentes
no mesmo commit. Notas próprias C1, outra campanha e original permanecem intactos.

Uma edição normal posterior do original não recaptura nem substitui a candidata
ready. Adotar exatamente a candidata comparada, com autorização/privacidade atuais.
Revogação, troca da base/campanha ou edição C2 concorrente são condições distintas.

## Escolha de produto pendente

Pergunta enviada ao operador em 2026-10-17: uma ficha adaptada pela mesa deixa de
ser referenciada na candidata, embora a origem continue autorizada. Oferecer:

1. Manter a ficha como legado da campanha, vinculada à origem e aos mesmos gates;
   opção recomendada, ainda sem resposta.
2. Exigir descarte explícito da variante antes da adoção, conservando a base atual
   enquanto isso.

Não assumir resposta por tempo decorrido. Essa escolha também delimita restauração,
descarte e relações do legado. Não expandir automaticamente os alvos por relações,
não resolver por nome e não converter conteúdo derivado em nota independente.

## Requisitos e decisões já estabelecidos

- Atualização é opcional e explícita; não é um flip isolado de activeBaseId.
- Variantes substituem entidades inteiras, sem merge por campo ou cânone automático.
- Retiradas preservam previousMode; revisões não reiniciam ao descartar/reintroduzir.
- bodyRevision identifica os bytes confirmados, separada da revisão do overlay.
- Pedidos cifrados continuam no escopo original. Antes da adoção, confirmar ou
  encerrar explicitamente os pedidos C2 da base atual, inclusive de outro dispositivo.
  Não transferir chave, ciphertext, AAD ou header para outra base.
- Journal vazio neste navegador não comprova ausência de pedidos remotos. Fence
  de admissão deve anteceder a auditoria paginada e impedir prepare/save tardios.
- Sem autorização, não ler/copiar corpos ou exibir nomes, relações ou hashes ocultos.
  Notas autorais próprias continuam independentes da origem.
- Preparação/cancelamento são limitados e retomáveis; confirmação incerta conserva
  o mesmo método/input/ID. Nenhum avanço automático a partir de marcador conhecido.
- CI segue em paralelo após fechamento local; testes afetados durante ajustes e
  validate completo no fechamento, sem enfraquecer hooks ou limites.

## Descoberta confirmada

Revisores consultaram o graph, que não retornou os símbolos; usaram os arquivos
conhecidos e contratos atuais como fallback.

C2 vincula estado, overlay e leitor à base ativa. Os IDs de chunks incluem
campaignToken, baseId, sourceKey e bodyRevision; paths ativos são fixos. Regravar
baseId nos overlays sem preparar corpos/ponteiros compatíveis quebraria o leitor.
Migrar no lugar antes do commit também quebraria a base anterior ainda ativa.

O journal IndexedDB é único por UID/campanha e recover rejeita header de outra base.
Trocar o ponteiro esconderia o caminho de recuperação de um pedido antigo. Um
ciphertext recuperável selado exige chave já criada no servidor; controles locais
nunca recebidos podem existir sem chave/ciphertext e precisam de encerramento
explícito, sem bloquear indefinidamente o novo lore após a adoção.

supportedCampaignProvenance exige provenance.baseId igual à base ativa. Campanha
tem provenance `{kind:'original',adventureId,baseId}` e activeBaseId; não tem
captureId/source. O commit atualiza activeBaseId e provenance.baseId juntos,
preservando kind/adventureId e o universo organizacional atual. captureId pertence
à preparação/recibos B históricos, que não serão regravados como outra captura.

Replay da ativação B exige hoje a base inicial ainda ativa e falha fechado depois
de adoção. Dados antigos não guardam a âncora createTime dessa ativação; não inferir
encarnação por UID/ID/adventureId iguais. Decisão técnica: preservar essa autoridade
estrita e oferecer resolução somente de metadados do recibo histórico próprio,
sem DTO atual ou prova da encarnação presente.

`resolveCampaignCaptureActivation({captureId,operationId,expectedCheckpoint})`
retorna schemaVersion/ownerId/request integrais, outcome activated/aborted e
confirmedCheckpoint. Consulta apenas campaignCaptureOperations do UID; confere
fingerprint digest de `{method:'activate',...inputOriginal}`, captureId e checkpoint
inteiro igual ao esperado + 1. aborted true indica aborto e marcador ausente indica
ativação; valores inconsistentes são rejeitados. O recibo legado já é atômico com
a criação original, logo não se inventa uma âncora retroativa.

Ausência retorna operation-unconfirmed sem escrita/fence; não prova que a ativação
em trânsito não executará. O cliente preserva o journal. Confirmação válida permite
limpar somente o controle integral correspondente por CAS e depois consultar a
rota normal, sem reconhecer root atual/recriado como a encarnação original.

C3A permite descartar candidata sem a origem, necessário para limpeza. Uma
candidata adotada precisa de estado/indicação próprios e proteção no servidor:
cancelamento ou replay nunca pode liberar seus filhos/pins, mesmo após outra
adoção futura. Disputa entre descarte e reserva/ativação deve ter um único vencedor.

## Jornada proposta

1. Abrir “Revisar atualização da campanha” na candidata pronta; identificar as duas
   bases e suas datas, sem consultar prosa viva para completar a candidata.
2. Conferir pedidos C2 locais/remotos. Recuperar/confirmar ou encerrar cada pedido
   explicitamente antes de preparar. Se a auditoria sob fence encontrar pendência,
   abortar e liberar a admissão, permitindo resolver o pedido e tentar novamente.
3. Revisar decisões paginadas por sourceKey/revisão: manter variante inteira ou usar
   ficha candidata; preservar retirada ou voltar explicitamente à base nova.
   O tratamento da ficha ausente depende da escolha de produto pendente.
4. Para adaptar texto, voltar ao editor C2 da base atual. O save invalida o plano
   anterior; nova comparação/conferência deve ser explícita, sem rebase de escolhas.
5. Preparar geração de lore isolada em etapas, mantendo os leitores atuais. Expor
   progresso real, falhas e cancelamento sem descartar implicitamente a candidata.
6. Confirmar a adoção atomicamente e remontar leitores pela nova identidade. Recibo
   exato permite confirmar resposta perdida; controles globais continuam descobríveis.

## Contratos técnicos a fechar antes do código

### Gerações, revisões e corpos

Preparar uma geração privada isolada de lore; C2 resolve o armazenamento pelo
ponteiro ativo, com fallback explícito para o layout legado. Incluir metadados de
todos os overlays/tombstones, não apenas os que aparecem na candidata, para
preservar revisão contínua em reentrada futura.

Decisão técnica após auditoria: usar binding interno achatado para o corpo
confirmado, separado da base lógica do overlay, sem cópia obrigatória de chunks.
O binding identifica layout legado ou geração, base física e bodyRevision; dono,
campanha, token e sourceKey vêm do contexto. Não aceitar paths do cliente ou
encadear bindings. Preservar manifesto/bodyRevision dos bytes mantidos.

Novos saves gravam corpo na geração ativa. Save/discard removem o corpo anterior
pelos refs do binding validado; isso inclui corpo fisicamente legado. Gerações
inativas não oferecem histórico de versões de variantes. Cancelamento de staging
nunca apaga chunks emprestados; limpeza recursiva de armazenamento referenciado é
proibida. Gates atuais precedem leitura de corpo/cabeçalhos/hash: transportar
metadados privados não concede acesso à prosa indisponível.

Fence e revisão global protegem contra escritor que apague/troque o corpo durante
staging. Por ser layout novo, validar negativamente binding cruzado de dono,
campanha, encarnação, ficha, base física e bodyRevision, incluindo geração ausente
ou inconsistente. Fallback para legado só ocorre por ausência explícita do ponteiro;
não interpretar geração inválida como autorização para procurar outro corpo.

Adotar incrementa uma vez a revisão global C2 e a revisão de cada overlay
materializado, inclusive base/tombstones, sem reiniciar. bodyRevision fica igual
quando os bytes não mudam. `removed→base` preserva retirada e, ao restaurar, usa
a ficha candidata; `removed→override` preserva retirada e a variante confirmada.
Escolher ficha candidata remove o override do novo estado por decisão explícita.
Metadados name/category de modo base ou previousMode base precisam corresponder
à candidata, evitando divergência entre lista e GET. Definir o ramo de ficha ausente
após a escolha de produto; recurso revogado permanece internamente inerte.

Uma relação autorizada incompatível não pode
sumir silenciosamente da decisão “manter variante”; resolver explicitamente ou
impedir essa escolha até edição da ficha. Relação revogada não revela nome ou
vínculo oculto em avisos. Não ampliar captura transitivamente.

### Admissão, pendências e concorrência

Fence pertence a uma adoção/encarnação específicas. Cancelar J1 nunca libera J2.
Todos os prepare/save C2 pertinentes precisam revalidar a barreira na transação;
resolver/encerrar recibos próprios continua possível. Se houver pedido aberto,
liberar a barreira antes de exigir recuperação que precise aplicar a mutação.

Definir enumeração paginada de pedidos remotos, ausente das APIs atuais, sem chave
ou prosa. Considerar abertos prepared/committed com closed diferente de true;
consulta por closed igual a false perderia documentos antigos com campo ausente.
Não interpretar página vazia ou falta de resposta como cancelamento.

O resolver C2 atual confere UID/descriptor e consulta o recibo privado sem ler
root/base/origem; confirm/cancel antigo continua possível após troca/revogação e
cancel ausente cria fence. Expor essa saída metadata-only para journal antigo,
inclusive confirmed ou pedido nunca recebido sem chave/ciphertext. Não tentar
recuperar plaintext da base antiga nem limpar o registro sem escolha explícita.

Commit final compara encarnação, base corrente, candidata pronta, escolhas,
revisão C2 e autorização. Atualiza todos os ponteiros/controle/procedência/recibo
no mesmo commit; não regrava notas ou metadados próprios de uma cópia antiga.
Comparação recebe adopted permanente: nunca voltar a ser descartável, mesmo após
uma segunda adoção. Preparações/cancelamentos concorrentes consultam o claim e
o estado na mesma transação; só um pode vencer, sem confiar no botão do cliente.

### Retenção, cancelamento e acesso

Definir retenção da base anterior e das gerações que sustentam corpos/legado.
Cancelamento limpa somente staging próprio, sem apagar candidata, base anterior,
pins de outra geração ou autoria da mesa. A exclusão integral continua em etapa
própria e deverá enumerar todas essas gerações/controles/chaves/pins.

Fechar estados, DTOs, identidades, cursores, orçamentos por etapa e índices antes
da implementação. Coleções privadas permanecem negadas ao SDK direto. No cliente,
controles mínimos, CAS integral, propriedade de leitura por geração e guardas
após awaits seguem os contratos corrigidos em C3A.

## Sequência de implementação proposta

1. Receber a escolha de produto; fechar ABI/modelo/limites e revisão independente.
2. Implementar staging e admissão C2 com regressões do layout legado.
3. Implementar decisões e ativação/recibos/cancelamento; proteger C3A adotada.
4. Compor revisão/recuperação pela interface pública, sem ciclo entre features.
5. Validar afetados, SDK real e navegador dirigido; revisar e executar validate.
6. Atualizar ADR/arquitetura/regras/entrega e Git; acompanhar CI sem merge/deploy.

Não iniciar o passo 2 com as alternativas contratuais deste documento abertas.

## Matriz de validação proposta

Unitários cobrem decisões inteiras, modos/revisões/manifestos, falha por etapa,
CAS/fences/recibos, limites e respostas atrasadas; não repetir todas as combinações
no navegador.

SDK real, cinco famílias: adoção com mais de 25 overlays e Unicode grande;
pedidos/barreira remotos; concorrência/encarnação/refence; ramo de legado escolhido
e autorização; falhas/cleanup/pins com C1/original/outra mesa intactos. Assets
injetados não comprovam Storage real ou versionamento do bucket.

Navegador proposto: duas jornadas nos seis projetos e um controle desktop, 13
execuções. Adoção completa cobre decisões, retirada/restauração/edição posterior,
geração congelada, teclado/foco/320 px/temas. Bloqueio/recuperação cobre pedido C2
remoto, fechamento explícito, confirmação perdida/reload e conflito sem rebase.
Controle específico usa adaptadores/Web Locks/IDB reais com transporte simulado
para corrida C2/adoção; nenhuma cifra ou autorização é inferida da fixture.

Regressão dirigida B: resolver recibo antigo após adoção, remoção e recriação do
root confirma somente o evento histórico; não recria/reconhece recurso atual.
Input divergente e recibo ausente preservam o journal; activate original conserva
o gate estrito. Cobrir CAS de resposta antiga e sessão, sem repetir toda a matriz B.

## Revisão técnica de planejamento — 2026-10-17

Auditorias de backend, cliente e QA identificaram as dependências e lacunas
registradas acima. O rascunho incorpora staging isolado, binding imutável achatado,
revisões/tombstones contínuos, fence antes da auditoria, candidata congelada,
proteção permanente de adopted e resolver histórico B sem autoridade sobre root
atual. A revisão operacional final ainda está pendente; nenhum código ou teste
C3B foi executado.

A decisão humana sobre ficha ausente permanece pendente. Depois dela, fechar
modelo/DTOs públicos, estados/cursores/orçamentos e lista de arquivos afetados na
revisão operacional antes de implementar; a escolha não autoriza inferir regras
de legado, expansão de relações ou novas permissões.

## Riscos e não escopo

O maior risco é continuidade de corpos/pedidos enquanto muda a base; um ponteiro
isolado não satisfaz o produto. Barreira indefinida também não pode impedir o mestre
de resolver a própria pendência. Autorização pode mudar durante staging/leitura;
projeção/limites e retomada precisam de provas próprias.

Fora deste incremento: merge por campo, promoção de cânone, cópia automática para
notas, migração de ciphertext/chaves, recaptura viva, rollback automático de adoção,
sessões/participantes, publicação/comércio e exclusão integral da campanha.
