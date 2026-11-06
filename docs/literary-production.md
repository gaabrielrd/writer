# Produção literária

Implementação em desenvolvimento na branch `codex/producao-literaria`, derivada
de `codex/writer-v2`, atualizada com a principal local em `16d8af5`. Por instrução
do autor, a validação ocorre após incorporar essa base. O gate integral ainda
não passou. Não há implantação nem liberação declarada.

## Contrato editorial

A aba Produção literária reúne contrato/decisões e planejamento. O contrato é
opcional e privado. Salvar cria revisão imutável; decisões anteriores não podem
ser apagadas ou editadas silenciosamente. Para alterar ou aprovar uma proposta,
registre uma decisão substituta. Classe e situação são independentes: uma
hipótese aprovada não equivale a fato realizado no manuscrito.

Na criação assistida, a direção editorial pode ser conferida e editada antes
da confirmação. A IA só produz propostas/lacunas, sem aprovação automática.
Contrato e primeira revisão são criados junto de livro/lore/débito. Propostas
legadas sem contrato continuam aceitas, sem alterar seu fingerprint.
A entrada unificada `/studio/new` também oferece o contrato opcional somente
para livros. Aventuras e campanhas preservam seus fluxos próprios.

O assistente contextual da página lê o contrato atual autorizado do livro e
mostra a revisão e o conteúdo exato utilizados em cada resposta. Esse escopo
não inclui leitura integral do manuscrito. A resposta é descartada se o guia
for alterado, removido ou recriado durante a geração, mesmo com o mesmo ID e
conteúdo. Respostas anteriores saem da conversa quando a prova de contexto muda.

O chat legado de capítulos captura o contrato antes de enviar; histórico guarda
a revisão usada. O servidor confere o snapshot no envio e recusa aplicação se o
contrato mudou. Retry mantém o contexto original. A integração equivalente com
chat nativo de cenas/blocos e autocomplete ainda está pendente.

## Unidade de publicação

O contrato permite escolher capítulo, ato ou livro inteiro. A escolha é do autor,
versionada e opcional; a IA não a preenche. Novas edições e sua confirmação devem
respeitar a unidade salva. A publicação continua dependendo da revisão explícita.
Capítulo/ato incluem as unidades anteriores na ordem de leitura. O fluxo mostra a
revisão conferida e exige adequação explícita do formulário, preservando o rascunho.

Salvar essa política ativa atomicamente a barreira permanente de publicação nativa,
sem publicar o livro nem alterar seu status. A ausência da escolha preserva contratos
legados. O requisito de publicar a unidade anterior antes de avançar ainda está
pendente; veja o [incremento 15](tasks/producao-literaria/15-unidade-de-publicacao.md).

## Planejamento

Documentos privados tipados: visão do livro, tratamento de ato, ficha de capítulo,
conhecimento de personagem, plantio/retorno e continuidade entre volumes.
São complementos dos objetos existentes de cenas, arcos e cronologia; não criam
capítulos ou entidades duplicados.

Referências explícitas usam IDs e identidades nativas. Fonte alterada ou removida
é sinalizada ao consultar e impede salvar com uma revisão antiga. Vincular a
fonte atual é uma ação explícita. Lore local é resolvido pelo leitor nativo,
incluindo campos externos; não há leitura de stub como ficha completa.

## Mapa global do livro

A área Produção literária apresenta atos/capítulos em ordem de leitura, eventos
em sua ordem cronológica manual e trajetórias ligadas a fichas de conhecimento.
Fonte e assunto permanecem distintos: uma referência consultada não comprova
participação do personagem. Situação editorial e revisão são exibidas sem
transformar hipóteses em fatos do manuscrito. Homônimos conservam identidades
separadas; referências recriadas não recebem vínculos anteriores.

A consulta é privada, paginada, sem geração, escrita ou débito. Os ciclos de
até 32 páginas podem ser pausados/retomados com a mesma prova; mudanças de
fontes exigem nova leitura. Esse mapa cobre estrutura e intenções, não análise
do texto integral. Veja o [contrato do mapa](tasks/producao-literaria/02-mapa-global.md).

## Persistência e segurança

Coleções privadas por livro: literaryProduction, literaryContractVersions,
literaryOperations, literaryPlans e literaryPlanVersions. SDK e leitor público
não acessam essas coleções; APIs autenticadas reautorizam o dono e recusam livro
em exclusão. Recibos contêm metadata e fingerprint, sem cópia do contrato.
Históricos de conteúdo permanecem sob o livro e entram na limpeza limitada
de deleteSceneBook antes da raiz.

Salvamento é CAS e idempotente. Uma resposta incerta conserva o pedido em memória
para repetir a mesma operação. Recuperação durável dedicada dessas novas
operações, portabilidade e leitura de versões dos planos ainda serão integradas.

## Próximos incrementos

Geração/auditoria assistida dos planos; contexto nativo com orçamento/cobertura;
preparação e revisão em camadas; integração de atos/livro e publicação identificada;
portabilidade privada. Consulte o registro de execução do plano.

## Inferência e composição de decisões

Livros existentes podem selecionar fontes e solicitar uma direção editorial
proposta. A aplicação ao rascunho preenche somente campos vazios e acrescenta
propostas; os campos já preenchidos e o histórico permanecem. A confirmação
do contrato continua explícita.

A composição pura separa requisitos, preferências, hipóteses e pendências.
Propor uma substituição não encerra uma decisão aprovada. Uma substituição
aprovada encerra os antecessores, mantendo seus registros. Hipóteses aprovadas
não são fatos comprovados do manuscrito.

Propostas e auditorias de planejamento/contrato ficam em literaryGenerations,
incluídas na limpeza do livro. Cancelamento tem fence e é independente da
resposta do produtor. Consultar resultado nunca reenvia geração. O diagnóstico
tem escopo de fontes selecionadas; a revisão integral continua em implementação.

## Preparação e preservação de versões — implementação em andamento

A área de produção literária inclui documentos de planejamento de cenas e
worldbuilding local, associados às unidades nativas do livro. A verificação
pré-redação captura ficha, cenas, mundo local e fontes selecionadas; guarda
critérios, evidências literais, pendências e aceite autoral separado.

Uma evidência localizada não é validação automática da qualidade literária.
Ao mudar as fontes, a prontidão e o aceite anteriores precisam de reconferência.
Versões históricas preservam o resultado registrado, condicionado à autorização
atual das origens para leitura de conteúdo derivado.

O painel também pode preservar o texto salvo como primeira versão ou versão
revisada usando o histórico nativo do Writer. Capítulos compostos são capturados
cena por cena, na ordem vigente, com checkpoint e conferência de versões.
Este marco identifica um conjunto de textos; não declara o capítulo redigido,
revisado, integrado ou publicado.

As coleções de preparação e marcos são privadas e exclusivas do servidor.
Recibos e acompanhamento local guardam metadata, sem cópias do manuscrito.
Nenhuma destas operações publica ou debita créditos.

