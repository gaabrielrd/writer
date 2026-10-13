# W2-F1-03 — Autorizações, projeções e revogação

**Data/base:** 2026-10-13, `4487743`.
**Estado:** contrato técnico definido; nenhuma regra implantada nem papel real concedido.
**Plano:** mapear operações, fechar campos de projeções/convites, classificar dados
locais e enumerar casos negativos. O contrato de [domínio](02-modelo-de-dominio.md) é pré-requisito.

## Autoridade por recurso

Negar por padrão. Autorizar operação + alvo + vínculo vigente + versão de acesso.
Papéis pertencem ao recurso, não a um seletor de perfil global da interface.
Uma conta pode acumular papéis; comprador/jogador/revisor/operador não herdam autoria.
Servidor deriva uid e proprietário; payload não concede papel, grant ou capacidade administrativa.

| Operação/recurso                                            | Quem pode                                                  | Negação e condição                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ler/editar original de livro/aventura, cenas e lore privado | Dono; mutação compara revisão                              | Outros papéis não leem original; recurso deleting bloqueia escrita                  |
| Vincular universo ou mudar lore global                      | Dono do original e do universo, pelo servidor              | Participação em mesa não concede escrita global                                     |
| Preparar/ativar edição                                      | Dono; venda exige criador convidado e capacidade comercial | Nenhuma promoção por campo do perfil ou chamada do cliente                          |
| Ler snapshot de revisão                                     | Dono e revisor aceito daquela rodada                       | Convite pendente/conta errada/outra rodada/revogado negados                         |
| Comentar/sugerir                                            | Revisor aceito e dono, rodada aberta                       | Âncora deve pertencer àquele snapshot/documento; autor da mensagem edita seu texto  |
| Aplicar sugestão no original                                | Dono, com comparação de revisão/hash                       | Revisor não grava manuscrito; dono não reescreve autoria do comentário              |
| Ler/editar preparação, diário e consequências               | Mestre dono da campanha                                    | Criador da aventura adquirida, jogador e operador não leem esses recursos           |
| Ler base/variante derivada                                  | Mestre, com direito de procedência/privacidade vigente     | Ownership da campanha não contorna origem revogada; leitura direta também negada    |
| Ler portal/material revelado                                | Jogador aceito na campanha e audiência liberada            | Sem diário, segredo, base bruta, material oculto ou dados de outra mesa             |
| Revelar/retirar material e gerir participação               | Mestre, pelo servidor                                      | Jogador é leitor na V1; não atribui papel nem altera audiência                      |
| Propor cânone                                               | Mestre, somente alteração escolhida                        | Não envia diário completo nem aplica no universo                                    |
| Aceitar cânone                                              | Dono do universo, versão comparada                         | Proposta obsoleta, alvo indisponível ou dono errado recusados                       |
| Ler catálogo/amostra                                        | Visitante/autenticado, projeção ativa                      | Sem corpo pago, rascunho ou segredo; versão pública antiga não reabre acesso        |
| Ler/download de edição adquirida                            | Comprador com direito confirmado para edição               | Pedido pendente, redirect e compra de outra edição não autorizam                    |
| Criar campanha de edição adquirida                          | Comprador autorizado, pelo servidor e idempotente          | Não modifica original nem concede licença de vendedor                               |
| Consultar pedido/entrega                                    | Comprador titular                                          | Outro comprador não vê dados/estado financeiro                                      |
| Consultar extrato de criador                                | Criador titular, projeção comercial própria                | Não recebe manuscrito ou cadastro privado de terceiros                              |
| Atender pedido/moderar catálogo                             | Operador com capacidade protegida e escopo auditável       | Não ganha leitura geral de originais/diários; dado de perfil não concede capacidade |
| Chat, persona, BYOK e recuperação local                     | Titular/dono do contexto autorizado                        | Compartilhamento não inclui conversas, prompts ou chaves                            |

