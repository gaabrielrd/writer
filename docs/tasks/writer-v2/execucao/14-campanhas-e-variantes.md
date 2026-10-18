# F2-07 — Campanhas e variantes particulares

**Estado:** A concluído tecnicamente em 624c912, captura B em f97455d e notas C1 em bda5e70, com CI verde.
Variantes C2 e comparação C3A concluídas tecnicamente em fe10b15, com CI/regras verdes.
Adoção explícita C3B e exclusão integral permanecem pendentes.
**Origem:** [W2-F2-07](../fase-02-criar-e-preparar/07-campanhas-e-variacoes.md).
**Base:** F2-06 concluído tecnicamente em `624c912`, com CI e regras verdes.

## Resultado

Duas mesas podem partir da mesma aventura e conservar base e mudanças particulares,
sem escrever no original ou promover cânone automaticamente. Campanhas independentes
existentes continuam privadas e úteis. Participação, portal e sessões têm tarefas
próprias; compra de edição entra em F4-12.

## Decisões fechadas

[D-02](02-modelo-de-dominio.md) já exige base congelada, variante de entidade inteira,
comparação/aceite explícitos para atualização e nenhuma resolução por nome.
[Permissões](03-permissoes-e-privacidade.md) aplicam o mesmo gate de procedência e
privacidade a base/variante, inclusive comparação/descarte; notas próprias ficam
separadas e não são apagadas por revogação de conteúdo derivado.

Escolhas recebidas em 2026-10-15:

1. Capturar a aventura completa: partes, cenas, blocos e ilustrações. Um simples
   vínculo ou snapshot só de lore não satisfaz esse resultado.
2. Capturar somente fichas de lore referenciadas na aventura. Não capturar todas
   as fichas do universo nem oferecer seleção manual como política alternativa.

Referência exige identidade explícita autorizada; detectar um nome no texto ou
percorrer relações de outra ficha não autoriza ampliar o conjunto de captura.

O subincremento A usa somente metadados e vínculo organizacional das campanhas
independentes já existentes; não depende dessas escolhas nem cria cópia derivada.

## Descoberta do estado atual

- studio.mjs já cria/get/lista campanha independente com operação idempotente,
  título, descrição, estado planning e universo próprio opcional.
- CampaignPage oferece descrição, checklist privado e retomada; não possui mutações.
- prepareUniverseProjectLink aceita campanha e usos/contador por tipo.
- LoreScope aceita book/universe; serviços SDK e rótulos Público no leitor não
  servem diretamente para base/variante de campanha.
- adventure.revision sozinho não observa cenas, planejamento ou imagens. Captura
  futura precisa snapshot preciso da aventura e versões atuais do universo/lore.

## Subincremento A — Gestão da campanha independente

### Escopo fechado

Editar título/descrição, escolher estado planning/active/completed/archived e
trocar/desvincular universo organizacional próprio. A volta do arquivo é escolha
explícita de estado, sem inventar estado anterior de campanhas legadas.
Preservar ID, dono, createdAt, procedência, descrição não alterada e checklist.
Nenhuma operação altera universo/lore global, texto de aventura, crédito ou IA.

Exclusão integral fica no fechamento de F2-07, após conhecer bases e seus usos.
Não implementar hoje uma limpeza que ignore os filhos que a captura introduzirá.

### API e transação

`updateCampaign({campaignId, operationId, expectedRevision, patch})` retorna Campaign
confirmada. Patch fechado com title, description, status, universeId opcionais e
ao menos um campo. Manter limites existentes: título até 300 e descrição até 4.000;
estado enumerado; universo próprio ativo ou null. UID/dono, datas, procedência,
contadores e revisões nunca vêm do patch.

Reautorizar dono e campanha disponível, comparar revisão real observada e gravar
metadados, vínculo/usos do universo, revisão, updatedAt monotônico e recibo na mesma
transação. Reutilizar prepareUniverseProjectLink sem ignorar inconsistência de
contadores: validar inteiro seguro, limites e uso esperado antes de seu commit;
não zerar, saturar ou fabricar contadores de universo existente. Universo removido
pode ter referência órfã retirada sem criar registro/contador substituto.