Estas alterações ainda não passaram pelos testes e validações finais.
Redação assistida retomável, revisão integral, integração/publicação e
portabilidade dos novos artefatos permanecem em implementação.

## Propostas de prosa por cena — implementação em andamento

A preparação oferece redação inicial, proposta de versão revisada e análises
estrutural e de prosa. A redação inicial exige cena vazia e preparação atual
com aceite do autor. Revisões exigem texto salvo e mostram qual segmento foi
incluído; uma análise localizada não certifica revisão de capítulo ou livro.

O fluxo usa a IA da plataforma e conserva modelo/raciocínio por pedido. Gerar,
analisar ou cancelar não debita; aplicar uma versão proposta custa 1 crédito,
com o mesmo critério das sugestões da plataforma. O aceite substitui somente
a cena identificada, preserva antes uma versão nativa e grava manuscrito,
contagens, crédito e recibo atomicamente. Propostas com impedimentos estruturais
não são aplicáveis.

O contexto inclui guia, fontes selecionadas, planejamento nativo e cena
anterior, quando existente e dentro dos limites. Alterações no texto,
composição ou fontes impedem o aceite de uma proposta antiga. Consultas e
cancelamento conservam identidades; nenhuma geração é reenviada ao abrir
o painel. O acompanhamento local contém somente metadata e hashes.

A orquestração integral de capítulos/atos/livro, o autocomplete contextual,
a publicação e a portabilidade dos novos artefatos continuam pendentes.
O código e os testes escritos ainda não passaram pelo gate final.

## Revisão integral de capítulos compostos — implementação em andamento

A revisão por capítulo percorre as cenas ativas, em ordem, e cada segmento
do texto nas duas camadas editoriais. Registra cobertura sem contar novamente
o contexto sobreposto, soma os achados e mantém referências às evidências
localizadas. Alterações no manuscrito ou nas fontes tornam o resultado anterior
histórico e retiram o aceite atual.

O autor inicia a retomada, pode pausar após a análise atual ou cancelar apenas
um pedido pendente, conservando análises anteriores. Uma falha exige nova
tentativa explícita; consultar o checkpoint nunca reenvia a geração. O status
pendente não comprova que o produtor continua ativo.

Concluir a cobertura é diferente de aplicar correções e aceitar o resultado.
Impedimentos precisam ser resolvidos antes do aceite autoral. Este fluxo
ainda não declara integração de atos ou conclusão do livro. Usa cenas nativas;
não converte capítulos legados automaticamente.

A implementação e os testes escritos ainda aguardam o gate final.

## Redação supervisionada por capítulo — implementação em andamento

O capítulo pode ser percorrido em cenas nativas. Cada proposta aguarda aceite
antes de alterar o manuscrito. Textos existentes são mostrados para adoção
explícita e não são regenerados automaticamente. Aplicações novas usam a mesma
unidade de 1 crédito das sugestões da plataforma; adotar texto existente não
debita.

Aceite, texto, contagens, crédito e checkpoint ficam na mesma transação.
Recuperar resposta incerta conserva operação e revisão. Mudanças concorrentes
ou fontes desatualizadas interrompem o fluxo, preservando o que já foi salvo.
No fim, a primeira versão é capturada pelo histórico nativo, antes de declarar
a redação preservada. A revisão e a publicação continuam etapas separadas.

O modo atual exige supervisão por cena. A reconciliação de mudanças e a
integração completa dos estágios continuam em implementação. O código e os
testes escritos ainda aguardam o gate final solicitado.

## Contexto de persona e autocomplete — implementação em andamento

Redação e revisão estruturadas usam o mesmo compilador nativo de persona do
chat, com persona do livro e complemento do capítulo. Alterações invalidam a
configuração capturada; a retirada de um perfil impede ler seus derivados.
Versões antigas continuam históricas quando suas origens permanecem autorizadas.

O backend do autocomplete contextual foi acrescentado com contexto compacto,
configuração congelada, BYOK sem chaves no servidor e aplicação transacional.
A ligação com o editor, o cursor e o autosave ainda está pendente. Portanto,
o autocomplete visível ainda conserva o comportamento anterior.

Sugestões deste novo backend expiram para uso em dez minutos; a limpeza de
texto é assíncrona e limitada. Metadata de reserva/recibo preserva recuperação
e impede reutilização de identidade. Não há novo débito antes do aceite.

Nenhuma validação foi executada neste incremento.

### Autocomplete e aceite recuperável

O autocomplete do capítulo legado captura o guia, os planejamentos escolhidos
e a persona no servidor. A seleção automática pode ser substituída por até oito
planejamentos. A oferta mostra o recorte editorial efetivamente utilizado; um
recorte compacto não representa leitura integral do livro.

O aceite salva primeiro o texto original e confirma a inserção, contagem e
crédito na mesma transação do servidor. O editor só incorpora a continuação
após conferir o recibo. Uma resposta perdida mantém uma pendência privada de
IDs/hashes; o salvamento fica pausado até consultar ou cancelar esse aceite.

Cancelar a pendência impede uma gravação tardia se ela ainda não ocorreu.
Quando já ocorreu, o mesmo comando recupera a confirmação. A recuperação lê
o texto atual do servidor e preserva edições locais divergentes para conciliação.
Não reaplica a proposta antiga sobre o manuscrito atual.

Esse caminho não habilita autocomplete legado em cenas ou blocos nativos.
Implementação ainda sem validação: os testes e jornadas reais permanecem
adiados até o gate anterior à integração, conforme escopo autorizado.

### Preservação de capítulo revisado

Uma revisão integral concluída ainda exige aceite autoral. Depois dele, a ação
de preservar a versão revisada captura as cenas atuais no histórico nativo e
vincula o marco à revisão correspondente. A captura é retomável e não escreve
prosa nem produz novas análises.

A confirmação compara a composição atual do capítulo, as fontes da revisão e
todas as versões capturadas. Alterar o manuscrito retira a atualidade do aceite.
Alterar o histórico exige reconferir os vínculos preservados; uma versão removida
não permanece anunciada como disponível.

Uma captura genérica chamada versão revisada continua sendo apenas preservação.
O vínculo com revisão integral e aceite é registrado pelo fluxo específico.
Integrar o ato ou livro permanece uma etapa posterior.

### Integração de atos e livro

A área de integração registra um escopo e só inicia as análises ao retomar.
O fluxo lê as fontes canônicas na ordem narrativa, com cobertura por intervalos
sem lacunas, e confere as transições entre capítulos. Ao integrar um ato,
inclui também o capítulo anterior como contexto para sua passagem.

As leituras produzem matriz e achados localizados. A síntese preserva uma árvore
de evidências navegável até as análises originais. Uma janela de transição ou
uma síntese não se apresenta como leitura integral adicional do manuscrito.