Rodada encerrada mantém leitura do snapshot para participação vigente e bloqueia
novas sugestões; revogação retira também a leitura. Aplicação de pendências pelo dono
continua exigindo comparação. Retirada de oferta interrompe novas vendas;
acesso da compra conservada e reversões seguem D-07/W2-F1-04.

## Projeções com campos fechados

Original, rodada, portal, amostra e edição são documentos/artefatos distintos.
Serializer cria cada campo permitido; nunca copia o objeto inteiro para ocultá-lo no cliente.
Controle interno de dono, grant, destinatários, epochs e caminho Storage fica separado do corpo.
IDs compartilhados são IDs da projeção; referências só resolvem outras projeções autorizadas.

| Projeção                   | Campos permitidos                                                                                                                                           | Exclusões relevantes                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Rodada editorial           | schemaVersion, roundId, snapshotId, title, status, createdAt, instructions escolhidas                                                                       | Conversa, persona, rascunho, notas fora da rodada                |
| Texto da rodada            | id projetado, title, order, content sanitizado, actId projetado opcional, revision/hash para âncora                                                         | Documento original e histórico completo                          |
| Lore selecionado da rodada | id projetado, name, aliases escolhidos, category, summary                                                                                                   | Detalhes privados; seleção de detalhes exige projeção específica |
| Comentário/sugestão        | id, snapshotId, documentId, anchor, text, suggestedText opcional, displayName escolhido, state, datas                                                       | UID/e-mail do participante no corpo público                      |
| Portal da campanha         | schemaVersion, campaignId, title, description escolhida, updatedAt                                                                                          | Preparação, resumo privado e lista de segredos                   |
| Sessão compartilhada       | id, title, order, scheduledAt opcional, publishedRecap escolhido, datas                                                                                     | Notas/acontecimentos privados por padrão                         |
| Lore revelado              | id projetado, name, aliases escolhidos, category, summary, content compartilhável escolhido                                                                 | Alias/relação de entidade privada e origem global não autorizada |
| Material revelado          | id, title, description escolhida, mediaType, fileName, sizeBytes, hash, revision                                                                            | Caminho original, token, demais materiais e pacote do mestre     |
| Catálogo/amostra           | publicId, kind, title, creatorPublicId, authorName, descrição pública, capa publicável, série/ordem, idioma, edição/amostra, estado/preço público da oferta | Cadastro pessoal/Stripe, rascunho, texto pago completo           |
| Biblioteca do comprador    | editionId, título, autoria pública, tipo, data de aquisição, accessState, formatos, atualização opcional                                                    | Original, manuscrito vivo e compras de terceiros                 |
| Pedido do comprador        | orderId, edição/oferta, título, moeda, valores confirmados, estados de pagamento/entrega/atendimento, datas                                                 | Conta Stripe do criador, fraude interna, outro comprador         |
| Retomada particular        | edição/revisão, documento e posição, datas                                                                                                                  | Texto, lista de leitores e progresso de terceiros                |

Edição distribuível inclui somente conteúdo escolhido, manifesto de origem/direitos e
artefatos autorizados. Pacote de aventura separa mestre e jogador. Notas pessoais do
criador, backup privado, personas, prompts e configuração de IA não são materiais comerciais.
Prévia antes da publicação usa o mesmo projector do destino, incluindo exportação/ZIP.

Complemento comercial W2-F1-04: oferta antes da compra também apresenta projeção
**Identificação do fornecedor**, com `supplierPublicId`, `legalName`, identificação
CPF/CNPJ quando aplicável (`registrationType`, `registrationNumber`), `businessAddress`,
`contactEmail` e `contactChannel`; operadora usa a mesma lista, com papel identificado.
Dados são declarados/revisados para essa finalidade, sem copiar perfil privado ou KYC.
Pseudônimo permanece na autoria; UID, conta Stripe e documentos pessoais ficam excluídos.
Identificação/endereço válidos são requisito de oferta comercial, não do manuscrito privado.
Pedido conserva essa projeção junto do contrato da compra. Fonte:
[Decreto 7.962, art. 2](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm).