Recibo em users/{uid}/campaignOperations/{operationId}, com fingerprint de alvo,
patch e revisão, sem cópia de descrição. Mesmo pedido não aplica duas vezes nem
reativa campanha removida. Reautorizar replay; se houve edição posterior, conflito
impede apresentar confirmação antiga como nova base. Dono errado, deleting ou
procedência não suportada falha sem escrita. Não ampliar a mutação a futuras bases
antes de conferir seus contratos.

### Cliente e recuperação

Serviço/transporte de campanha separados para substituir somente callables no
navegador. Controlador por UID/campanha; ID/payload estáveis guardados no adaptador
privado antes de enviar. Uma resposta incerta bloqueia novo pedido até reconciliação.
Não enviar uma nova revisão obtida em GET silenciosamente; aceitar o DTO confirmado
do próprio pedido somente na identidade atual. Troca de conta/alvo ignora resposta
tardia e conserva o pedido da conta original para sua recuperação.

Diálogo Editar campanha com Input/Textarea/Dropdown e UniverseSelect público; campos
mantêm preenchimento no erro. Cancelar antes da mutação não escreve. Durante pedido
incerto, fechar não libera outra edição. Conflito preserva campos e exige ação
explícita para descartar alterações e carregar versão atual; nenhuma reaplicação
automática. Loading/vazio/erro/retry seguem shared/ui, três temas, teclado e 320 px.

Página aceita resultado confirmado sem nova base implícita, atualiza estado e
universo exibidos e conserva checklist. Alterar vínculo não muda procedência nem
é promoção de cânone. UI não anuncia sessões, captura ou compartilhamento prontos.

### Arquivos e validação

Backend: novo functions/src/campaigns*.mjs, index, integração limitada de validação
de usos em universes se necessária, testes unitários e SDK. Preservar APIs legadas.
Frontend: features/campaigns, página/modelos/serviços/adaptador/controlador/diálogo,
testes colocalizados; APIs públicas de universes/lore sem importar internos.
Fixtures de campanha/Estúdio e um spec nativo; alias somente do transporte novo.

Provar mutação/replay, dois pedidos concorrentes, dono errado, patch fechado,
contadores corretos na troca/unlink, universo indisponível, datas preservadas e
checklist intacto. UI prova cancelamento, resposta perdida, conflito, conta/alvo
tardios, próxima edição com revisão confirmada, arquivo/restauração explícitos,
tema e teclado. Testes dirigidos após ajustes; registrar resultados reais. A gestão
independente será registrada como incremento próprio após validate completo no seu
fechamento, sem reexecutar a suíte global a cada ajuste. Isso não encerra F2-07,
cujos demais critérios dependem das decisões e etapas abaixo.

### Evidência intermediária — 2026-10-15

- Backend dirigido campanhas/Estúdio/universos: 30/30, incluindo sete casos novos.
- SDK real novo: 4/4, zero skips, 12.486,5685 ms; emulador encerrado.
- Frontend dirigido: 22/22; após ajuste do controlador, três afetados repetidos e verdes.
- Controles externos de fixtures: 4/4. Um negativo comprovou replay sem reautorizar
  universo removido; helper compartilhado corrigiu a fixture e os quatro passaram
  novamente, sem alterar o servidor ou fabricar evidência de segurança.
- Revisão independente do frontend: nenhum P0/P1/P2 no escopo; revisão backend
  cobriu transação, autorização, recibo e contadores.
- Navegador: 36/36; após integrar correção de foco do histórico, 12/12 afetados,
  sem retries/skips/falhas. Validate final exit 0: 1.494 frontend, 77 scripts e
  265 Functions. A registrado/enviado em 624c912; CI e regras terminaram verdes,
  incluindo oito shards/agregador, produção 7/7 e Firestore 103/103.
- [Evidência de gestão e foco](../../../entregas/2026-10-15-writer-v2-gestao-de-campanhas.md).

## Captura e variantes

O [contrato de captura B](15-captura-de-aventura.md) fecha persistência, limites,
API, leitura própria e validação antes do código. B foi implementado após o
fechamento local de A: validate, SDKs reais, 36 percursos e seis controles finais
de interface passaram. Veja a [entrega de captura](../../../entregas/2026-10-15-writer-v2-captura-de-aventura.md).
Variantes/atualização/exclusão integral terão planos próprios; CI de B verde em f97455d.

