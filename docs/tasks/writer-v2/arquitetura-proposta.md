# Arquitetura proposta para Writer V2

## Estado e origem

Proposta para implementação futura, subordinada às decisões da fase 1.
Não descreve módulos já implementados nem cria regra vigente por si.
A arquitetura atual continua em [architecture.md](../../architecture.md).

Inspeção desta rodada: grafo `E-Mega-dev-writer`, documentação e snippets de
`publicationService.publishBook` e `exportManuscript`.
O primeiro prepara projeções públicas e troca versão com verificação da origem;
o segundo exporta manuscrito e backup privado com lore/personas/atos.
Na implementação, revalidar o checkout: o grafo e as branches paralelas podem evoluir.

## Aproveitar a base

| Capacidade existente | Reuso planejado                             | Proteção                                                                                |
| -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| books/editor         | Livros, cenas, prosa de aventuras e leitura | Preservar IDs, autosave, atos, seleção e conteúdo legado                                |
| universes/lore       | Base e variantes por projeto                | Mutações globais no servidor; prioridade local e revogação monotônica                   |
| ai-assistant         | Apoio de escrita autorizado                 | Personas privadas, contexto autorizado, cancelamento e débito só no aceite              |
| image-library        | Capas e materiais de aventura               | Seleção pela API pública, referências/exclusão no servidor e acesso de arquivo revisado |
| publicação pública   | Leitura grátis e amostras permitidas        | Não hospedar corpo pago em publicBooks nem relaxar suas regras                          |
| exports/importação   | Conteúdo editável e arquivos portáveis      | Revisão explícita de importação; backup privado distinto de edição distribuível         |

## Módulos candidatos e responsabilidades

| Módulo proposto | Responsabilidade                                                 | Interface pública esperada                                           |
| --------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| adventures      | Conteúdo autoral de aventura, partes/cenas, pistas e audiência   | Tipos, serviços autorizados e telas de preparação                    |
| campaigns       | Instâncias, sessões, participantes, materiais e consequências    | APIs de sessão, variantes e projeções de jogador                     |
| editorial       | Rodadas, comentários, sugestões e pendências                     | Projetar versão para revisão e aplicar sugestão validada             |
| access          | Convites e participação por recurso                              | Criar/aceitar/revogar e consultar permissões de forma explícita      |
| publications    | Edições, preparação/ativação, projeções e artefatos              | Criar edição, consultar acesso e gerar arquivos autorizados          |
| creator/catalog | Perfil público, vendedores convidados, séries e ofertas visíveis | Metadados públicos permitidos e submissão acompanhada                |
| commerce        | Oferta, cotação, pedido, eventos, razão, direito e reversão      | Compra/estado/direito por serviço; operações financeiras no servidor |
| library         | Consumo autorizado, leitura/download e retomada                  | Listagem dos direitos e abertura da edição permitida                 |

Confirmar separações pela necessidade real; não criar feature para cada substantivo sem justificativa.
Dados e regras de cada domínio ficam na sua feature. Componentes acessam serviços, nunca HTTP/armazenamento diretamente.
Interfaces públicas via `index.ts`; `shared` fica neutro e `app` compõe rotas/providers sem regra de negócio.
Não adotar novo estado global, plataforma de busca ou dependência sem medir a necessidade.

## Dados e vínculo

Livros antigos conservam coleção/IDs. Novos contratos separam aventura original, edição e campanha.
Cada recurso relevante inclui dono/escopo, revisão, origem, datas do servidor e ciclo de vida.
Vínculo com universo é opcional. Campanha tem estado próprio e não expõe diário ao criador da aventura.
Uma variante prevalece no seu escopo e promoção de cânone é proposta explícita ao dono.

Escolher em D-02 entre cópia autorizada, referências e sobreposição por campo.
Estabelecer como origem removida, atualização de edição e reembolso afetam instâncias.
Paginação e armazenamento em documentos/arquivos separados evitam exceder limites atuais.
Contratos de migração incluem formato legado, idempotência, relatório de falha e recuperação.

## Fronteiras de confiança

1. Original privado: somente dono e operações autorizadas.
2. Rodada de revisão: versão e campos escolhidos para convidados.
3. Portal: projeção por participação e revelação; segredo não é entregue e depois escondido.
4. Publicação gratuita/amostra: coleção e artefatos públicos com lista fechada de campos.
5. Edição paga: acesso autenticado por direito confirmado; corpo e arquivos privados.
6. Financeiro: servidor controla pedido, confirmação, direito, razão e repasse.
7. Administrativo: papel atribuído no servidor com operações limitadas e auditáveis.

A lista de audiências não equivale a um RBAC genérico decidido. W2-F1-03 fecha regras por operação.
Aliases, busca, tooltips, IA e caches precisam do mesmo filtro de autorização.
A identidade pública do criador é escolhida; e-mail/UID/conta comercial não compõem perfil público.

## Publicação, artefatos e revogação

Preparar edição sem expor; validar origem/versão; ativar explicitamente.
Separar imutabilidade editorial de revogação de consentimento.
Não permitir que revisão antiga, artefato armazenado ou URL direta restaure lore revogado.
A política D-07 determina edição adquirida, disponibilidade, retirada e atendimento.
Novo download verifica acesso vigente e usa estratégia de URL/cache coerente; arquivos já obtidos têm limite de revogação conhecido.
O pacote de aventura tem material do mestre e dos jogadores; notas do criador e backup privado ficam fora.

## Fluxo comercial proposto

Oferta vigente → cotação confirmada no servidor → pedido → checkout do provedor →
evento verificado/consulta de conciliação → lançamento e direito idempotentes →
biblioteca → leitura/download ou campanha particular.

Pedido, pagamento, atendimento e entrega têm estados distintos.
Cliente/redirect não concede acesso. Assinatura de webhook, beneficiário, moeda e valores são conferidos.
Reembolso/disputa gera reversão compensatória; evento antigo não reativa acesso indevidamente.
Razão e repasses seguem arranjo real escolhido em D-05/D-08, sem carteira interna presumida.
Falha de entrega pode ser retomada após pagamento; origem indisponível exige política de atendimento.

## Compatibilidade e implantação

Segredos de IA/comércio em functions; env de browser somente em shared/config/env.ts.
IA/créditos existentes não se tornam saldo de compra.
Todos os formatos de backup preservam dados necessários sem chaves/segredos.
Mudanças de regras, índices e Storage precisam de ensaio e rollout coordenado.
A fase 5 especifica staging, migração, conciliação, recuperação e autorização de produção.