A cobertura integral só é registrada depois da reconferência das unidades,
análises, transições e fontes. O aceite autoral exige outra ação. Impedimentos
não desaparecem porque uma síntese os omitiu; o fluxo não corrige prosa nem
publica automaticamente.

As chamadas usam a cota de assistência, sem débito de manuscrito. Falhas e
cancelamentos preservam checkpoints; um pedido sem resultado terminal exige
consulta ou cancelamento antes de regenerar. Fontes alteradas retiram a
atualidade da cobertura. A reconciliação de evidências e a publicação versionada
ainda estão em desenvolvimento.

Este incremento permanece sem execução das validações, adiadas para o gate
anterior à integração conforme a autorização do projeto.

### Reconferência e reaproveitamento da integração

Uma mudança de metadados pode retirar a atualidade de um registro sem mudar o
manuscrito. A reconferência compara novamente organização, unidades e fontes de
todas as análises. Quando as provas continuam válidas, preserva os resultados
sem chamar a IA e solicita novo aceite autoral.

Se houver mudança real, informa a primeira divergência e mantém o registro
anterior pendente de reavaliação. Esse diagnóstico inicial não representa um
mapa completo de impactos nem uma correção aplicada.

Uma integração sucessora pode recuperar as orientações anteriores como
rascunho. Ela reaproveita apenas resultados cujo pedido completo e identidades
das fontes permanecem equivalentes, com a origem do reaproveitamento visível.
Trechos e transições alterados exigem nova análise; a síntese considera os nós
da sucessora. Recriar um ID com o mesmo texto não restaura uma origem antiga.

A reconferência e o reaproveitamento não herdam aceite, não debitam manuscrito
e não publicam. Este fluxo ainda aguarda o gate de validação autorizado.

### Decisões sobre achados e confirmação de correções

O backend distingue investigar, planejar correção, manter por decisão autoral
e adiar. Cada decisão preserva justificativa e versões. Manter o texto encerra
um impedimento por escolha explícita do autor; o diagnóstico original continua
registrado e não aparece como correção aplicada.

Confirmar uma correção exige uma alteração salva na mesma origem e uma
integração sucessora atual que tenha incluído essa fonte. Para texto, a operação
preserva uma versão no histórico nativo; para guia e planejamento, confere a
revisão editorial imutável. Outras fontes registram sua revisão nativa.

A confirmação é um atestado autoral vinculado a provas de salvamento e leitura,
não uma aprovação dos demais achados. Sua atualidade depende de a fonte, a
integração e a versão preservada continuarem disponíveis. Uma nota não altera
o manuscrito nem comprova por si só que houve correção.

A interface dessas decisões está conectada em código. O mapa completo de
impactos continua em implementação. Backend, interface e cenários de teste
escritos aguardam validação.

### Interface de decisões editoriais

Cada achado pode abrir um editor de decisão. Os editores abertos permanecem
montados ao alternar entre análises e integrações, preservando justificativas
e rascunhos de confirmação. Consultar uma revisão posterior abre comparação;
substituir o rascunho depende de escolha explícita.

A confirmação de correção usa uma integração sucessora selecionada e uma
conferência autoral. O backend cuida da versão preservada. A interface distingue
confirmação atual de registro histórico, sem apresentar manutenção do texto
como correção aplicada.

As decisões e notas próprias também podem ser consultadas quando a integração
original perde atualidade, sem abrir o corpo de análises cujas fontes não estão
mais autorizadas. A sessão privada é reiniciada ao trocar conta ou livro.

Essa interface está conectada em código e possui cenários escritos. A validação
de testes, navegador, temas e responsividade permanece adiada.

### Mapa de impacto — fundamentos implementados

O motor interno já distingue fontes usadas, composição ativa, associações de
planejamento, vínculos narrativos, destinos de decisões e versões preservadas.
O percurso guarda a mudança de origem e todas as evidências distintas. Uma
associação continua pedindo conferência editorial; não vira prova de contradição
ou de leitura integral. Alterar o texto atual também não apaga a versão histórica.

A coleta e o percurso usam páginas e checkpoints separados. O fechamento exige
todos os inventários registrados e sua reconferência, com fontes e topologia
estáveis. Livros e universos são reautorizados a cada avanço. Identidades de
volumes, homônimos e fichas locais/globais permanecem distintas.

Esse motor ainda não está disponível na interface. Faltam o produtor integral
dos inventários, a versão autoritativa de mudanças dos vínculos, callables,
recuperação e apresentação/decisões de impacto. Nenhum resultado global está
sendo certificado. Os cenários de testes de comportamento e Rules estão apenas
escritos, sem execução.

### Coleta inicial das dependências

O coletor interno já percorre os metadados de 16 coleções de livros e registra
a identidade de cada linha. Ele confere a composição ativa e preserva os
tokens de origem das referências, sem carregar o manuscrito, os relatórios
ou as instruções privadas de personas.

Uma revisão relacional separada registra novos vínculos e sua limpeza, sem
invalidar o contexto de escrita da própria operação. A versão das fontes
considera todos os volumes selecionados e seus universos distintos.

A coleta ainda retorna identidades por conferir e outras capacidades
pendentes. Ela não está exposta na interface e não constitui um mapa completo
validado. A integração dos chats, personas, gerações e publicação, seguida da
orquestração de coleta/reconferência e da interface, continua pendente.

### Origem das fontes usadas pela IA

As novas gerações registram separadamente as identidades e versões de suas
fontes. Recriar um planejamento com o mesmo ID e revisão não substitui a
origem anterior. Referências equivalentes são unificadas; versões conflitantes
exigem reconciliação, tanto na geração quanto no contexto do editor.

A coleta interna passou a incluir essas gerações. Há conferência pontual de
referências e planos ligada ao registro nativo, sem substituir suas capturas
por dados enviados pelo consumidor. Isso não equivale à leitura integral do
texto. Outros formatos de prova e a interface do mapa continuam pendentes.
Todos os testes deste incremento permanecem apenas escritos.

### Conferência de texto e de destinos de correção

As fontes de cenas, a composição do capítulo e os destinos de achados agora
têm conferências próprias de identidade e versão. Uma comparação de hash
não equivale a revisão literária, correção confirmada ou aceite da obra.

O autocomplete passou a exigir explicitamente a mesma encarnação do capítulo
ao entregar e aplicar uma sugestão. Recriar o capítulo com o mesmo ID e texto
não reaproveita a sugestão anterior. Pedidos antigos sem essa identidade
precisam de nova captura.

Essas mudanças estão em código, com cenários escritos e ainda não executados.
O mapa de impacto continua sem interface e sem fechamento integral de suas
fontes; personas, chats e a orquestração permanecem em andamento.

### Personas no mapa de impacto