Para manter incrementos pequenos, C foi separado em C1 notas autorais próprias,
C2 variantes de lore e C3 comparação/adoção explícita. O
[contrato C1](16-notas-proprias-da-campanha.md), revisado antes do código, estabelece
o recurso independente cuja preservação será conferida nas etapas derivadas.
Notas não recebem cópia automática da base; variantes continuam ligadas à origem.

C1 está concluído tecnicamente em bda5e70, com CI e regras verdes.
O [contrato C2](17-variantes-de-lore-da-campanha.md) foi fechado após revisões
independentes e está concluído tecnicamente em fe10b15, com CI/regras verdes. Oferece ficha inteira particular,
retirada/restauração/descarte e recuperação cifrada com autorização atual também
dos alvos de relações. Não antecipa troca de activeBaseId ou exclusão integral.

O [incremento C3A](18-comparacao-de-bases-da-campanha.md) está implementado e
concluído tecnicamente em fe10b15: candidata completa e comparação de origem, itens,
referências e ilustrações por identidade, sem alterar a base ativa. CI/regras verdes;
ver [entrega C3A](../../../entregas/2026-10-17-writer-v2-comparacao-de-bases.md).
C3B continua responsável pela [adoção explícita](19-adocao-explicita-de-base-da-campanha.md)
e continuidade das variantes/pedidos antigos; exclusão integral conserva
incremento próprio. Comparação isolada não encerra C3 ou F2-07.

Trabalhar em gerações preparing/ready/aborted. activeBaseId só muda no commit final;
preparação parcial nunca substitui uma base pronta. Paginar metadados 25/50, mas
limitar também bytes/leituras de corpos por etapa; não gravar cinquenta fichas de
900 KB em uma transação. Preservar Unicode/HTML e não truncar.

Durante a captura de uma base ainda em preparação, o token da origem inclui UID,
alvo e timestamps precisos de aventura/universo, vínculo, sceneRevision/narrativeRevision
e loreVersion/privacyVersion pertinentes. Revalidar em cada etapa e na finalização
da captura; origem alterada aborta essa preparação e mantém base ativa, sem adotar
revisão nova em retry.

Uma candidata ready já está congelada: edição comum posterior da origem não a
recaptura nem impede sua adoção apenas por mudar conteúdo. C3B verifica gates
atuais, encarnação, base ativa, revisão C2 e epochs de autorização conforme seu
contrato; não usa o sourceToken completo como CAS final. Mudança de autorização
exige nova conferência explícita, preservando a candidata congelada.

Variantes referenciam sourceKey estável e substituem a entidade inteira; revisão
contínua e modos base/override/removed evitam reaplicação antiga após descarte.
Comparação mostra adicionadas, alteradas, retiradas e variantes em conflito.
Base/variante derivadas não viram nota independente ao editar/renomear. Notas
próprias são filhos separados, sem cópia automática de campos derivados.

Leituras diretas SDK permanecem negadas. Consultas por servidor autorizam campanha,
procedência e privacidade atuais antes de corpo, aliases, relações ou mídia.
Origem indisponível não expõe versão antiga por busca, comparação ou cache.
Trocar vínculo organizacional não troca procedência da base. Mídia capturada,
quando aprovada, precisa usos tipados da campanha e entrega autenticada própria;
reutilizar prévia viva da aventura não satisfaz congelamento.

## Ordem seguinte e aceite global

Após A e contrato operacional: implementar uma jornada de criação/base,
variantes inteiras, comparação/atualização explícita e limpeza de ciclo integral.
Planos detalhados dessas etapas antecedem seu código. Não marcar F2-07 concluído
apenas por editar campanhas independentes.

- Duas campanhas isolam consequências e variantes sem gravar no original.
- Origem alterada durante captura nunca ativa mistura de versões.
- Revogação não reaparece por comparação, descarte, exportação ou cache.
- Vínculo atual pode mudar sem apagar notas e sem alterar procedência.
- Retry não duplica campanha, vínculo, base ou uso de imagem.
- Exclusão explícita revoga acesso antes da limpeza retomável de todos os filhos.
- Validate, SDKs, navegador dirigido, documentação/ADR/AGENTS, entrega e Git; CI em
  paralelo com conclusão remota separada, conforme a sequência autorizada.