Lore do leitor usa somente id projetado, name, aliases escolhidos, category, summary
e content compartilhável escolhido, filtrados pela regra de capítulo abaixo.
Capítulo de liberação é controle do projector; não enviar a lista de fichas futuras
com seus nomes/IDs para o navegador esconder. Ficha não selecionada continua privada,
inclusive quando o leitor escolhe mostrar spoilers.

### Compatibilidade com publicação gratuita atual

Preservar listas de [firestore.rules](../../../../firestore.rules):
apontador público schemaVersion/title/authorName/revisionId/publishedAt e universo/versão/hasActs opcionais;
revisão com datas/contagens/privacyVersion e universo/versão/actCount;
capítulo title/order/content/actId opcional; ato name/order; lore name/aliases/category/summary/sourceEntityId opcional.
Não ampliar `publicBooks` para armazenar corpo pago.
`publicUniversePrivacy` e revisão corrente continuam condições de leitura, inclusive URL direta.
Não reinterpretar flags isPublic de dados legados. Novas APIs V2 assumem privado;
revelação/publicação exige escolha explícita. Criação legada com isPublic padrão true
é comportamento existente, não uma permissão a copiar para os novos domínios.

## Convites e participação — D-03

V1 usa convite manual, sem envio automático de e-mail. Conta do destinatário precisa
existir: o dono informa destinatário; o servidor resolve uid autenticável e guarda
`recipientUid` imutável. Resolução por e-mail exige identidade verificada no provedor;
e-mail apenas declarado no perfil não identifica destinatário. Se não existir conta
verificada, orientar criação/verificação antes de emitir.
Não expor lista de contas/e-mails em pesquisa pública ou em erro de conta errada.

Convite interno: resourceKind/resourceId, papel `reviewer/player`, recipientUid, issuerUid,
expiresAt, state `pending/accepted/revoked/expired`, revision e tokenHash.
Token aleatório de 256 bits; persistir hash, não segredo. Padrão técnico de validade:
sete dias desde a criação, configurado no servidor. Prazo é do convite pendente;
participação aceita dura até revogação/exclusão, não expira por esse relógio.

Aceite exige login, uid do destinatário e identidade verificada, recurso disponível,
token/estado/prazo vigentes.
Servidor grava participação e consumo do convite atomicamente; retry idêntico retorna
mesma participação. Outro uid, papel/alvo alterado ou convite reutilizado após revogar
é negado. Regenerar link invalida token anterior. Papel mestre/dono não é concedido por convite na V1.
Conta excluída perde participação; nova conta com mesmo nome/e-mail não herda uid antigo.

## Revelação, versões e spoilers — D-04

Mestre escolhe conteúdo e audiência; servidor prepara projeção física separada e ativa
somente após verificar versão/origem/permissões. Público, campanha inteira ou jogador
específico são escopos distintos; nunca entregar secreto para depois usar CSS/booleano.
Revogar participação incrementa accessVersion; retirar/republicar material troca revision
e versão de acesso pertinente. Rever consentimento do universo invalida dependentes.

Base congelada e variante derivada só são servidas ao mestre após conferir procedência
e privacidade atuais; leitura direta pelo SDK é negada por padrão. Notas próprias
ficam separadas, preservadas e acessíveis ao dono conforme autorização de sua campanha.
Descarte, comparação, busca e exportação usam o mesmo gate, sem restaurar base revogada.

Aliases, relações, contagens, títulos, tooltips e resultados de busca são construídos
apenas de projeções autorizadas. Relação indisponível não revela nome/categoria/segredo
do alvo, nem consulta automaticamente o original. IA do jogador, se vier a existir,
recebe apenas projeção daquele jogador; IA atual do mestre não é compartilhada.

Para novos contratos de leitura, autor escolhe `revealFromChapterId` por ficha de lore
selecionada para o leitor. Sem capítulo escolhido, a ficha não é revelada automaticamente;
liberar desde o início significa selecionar o primeiro capítulo. Não inferir liberação por IA,
cronômetro ou sessão concluída. Antes da ativação, a prévia permite conferir a regra.