Os novos pedidos de redação, revisão, prosa e autocomplete registram as
dependências de suas personas sem copiar instruções privadas para o índice.
O mapa distingue o perfil escolhido do vínculo configurado no livro ou capítulo.
Alterar, arquivar ou recriar um perfil produz resultados diferentes na
conferência de origem; nenhuma dessas conferências aprova ou reescreve prosa.

O catálogo passa a ter uma revisão própria para detectar alterações durante
a coleta. A evolução continua sem testes executados e sem interface do mapa;
as origens e aplicações dos chats e a orquestração integral seguem pendentes.

### Contextos nativos de chat no inventário

O fechamento de um contexto nativo de cena de livro agora mantém um índice
privado de suas origens, na mesma transação. Ele contém identificadores,
provas de versão, manifesto editorial e metadados de persona; não contém
pergunta, resposta, seleção de texto, instruções privadas ou credenciais.

O inventário confronta esse índice com o cabeçalho nativo antes de produzir
vínculos. A cena é conferida pelo contrato nativo de chat, distinguindo
origem atual, alterada e recriada sem abrir corpos da conversa. Isso não
certifica revisão editorial ou integridade dos bytes do manuscrito.

A exclusão retira o índice e avança a revisão de dependências imediatamente,
antes da remoção do corpo. Recibos repetidos não repetem o avanço. A limpeza
não altera a raiz se o livro passou a pertencer a outro autor.

Esse índice representa contextos de entrada, não todas as respostas do chat.
Turnos, histórico transitivo, chats legados, levantamento dos contextos
anteriores e conferência nativa de lore ainda exigem implementação. O
inventário permanece incompleto. Testes escritos e ainda não executados.

### Lore e respostas nativas no mapa de impacto

Novas capturas de contexto registram a versão nativa de cada ficha de lore
incluída, sem seus textos ou nomes. A conferência usa o protocolo nativo do
chat e distingue edição, recriação e perda de autorização. Índices antigos
sem versão capturada continuam pendentes; eles não são atualizados por
suposição. A conferência de metadados não certifica a integridade dos bytes.

Novos turnos mantêm uma cópia dos metadados de seu contexto direto e os
identificadores das respostas anteriores efetivamente usadas como histórico.
Isso preserva suas origens quando o contexto de entrada é excluído.
Respostas anteriores sem índice permanecem como lacuna explícita.

O catálogo nativo de conversas participa do fence do mapa, incluindo mudanças
de estado das respostas. Conversas em exclusão deixam de produzir vínculos
ativos, e a limpeza remove os índices dos turnos junto dos cabeçalhos, por
páginas. Nada disso autoriza exibir uma resposta cuja origem foi revogada.

A inclusão está em código, com cenários escritos e não executados. Ainda
faltam chats legados, levantamento autorizado dos registros anteriores,
aplicações de sugestões e fechamento integral do inventário e da interface.

### Aplicações de prosa guiada e autocomplete

O aceite agora registra, no mesmo commit do manuscrito, crédito e recibo,
uma associação histórica entre a proposta e a unidade alterada. O índice
privado mantém as identidades nativas da proposta e do destino, a prova
do recibo e metadados de suas fontes. Não copia a proposta, instruções,
nomes privados ou o manuscrito. Os retornos públicos dos recibos continuam
iguais, e a repetição de uma confirmação não cria outro registro.

A associação não afirma que o manuscrito atual continua igual ao texto
aceito. Um destino removido ou recriado não é associado pelo reaproveitamento
do ID. Alterações no recibo ou na identidade da proposta são distinguidas.

A expiração de pedidos de autocomplete continua removendo seu conteúdo.
O índice retém o manifesto, as provas de persona e as referências textuais
necessárias para rastrear a aplicação. Nessa situação, o verificador indica
proveniência preservada por metadados e recibo, com fonte viva indisponível;
não apresenta a proposta antiga nem certifica seus bytes.

A implementação e os cenários ainda não foram validados. Aplicações de
chats nativos/legados e levantamento das aplicações antigas continuam
pendentes, junto do fechamento do inventário integral e da interface.

### Aceites do chat nativo no mapa

Sugestões aplicadas a cenas de livros pelo chat nativo agora registram
uma associação histórica no mesmo commit do texto, saldo e recibo.
Os formatos públicos de contexto, turno e recibo permanecem iguais.
A repetição de uma operação usa seu recibo; uma reaplicação explícita
continua obedecendo ao CAS e à regra nativa de cobrança.

O índice guarda identidade da resposta, da cena e do recibo, hashes e
metadados do contexto direto disponível. Não guarda pergunta, resposta,
seleção de texto nem instruções privadas. A exclusão da conversa continua
apagando seus corpos; os metadados vinculados ao texto aceito no livro
podem permanecer como proveniência histórica.

A projeção confere o recibo e o nascimento da cena antes de produzir o
vínculo. Uma cena recriada com o mesmo ID não recebe a aplicação antiga.
Uma resposta removida é distinguida de uma origem viva, e o índice nunca
autoriza reabrir seu conteúdo. Equivalência ao manuscrito atual, integridade
de bytes e qualidade editorial não são certificadas por essas conferências.

Históricos de respostas anteriores sem suas versões completas retidas
permanecem uma lacuna explícita. Isso ainda exige fechamento, junto dos
aceites legados e do levantamento de registros anteriores. O código e os
cenários desta inclusão ainda não foram validados.

### Ciclo de vida do chat de capítulo legado

As mutações do chat legado agora sinalizam alterações ao inventário de
impacto por uma revisão de dependências do livro. Criação, envio, captura
de histórico, conclusão, preferências, aplicação, edição e exclusão mantêm
a autorização atual do livro e do capítulo antes dessa gravação.

A exclusão marca a conversa antes de remover seus documentos. Enquanto isso,
ela não recebe novos pedidos nem conclusões tardias e não é apresentada como
conversa ativa. A edição também impede geração enquanto está em andamento.
Perguntas e rascunhos não são copiados para o mapa; os débitos e recibos
existentes permanecem no fluxo nativo.

Essa inclusão cobre o sinal de mudança, não o inventário integral legado.
Ainda faltam índices de mensagens e aplicações, levantamento autorizado de
registros anteriores e fechamento da recuperação de operações longas.
Os cenários foram escritos e sua execução segue adiada.

### Retomada de edição e exclusão de conversas legadas

Edição e exclusão agora trabalham em páginas transacionais de até20
mensagens, com um registro privado da operação. Uma falha parcial pode
ser retomada pela mesma identidade. A cada página o servidor confere
a autoria atual, a encarnação do livro/capítulo/conversa e o controle ativo.
Uma execução antiga não recebe permissão para remover mensagens de uma
conversa recriada.

O registro guarda hashes, identidade, estado e contadores; o texto do
rascunho continua no campo privado da própria conversa. Perguntas,
respostas e credenciais não são copiadas para o journal. Recibos de
aplicação permanecem no caminho separado existente.

