# ADR 0101 — Adoção atômica da geração de lore

- Estado: aceita para serviço interno; exclusão/consumidores/cliente e rollout pendentes.
- Data: 2026-10-23.
- Contexto: [plano 86](../tasks/writer-v2/execucao/86-adocao-atomica-das-geracoes-de-lore.md).

## Consentimento e commit

Publicação e originalConsent nas Rules exigem isPublic true explícito. Ausência
permanece privada; o default visual legado de mapLocal não é autoridade.
Adoção reabre certificado ready e inspeção autorizada da mesma origem, resolve
o valor final no servidor e valida clocks/epochs sem coerção.

O mesmo commit troca a cabeça v2, ativa a geração, aposenta a anterior controlada,
avança localLoreVersion/updatedAt, grava hasLoreResources e recibo do pai.
createdAt existente é preservado. Timestamp avança além de lore/livro atuais;
datas/counters inválidos ou esgotados impedem o commit inteiro.

Quando consentimento explícito true sai, o commit também muda status para draft,
incrementa publicationPrivacyVersion e remove publicBooks. Não há publicação
automática ao tornar uma ficha pública. Versões públicas antigas ficam históricas,
com o acesso público revogado.

O stub pode espelhar isPublic explícito calculado no servidor para originalConsent.
Readers aceitam esse booleano, mas inspeção usa o conteúdo lógico e recusa
divergência. Ausência não ganha consentimento. Payload/stub continua imutável
pelo SDK; o espelho não autoriza composição ou edição.

## Adoção das leases e escala

A transição preparing para active tem evento nativo adopt-preparation e hash da
adoção, junto do recibo do pai e atualização da cabeça. Pai fica adopted e não
aceita cancelamento nem adoção nova. Replay confirma o evento próprio, inclusive
após edição posterior/revogação/exclusão da raiz, sem reaplicar dados.

Todas as leases vinculadas são logicamente adotadas por essa transição.
O phase físico reserved permanece como fence; não se fazem N writes por página.
Estado da geração, contexto original, pai/slot/job/lease e recibo nativos são
a prova, nunca a string adopted alegada.

Geração ativa protege seus corpos. Depois de aposentada, resolver a lease exige
a mesma prova original e só permite continuar a coleta normal: cabeça atual,
referências de outras gerações e nascimentos ainda protegem o corpo.
Controles, leases e recibos permanecem após coletar bytes.

Registrar uma fonte de geração preparada exige a prova nativa da adoção e da
cabeça atual, em vez de comparar seu contexto com o contexto anterior à edição.
Aposentadoria é irreversível; o pai permanece sucesso histórico.

## Marca servidor e limites

hasLoreResources só é escrito no servidor, não pode ser criado/removido pelo
SDK e bloqueia exclusão legada da raiz. A exclusão coordenada desses livros
ainda precisa de integração; não habilitar o serviço ao cliente antes disso.

Certificados históricos não comprovam disponibilidade física futura. Guards de
lease/referência impedem as limpezas legítimas durante a preparação; readers
continuam conferindo os artefatos nativos e recusando divergências.

Serviço interno, sem callable/UI/worker ou deploy. Criação/exclusão, todos os
writers/consumidores, backup lógico/indexado e cliente seguem obrigatórios.
P1/F2-09/Writer V2 continuam em andamento.