No modo padrão sem spoilers, cada resposta de lore inclui somente fichas selecionadas
cujo capítulo de liberação pertence à edição e tem ordem menor/igual ao capítulo atual
solicitado pelo leitor. Capítulo fora da edição é recusado. Ler fora de ordem usa a
ordem do capítulo escolhido, sem conceder acesso a um original ou a outra edição.
Voltar/resetar ao capítulo inicial reduz novamente os campos entregues; cache, aliases,
busca e tooltips usam a mesma projeção. Não há marca acumulada irreversível de liberação.

O leitor pode escolher explicitamente “Mostrar spoilers”, com alcance visível: libera
as fichas que o autor selecionou para aquela edição, nunca lore privado não selecionado.
Direito de leitura da edição é verificado separadamente; progressão ou opção de spoiler
não concede compra/participação. Preferência/posição pertencem apenas ao leitor.

Publicação pública legada permanece com seu formato/permissões até migração explícita.
Em conteúdo já público ou EPUB obtido, controle de spoiler é apresentação e seleção de
resposta, não promessa de sigilo contra quem consulta a publicação/arquivo inteiro.
No portal da mesa, campo secreto não é previamente distribuído; liberação sempre exige
ação explícita do mestre e autorização, independentemente de progresso do jogador.

## Arquivos, resposta tardia e cache

[Storage atual](../../../../storage.rules) restringe leitura SDK de capas ao dono.
[Geração de capas](../../../../functions/src/index.mjs) também cria
firebaseStorageDownloadTokens: URL bearer persistente não equivale a autorização revogável.
Esse mecanismo fica fora de materiais secretos/pagos V2; capas públicas precisam de escolha de publicação.

Arquivo protegido é transmitido por endpoint autenticado que confere uid, recurso,
grant/audiência e versão de privacidade vigentes. Caminho opaco, manifest ou URL não
substituem gate. Sem token permanente/URL pública do objeto; cache HTTP privado no-store.
URLs assinadas teriam janela residual, por isso não são a escolha para revogação imediata
das novas leituras V1. Download já recebido/trecho já transmitido não pode ser apagado remotamente.

Não habilitar persistência offline de corpos pagos ou projeções compartilhadas na V1.
Downloads explícitos são distintos do cache interno. [Leitor público](../../../../src/features/books/services/publicBookService.ts)
já ignora snapshots fromCache para verificar publicação; a mesma distinção vale para novos grants.

Toda resposta local está vinculada a uid + recurso + versão + geração da sessão.
Logout/troca de conta/recurso/revogação encerra listeners, cancela pedidos e invalida
respostas tardias; limpar cache de projeções sem regravar texto antigo automaticamente.
Sem conexão, não tratar cache ou direito antigo como autorização para nova leitura/entrega.
Servidor revalida autorização ao preparar resposta/artefato. Uma transferência iniciada
antes da revogação pode terminar; novas requisições são negadas. Não prometer interrupção
imediata de conexão em andamento ou apagamento dos bytes recebidos. Se futuramente houver
revalidação entre blocos, medir/documentar sua janela antes de oferecer garantia adicional.

Recuperação existente de manuscrito próprio permanece isolada por conta/recurso.
Em retorno online, verificar autoria/revisão antes de gravar; contexto derivado/revogado
não é promovido a rascunho próprio nem enviado à IA por recuperação automática.

## Dados locais, exclusão e retenção técnica — D-09 parcial

| Classe                           | Tratamento técnico                                                                       | Pendência                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Originais/rascunhos próprios     | Privados; recuperação por conta/recurso; exclusão inicia bloqueio antes da limpeza       | Janela/limites de histórico por custo em F1-06/F2-05       |
| Rodadas/projeções/participação   | Revogação imediata de novas leituras; limpeza idempotente depois                         | Implementação e testes reais/emulador em F3                |
| Base/variante derivada           | Procedência/privacidade verificadas em servidor; notas próprias separadas                | Política comercial de reversão em F1-04                    |
| Arquivos obtidos                 | Revogar futuras entregas; não apagar remotamente downloads                               | Licença/atendimento de retirada em F1-04                   |
| Logs técnicos                    | Sem texto, token, chave, e-mail ou payload privado; ID interno e erro/estado necessários | Orçamento/janela operacional em F1-06/F5-02                |
| Financeiro/contratos/atendimento | Acesso por parte e capacidade; separado de manuscrito e exclusão narrativa               | Retenção/responsabilidade e obrigações do arranjo em F1-04 |