O cliente continua páginas pendentes e, ao carregar o capítulo, retoma
operações autorizadas anteriormente. Essa descoberta não depende da
existência do documento da conversa. Uma revisão de rascunho impede que
um autosave anterior à edição substitua o rascunho posterior. Respostas
de uma operação em outro autor/capítulo/conversa não atualizam a tela.

Os cenários foram escritos, sem execução. Os índices de mensagens e
aplicações legadas e o fechamento integral do mapa continuam pendentes.

## Progresso por artefato e retomada

A área de produção apresenta registros separados de contrato, planejamento,
preparação, redação, versões preservadas, revisão e integração. Cada item conserva
identidade nativa, versão, estado da execução, aceite registrado, contadores
próprios e eventual versão preservada. Nenhuma dessas informações gera um
percentual único nem certifica publicação ou qualidade do manuscrito atual.
As fontes devem ser reconferidas no fluxo correspondente.

Bloqueios e próximo passo pertencem a um checkpoint privado do artefato. Cada
salvamento cria uma versão e um recibo; conflito de fonte ou de revisão exige
comparação explícita. O rascunho pode ser preservado ao escolher a nova base.
Pedidos sem resposta mantêm a identidade e podem ser consultados sem reenvio ou
repetidos com o mesmo conteúdo. Recriar um artefato não herda seu checkpoint.

Os aceites legados de chat agora conservam metadados de origem junto do recibo
nativo, sem perguntas/respostas extras no índice. Excluir a conversa conserva
evidência histórica da alteração aceita, sem conceder acesso ao corpo excluído.

Estas mudanças estão implementadas em código e com cenários escritos; os testes,
as Rules e a interface ainda não foram executados/validados. Publicação versionada,
guia sem spoilers por volume e portabilidade dos artefatos seguem em implementação.

## Manifesto de publicação versionada — em implementação

O compilador prepara uma edição identificada por versão, com escopo de capítulo,
ato ou livro. Ele confere as fontes contra a integração aceita, monta somente a
prosa canônica, preserva a formatação segura e reconfere cada fonte, capítulo,
ato e a composição final do livro. Capítulos que sairiam da edição ficam em um
registro explícito de remoções; a edição corrente permanece ativa durante a
preparação.

Manifesto preparado não significa publicação confirmada. A compilação ainda
não troca o ponteiro público, não registra URL de sucesso e não muda o livro
para publicado. O guia do leitor, sua proteção por progresso de cada volume,
a confirmação atômica e a interface deste fluxo continuam pendentes.

A adoção da publicação gerenciada usa hasLiteraryPublications, independente da
adoção dos outros recursos editoriais. Após essa adoção, alterações diretas no
staging pelo SDK são bloqueadas. O fluxo precisa ser fechado e validado antes
de uma entrega; nenhum teste, emulador ou navegador foi executado nesta etapa.

## Auditoria global da arquitetura

A integração de atos e livro oferece Auditoria global da arquitetura. O inventário percorre
todas as famílias de planejamento e estrutura do livro, com prévia segmentada das fontes
e do guia sem chamada à IA. A leitura e a conferência terminal conservam provas nativas e
contagens separadas de arquitetura e manuscrito. Planos continuam intenções; associações
não certificam leitura de corpos de lore. A síntese global só aparece após a conferência e
o aceite continua explícito. O [contrato do incremento](tasks/producao-literaria/03-auditoria-global.md)
descreve segurança, escopo e reconciliação ainda pendente. O relatório desta tarefa registra
as verificações dirigidas; o gate integral permanece reprovado na última rodada de cobertura.

## Reconciliação das divergências estruturais

Achados da auditoria global oferecem destinos de estrutura separados da prosa, incluindo
capítulos compostos e marcos identificados pelo arco. A síntese final permite percorrer
os destinos lidos por páginas. Uma decisão planejada conserva sua justificativa sem aplicar
texto. Para confirmar, salve a alteração na área nativa e conclua uma auditoria global
sucessora. Apenas mudança semântica da mesma origem, efetivamente relida, satisfaz a
prova estrutural; nota, recriação, edição só de prosa ou escopo reduzido não bastam.
Consulte o [contrato de reconciliação](tasks/producao-literaria/04-reconciliacao-estrutural.md).

## Continuidade entre volumes

No planejamento, Unidade de outro volume consulta livros próprios e unidades nativas por
páginas. O vínculo identifica livro, tipo e unidade, sem depender de título ou número do
capítulo. O contexto de IA lê as fontes selecionadas pelo leitor nativo; capítulos compostos
usam suas cenas. Alteração invalida o contexto, e remoção, recriação ou acesso revogado
bloqueiam a origem antiga. A prosa e a publicação continuam pertencendo ao livro atual.
Consulte o [contrato e a evidência](tasks/producao-literaria/05-vinculos-entre-volumes.md).

## Execução contínua da primeira versão

A redação por cenas permite autorizar limites totais de aplicações e créditos para um
capítulo preparado. O servidor confere os limites na transação nativa de cada aplicação.
Pausa, mudança de autorização e cancelamento impedem aplicações tardias; retentativas
reutilizam proposta e recibo. Ampliar limites é nova autorização explícita, conservando o
gasto já ocorrido. Texto existente, impedimentos e alterações de fontes pedem decisão.
O término preserva a primeira versão, sem conferir aceite literário, revisão ou publicação.
O [contrato deste incremento](tasks/producao-literaria/06-redacao-continua-delimitada.md)
registra as fases e modos de E4 ainda pendentes.

## Escolher como colaborar com a IA

Em Contrato e decisões, escolha o Método de colaboração e salve. Orientação mantém a
escrita com você: consulte análises de estrutura/prosa e sugestões sobre cenas existentes.
A aplicação por IA ao manuscrito fica indisponível nesse modo. Supervisionado mantém os
aceites explícitos. Contínuo permite autorizar a primeira versão do capítulo com limites
separados; salvar o contrato não inicia execução nem consome créditos.

Observações sobre colaboração conserva seu texto anterior e não concede permissões.
Contratos sem método salvo usam supervisão. Ao alterar o modo, reconfira a preparação e
as propostas antes de retomar. A comparação/histórico mostra a escolha de cada revisão.
O ciclo abaixo coordena as fases do capítulo; as passagens entre capítulos/atos ainda
precisam ser concluídas. Consulte os [limites atuais](tasks/producao-literaria/07-modos-operacionais.md).

## Acompanhar o ciclo de um capítulo

Na preparação do capítulo, abra Ciclo editorial do capítulo. Registre o escopo e os
limites e use Retomar ciclo até a próxima decisão. Escolha quais fases podem passar
continuamente; as demais aguardam sua decisão. Orientação começa pela escrita manual
e preserva sua primeira versão antes da revisão integral.

Use Conferir redação e relatório deste ciclo para abrir os checkpoints existentes.
Pausar impede novas aplicações; Cancelar conserva o texto e as versões já salvas.
Respostas perdidas e passos registrados antes de recarregar a página têm recuperação
pelo mesmo pedido. Um registro interrompido pode ser conferido e finalizado ou cancelado.

Ao editar o manuscrito, reconcilie a etapa sobre o texto atual. Os gastos anteriores e
a primeira versão permanecem preservados. Alterar somente o histórico reconfere as
versões sem repetir a revisão por IA. O ciclo cobre este capítulo; a integração de atos,
livro e publicação mantém seus próprios controles.
Veja o [contrato e a evidência](tasks/producao-literaria/08-ciclo-editorial-capitulo.md).

## Escolher a entrada após outro capítulo

Antes de registrar o ciclo, em Entrada neste capítulo escolha Continuar após um capítulo
revisado. Consulte os ciclos anteriores e escolha pelo título/data. Ao sair de um ato,
consulte e selecione também a integração aceita desse ato. Use Mais ciclos/integrações
para percorrer páginas; a consulta não inicia escrita nem análises. Confira a condição
mostrada e registre. Retomar continua sendo uma decisão separada.

O checkpoint mostra a entrada vinculada e sua conferência. Se o registro ficar sem
resposta, recupere a mesma operação; a escolha original permanece congelada. Para mudar
a condição, prepare um novo ciclo explicitamente. O servidor impede reutilizar origem
recriada ou revisão obsoleta. A sequência de várias unidades está disponível na área descrita abaixo. O bloqueio
por publicação anterior obrigatória ainda está pendente.
Veja o [comportamento e os limites](tasks/producao-literaria/10-selecao-de-passagem.md).

## Produzir uma seleção de capítulos

Abra **Sequência de capítulos**, consulte os capítulos e adicione-os na ordem de leitura.
Você pode carregar outras páginas, retirar capítulos ou mudar a ordem da seleção; a
prévia confere a ordem real antes do registro. Cada execução seleciona até 25 capítulos,
sem impor o tamanho do livro.

Defina o total de aplicações, créditos e passos. No modo contínuo, escolha também quais
fases podem seguir e se a passagem entre capítulos exige nova decisão. O padrão aguarda
você. Confira a prévia e registre os limites. Só depois use **Avançar sequência até a
próxima decisão**. Gerar/analisar não debita créditos; cada aplicação de prosa custa um.

Complete os gates na área de preparação e confira as decisões do ciclo ativo. As cenas
supervisionadas continuam exigindo aceite. As versões inicial e revisada permanecem
separadas. Ao sair de um ato, selecione uma integração integral aceita; uma confirmação
de operação não substitui esse relatório.

O checkpoint mostra consumo agregado, capítulo atual e motivo da parada. Pause ou
cancele pelo conjunto. Para ampliar limites, confira o consumo e confirme a nova escolha.
Consultar não retoma escrita; uma resposta pendente tem botão próprio de recuperação,
usando o mesmo passo registrado, inclusive após mudar de dispositivo. Uma origem ou
correlação indisponível pede conferência, sem reconstruir a intenção por texto atual.
Veja a [fronteira e evidência local](tasks/producao-literaria/14-interface-e-setores-de-sequencia.md).

## Inspeção de passagem em implementação

A API de passagem pode receber uma inspeção nativa da ordem do livro e uma edição
confirmada como pré-requisitos explícitos. A inspeção percorre e reconfere todas as
páginas, identifica a predecessora imediata e impede selecionar um ciclo mais antigo
para saltar capítulos. A inspeção inclui atos vazios e capítulos sem ato sem inventar
predecessores. A prova de publicação vincula manifesto, confirmação e versão publicada.

Esses recursos ainda não têm seleção/retomada na interface nem habilitam a política
obrigatória de publicação anterior. O ingresso inicial e a fronteira de ato integral
permanecem pendentes. Os incrementos 16 e 17 têm testes preparados, ainda não executados.

O [incremento 18](tasks/producao-literaria/18-admissao-por-publicacao.md) acrescenta o
núcleo de admissão por publicação anterior no servidor: primeira unidade por censo,
continuação dentro do ato por ingresso confirmado e fronteira por publicação integral.
A escolha ainda não está disponível no formulário; interface/retomada e fornecimento
de certificados pelo driver de sequências estão pendentes. Não considerar o fluxo
liberado ou validado. Novos testes foram preparados, sem execução neste incremento.

O [incremento 19](tasks/producao-literaria/19-interface-da-admissao.md) compõe no código
a escolha explícita de exigência no contrato e a interface de inspeção do ciclo,
com consulta de edições, páginas por ação e seleção da prova antes do registro.
Acompanhamento local guarda somente IDs por conta/livro/capítulo. O fechamento da
recuperação nativa de start incerto e a composição de sequências ainda estão pendentes;
o fluxo não está liberado nem validado em navegador.

O [incremento 20](tasks/producao-literaria/20-recuperacao-nativa-da-inspecao.md) vincula
o início à encarnação nativa consultada e permite encerrar a intenção original antes
de observar o registro, com fence permanente e cancelamento durável. ACK tardio não
restaura estado encerrado. A composição está em código, com testes preparados e ainda
sem execução. Sequências, casos de concorrência e gates finais continuam pendentes.

O [incremento 22](tasks/producao-literaria/22-contexto-editorial-na-analise-de-lore.md)
compõe o guia canônico na análise de lore da plataforma e no BYOK, com token conferido
antes da geração/registro e da aplicação. O diálogo mostra a instrução exata e sua revisão.
Guia é orientação, nunca evidência do capítulo; hipóteses e reservas não viram fatos sem
apoio no texto. A classificação estruturada ainda está pendente. O código tem testes
preparados, ainda não executados, e não declara revisão integral do livro.

O [incremento 23](tasks/producao-literaria/23-classificacao-das-afirmacoes.md) acrescenta
afirmações classificadas por campo, com evidência e justificativa de interpretação ou
proposta. A interface apresenta a classificação como sugestão da IA, sem selecionar
alterações automaticamente. Legado sem estrutura não é rotulado como fato observado.
A aplicação permanece explícita e não copia claims para campos públicos do lore.
Testes escritos e ainda não executados; retenção e portabilidade dos resultados
privados continuam pendentes de auditoria.

O [incremento 24](tasks/producao-literaria/24-impacto-dos-processos.md) inclui as
origens metadata de ciclos, sequências, inspeções e publicações no motor de impacto.
As verificações separam identidade, versão e leitura; nenhuma prova de nascimento
certifica aprovação da prosa. O guia público e algumas origens sem captura nativa
continuam marcados como pendências. Orquestração/interface e testes deste incremento
seguem abertos; resultados da rodada anterior não validam esse código novo.

O [incremento 25](tasks/producao-literaria/25-origens-das-unidades-e-do-ciclo-atual.md)
reutiliza a origem metadata da integração para conferir unidades publicadas e cruza
o ciclo atual com seu recibo original de registro. A identidade não certifica leitura
do manuscrito, e cancelar não perde a procedência nem concede nova execução.
Índice de evidências do guia, orquestração e interface do mapa seguem pendentes.
Os testes novos foram preparados para o fechamento, sem execução neste incremento.