Não fixar prazo financeiro sem política aprovada. Excluir conta não torna compra pública,
não atribui ownership a novo uid e não elimina razão financeira silenciosamente.

## Casos negativos exigidos na implementação

| ID    | Tentativa                                                | Resultado                                        | Prova/tarefa                      |
| ----- | -------------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| AP-01 | Revisor lê original/outra rodada                         | Negado sem texto privado                         | Callable + SDK/emulador, F3-01/02 |
| AP-02 | Jogador lê diário/base/segredo/outra mesa                | Negado por acesso direto e query                 | F3-04/05                          |
| AP-03 | Busca/alias/tooltip conta entidade oculta                | Ausência do campo e da referência privada        | F3-04/05                          |
| AP-04 | Conta errada aceita convite/token expirado/revogado      | Sem participação ou vazamento de alvo            | F3-01                             |
| AP-05 | Payload forja owner/role/grant/epoch                     | Operação recusada; nenhuma elevação              | F3-01, F4-04/08                   |
| AP-06 | Revogado usa ID/query/download/listener                  | Novas leituras negadas; cache interno invalidado | F3-01/05, F4-09                   |
| AP-07 | Resposta tardia após logout/troca                        | Ignorada; não repovoa tela/cache                 | Frontend/integrado F3-04, F4-09   |
| AP-08 | Comprador acessa original/pedido alheio/edição diferente | Negado em dados/arquivo                          | F4-09                             |
| AP-09 | Redirect/webhook forjado/repetido                        | Sem grant indevido ou duplicação                 | F4-07/08                          |
| AP-10 | Perfil define operador e lê manuscrito/financeiro        | Negado sem capacidade confiável                  | F4-04/11                          |
| AP-11 | Revisão pública antiga restaura lore revogado            | Negado por marcador/revisão vigente              | Regras reais F4-01/F5-03          |
| AP-12 | Trocar universo/descartar variante abre base antiga      | Origem indisponível, notas próprias preservadas  | F2-07, F3-07                      |
| AP-13 | Nova edição substitui compulsoriamente compra            | Edição adquirida intacta, atualização opcional   | F4-01/09/12                       |
| AP-14 | ZIP/download de jogador traz arquivo mestre/backup       | Campo/arquivo ausente; pedido direto negado      | F4-03, F3-05                      |
| AP-15 | IA resolve relação privada no contexto compartilhado     | Não recebe o campo privado                       | F2-09, F3-05                      |
| AP-16 | Recuperação de outra conta envia texto antigo            | Isolamento e comparação; sem envio automático    | F2-05, F3-04                      |
| AP-17 | Sugestão usa outra versão/âncora                         | Recusada ou comparação explícita; sem débito     | F3-03                             |
| AP-18 | Conta nova herda participação por e-mail/nome            | Negado; uid antigo não migra automaticamente     | F3-01/F5-03                       |

Matriz define resultados esperados, não testes executados. Implementações precisam
testar múltiplas contas, regras reais e emulador, servidor, cache, artefatos e navegador.
Sem implantação, e-mails enviados ou alteração de dados reais nesta tarefa.

Casos adicionais de W2-F3-05: capítulo fora de ordem/resetado deve retornar somente
fichas permitidas para o capítulo atual; Mostrar spoilers não inclui fichas privadas;
ID de capítulo de outra edição é negado. Em W2-F4-09, transferência já iniciada pode
terminar após revogação, mas nova requisição deve ser negada; não prometer cancelamento
de conexão que o endpoint não implementa.