O [incremento 26](tasks/producao-literaria/26-indice-das-dependencias-do-guia.md) grava
IDs de citações e relações em índice privado por versão, junto ao guia. A recuperação
legada é explícita e ligada à origem nativa; consultar o mapa não abre as citações nem
produz índices. A [ADR 0275](decisions/0275-literary-guide-dependency-index.md) registra
as provas, o rollout e os limites. Orquestração/interface e validação continuam pendentes.

O [incremento 27](tasks/producao-literaria/27-controlador-do-mapa-de-impacto.md) expõe
o controlador do mapa no setor de planejamento: preparação autorizada, coleta,
reconferência, propagação, censo final e resolução justificada. Consultar não gera
índices. A cobertura histórica legada segue explicitamente incompleta; cliente,
interface e gates novos ainda estão pendentes. Resoluções não autorizam publicação.

O [incremento 28](tasks/producao-literaria/28-interface-e-recuperacao-do-impacto.md)
conecta o impacto à produção: seleção nominal, prévia, avanço explícito, pausa,
páginas e decisões privadas. Reabrir apenas lê o journal metadata; consulta não reenvia.
A [ADR 0276](decisions/0276-literary-impact-recovery.md) registra CAS, recuperação e
fence de pedidos. A cobertura legada continua parcial; os testes novos não foram executados.

O [incremento 29](tasks/producao-literaria/29-censo-das-origens-nativas.md) substitui a
lacuna incondicional por censo real dos cabeçalhos privados: contextos, turnos, sidecars,
mensagens antigas e recibos. Pais ausentes não escondem filhos. O texto privado não é
aberto; falta de índice/origem vira associação possível e pendência de cobertura.
Sem lacunas, encerra apenas o inventário registrado; relações implícitas e procedência
histórica sem registro continuam fora dessa certificação. Testes preparados, não rodados.

O [incremento 30](tasks/producao-literaria/30-contrato-da-portabilidade-editorial.md)
prepara o formato editorial portátil: contrato, fichas, documentos, decisões,
evidências, relatórios, checkpoints e propostas textuais, com versões/vínculos
explícitos. O remapeamento desabilita execução e exige revisão na cópia privada.
O núcleo ainda não está conectado à exportação ou restauração `.writer`; os testes
novos não foram executados e a portabilidade funcional continua pendente.

O [incremento 31](tasks/producao-literaria/31-leitura-e-semantica-do-pacote-editorial.md) integra a leitura
explícita de archive v2 e a semântica editorial compartilhada, com referências
paginadas e ciclos conferidos incrementalmente. O produtor continua em v1 e a
restauração v2 permanece bloqueada até completar captura, cleanup e materialização.
Há 27 casos novos preparados, sem execução; portabilidade funcional ainda pendente.

O [incremento 32](tasks/producao-literaria/32-fence-explicito-dos-ciclos.md) coordena explicitamente as
escritas de cabeçalhos dos ciclos com um marcador privado transacional. A cobertura
é `workflow-headers-only`, com Rules e limpeza; não habilita captura global. Há 12
casos novos e um caso de exclusão ampliado, todos sem execução.

O [incremento 33](tasks/producao-literaria/33-coordenacao-dos-escritores-do-processo.md) amplia o marcador
para escritores explícitos de 11 famílias e os checkpoints de publicação. A cobertura
passa a `process-headers-partial`; a captura v2 segue desligada. A exclusão reconfere
escritas tardias antes da raiz. Há 27 novos casos preparados, inclusive SDK real,
ainda sem execução.

O [incremento 34](tasks/producao-literaria/34-captura-de-contratos-e-fichas.md) acrescenta linhagem lógica
atual/versão e o leitor interno paginado de contratos/fichas, com partes e fontes
reautorizadas. A versão imutável idêntica à atual vira alias sem bytes duplicados.
Há 31 casos novos preparados, ainda não executados. O leitor não foi exposto e a
exportação/restauração editorial completa continua pendente.

O [incremento 35](tasks/producao-literaria/35-captura-de-preparacao-e-notas.md) acrescenta captura interna
de notas próprias e preparação histórica. A preparação autoriza o manifesto antes
do corpo; revogação gera placeholder sem citações. Notas próprias permanecem com
vínculos indisponíveis quando necessário. Há 23 casos novos preparados, sem execução;
composição do pacote e restauração completa continuam pendentes.

O [incremento 36](tasks/producao-literaria/36-captura-de-decisoes-proprias.md) captura decisões próprias
de achados/impacto por máscaras fechadas, preservando estados, versões e justificativas
sem copiar resultados, checks ou grants ativos. Impacto confere UID antes do corpo.
Há 22 casos novos preparados, sem execução; pacote completo e restauração seguem pendentes.

O [incremento 37](tasks/producao-literaria/37-captura-de-propostas-e-analises-de-texto.md) acrescenta a captura interna das propostas e análises
nativas de texto. Instrução própria, segmento, proposta, relatório e evidências
mantêm vínculos tipados; a autorização precede o cache e é repetida entre partes.
A cobertura registra somente o segmento/cena fornecido, sem certificar capítulo
ou livro. Há 27 casos novos preparados, sem execução. São treze famílias internas;
composição do pacote e restauração editorial completa continuam pendentes.

O [incremento 38](tasks/producao-literaria/38-captura-de-geracoes-editoriais.md) captura gerações de planejamento, auditoria de ficha e
inferência de contrato usando o mesmo gate estrito do leitor nativo. Preserva
rascunho/instrução próprios, propostas sem adoção e evidências sem offsets
inventados. O índice mantém procedência original, sem preencher universo legado
pelo atual. São quatorze famílias internas e 28 casos novos preparados, sem
execução. Composição do pacote e restauração editorial completa continuam pendentes.

O [incremento 39](tasks/producao-literaria/39-captura-de-ciclos-de-revisao.md)
acrescenta captura interna de ciclos de revisão, sem duplicar achados/citações
nem alterar o job ao encontrar origem stale. A cobertura chapter-scenes pode ser
parcial e não certifica qualidade ou aceite. Vínculos conferem nascimentos
originais; legado sem testemunho e registros recriados ficam indisponíveis.
Dezessete famílias internas, dezesseis casos preparados sem execução. Produtor,
restauração v2 e encerramento das cinco etapas continuam pendentes.

O [incremento 40](tasks/producao-literaria/40-captura-de-integracao-literaria.md)
preserva solicitações, relatórios e citações da integração, mantendo o gate que
oculta resultados após mudança da origem. Sínteses referenciam seus relatórios por
achado/conclusão e não são contadas como nova leitura do manuscrito. Contexto de
JSON canônico permanece distinto da prosa observada. São dezenove famílias internas
e 26 casos preparados sem execução. Produtor/restauração editorial continuam
pendentes, assim como o fechamento formal das cinco etapas.

O [incremento 41](tasks/producao-literaria/41-captura-de-guias-e-manifestos.md)
preserva guia do leitor estruturado, suas versões/retiradas e o manifesto histórico.
Revelações, fatos, relações e aparições conservam citações específicas e chaves
lógicas na cópia privada. Citações autorais não ganham offsets ou verificação do
texto atual. Declarações antigas de publicação não reativam consentimento. São 24
famílias internas e 26 casos preparados sem execução; produtor/restauração completa
e encerramento formal das cinco etapas continuam pendentes.

O [incremento 42](tasks/producao-literaria/42-checkpoints-de-redacao-e-preservacao.md)
preserva checkpoints de primeira versão e marcos sem reativar execução, consentimento
ou débitos. Contagens distinguem aplicações, adoção de texto existente e verificação
técnica da preservação. As referências conferem identidades originais e gates
nativos sem copiar corpos para o checkpoint. São 28 famílias internas e 18 casos
preparados, ainda sem execução; produtor/restauração e cinco etapas seguem pendentes.

O [incremento 43](tasks/producao-literaria/43-checkpoints-de-workflows-e-sequencias.md)
preserva instrução, configuração e progresso histórico de ciclos/sequências. Ator e
origem precedem o conteúdo; referências concluídas usam identidades congeladas,
enquanto vínculos sem prova permanecem indisponíveis. Limites e fases não viram
autorização portátil. São 30 famílias internas e 16 casos preparados sem execução.
Produtor/restauração completa e encerramento das cinco etapas seguem pendentes.

O [incremento 44](tasks/producao-literaria/44-captura-do-mapa-de-impacto.md)
preserva a topologia histórica do impacto sem copiar corpos/rótulos privados ou
reativar propagação. UID/origem precedem o pedido; os derivados exigem escopo e
inventário reautorizados. Testemunho técnico não vira citação do manuscrito, e
contagem não certifica completude semântica ou publicação. São 37 famílias internas
e 14 casos preparados sem execução. Produtor/restauração e cinco etapas continuam
pendentes.

O [incremento 45](tasks/producao-literaria/45-produtor-e-arquivo-editorial-provisorio.md)
compõe o produtor editorial interno, sem habilitar v2 na interface. O salvamento
optativo confere o arquivo inteiro pelo validador semântico compartilhado antes de
confirmar o destino. Um estágio OPFS cifrado e limitado mantém os bytes provisórios,
sem chave persistida ou carregamento integral em RAM. Identidades duplicadas entre
bundles e referências sem alvo interrompem a exportação. A limpeza própria precisa
ser confirmada; selo sozinho não constitui sucesso semântico. Restauração editorial,
ativação e revisão permanecem pendentes. Quatorze casos preparados sem execução.

O [incremento 46](tasks/producao-literaria/46-inventario-e-projecao-da-restauracao-editorial.md)
prepara a restauração com inventário v15 e projeção pelo leitor verificado.
O cancelamento revoga personas, remove partes autenticadas e exige ausência
física antes de headers. Histórico permanece privado e com revisão exigida;
referências sem permissão não são reautorizadas pelo arquivo. Esta infraestrutura
não habilita a restauração v2: estados editáveis, materialização, ativação e leitura
privada ainda precisam ser integrados. Vinte e dois casos preparados sem execução.

O [incremento 47](tasks/producao-literaria/47-materializacao-editorial-privada.md)
prepara a cópia privada do histórico editorial em partes, preservando os bytes
originais e separando as identidades remapeadas. Reserva/partes/registro exigem
provas nativas; a limpeza fecha personas e capa antes do editorial. Há15testes
novos preparados sem execução. A opção de preparo continua interna e desligada;
restauração útil, ativação, recaptura e exclusão ainda não estão disponíveis.
Os testes da rodada anterior não certificam este incremento nem encerram o plano.

O [incremento 48](tasks/producao-literaria/48-contrato-e-planos-restaurados.md)
prepara cópias editáveis de contrato/plano com revisão1 e pendências privadas,
preservando o arquivo histórico. Planos começam como propostas e referências
aguardam reconciliação atual, sem tokens portáteis. Inventário/cancelamento incluem
as cópias. São18casos dedicados preparados sem execução; ainda não há ativação ou
restauração editorial disponível pela interface. O plano integral segue aberto.

O [incremento 49](tasks/producao-literaria/49-censo-final-da-restauracao-editorial.md)
prepara o censo integral da restauração, preservando a contagem certificada da base
e conferindo os recursos editoriais novos por metadata nativa. A prova final precisa
ser consumida na transação e não permite ativação por si. Há13casosNode e1jornadaSDK
preparados sem execução; interface, ativação e fechamento do plano continuam pendentes.

O [incremento50](tasks/producao-literaria/50-exclusao-do-arquivo-editorial.md)
prepara a exclusão do arquivo histórico e das revisões pendentes pela API normal
de livro, com partes antes de headers e conferência antes da raiz. São8Node+1SDK
preparados, sem execução. Isso não libera a ativação nem encerra a portabilidade;
revisão, leitores e recaptura continuam pendentes.

O [incremento 51](tasks/producao-literaria/51-ativacao-editorial-interna.md)
prepara revisão e ativação da cópia editorial no protocolo existente, sob opção
interna desligada por padrão. A confirmação liga o censo à raiz privada com
clocks literários nativos; contrato e planos continuam sujeitos à revisão,
sem copiar execução/publicação. O fluxo de pedido incerto preserva o selo base.
Há 17Node+1SDK preparados, sem execução. Isso não abre restauração pela interface:
leitor autorizado, pendências com CAS e recaptura continuam necessários.

O [incremento 52](tasks/producao-literaria/52-leitor-privado-do-arquivo-editorial.md)
prepara a leitura privada do arquivo depois da limpeza da origem de restauração.
A autorização vem da raiz atual e da identidade nativa, com partes limitadas,
hashes e conferência no consumo. Pendências distinguem corrente original,
alterada e removida; referência histórica não vira autorização de fonte atual.
Há 22Node+2SDK preparados, sem execução. Aceite persistido com CAS, recaptura e
interface continuam necessários antes de abrir o fluxo público.

O [incremento 53](tasks/producao-literaria/53-aceite-e-reconciliacao-das-pendencias.md)
prepara o aceite persistido das pendências no servidor. O autor pode manter o
estado atual ou selecionar referências novamente autorizadas; texto, título e
campos manuais são preservados. Uma revisão antiga não pode sobrescrever a
corrente. O recibo confirma a escolha histórica, sem conceder acesso atual a
fontes revogadas. São26Node+2SDK preparados, sem execução. A interface e a
recuperação do pedido, a recaptura e os gates ainda faltam para abrir o fluxo.
