# Primeiro acesso e espaço pessoal

O Writer organiza o Estúdio a partir de interesses declarados: livros, aventuras,
campanhas ou qualquer combinação. O perfil não concede acesso, não transforma
projetos e não remove ferramentas. Monetização não faz parte deste ciclo.

## Jornada

Ao entrar na área autenticada, a aplicação lê o perfil do servidor. Na ausência
do documento, apresenta três escolhas: interesses, começar do zero/importar/
explorar e acompanhamento guiado/essencial/independente. É possível fechar sem
salvar, pular com confirmação persistida ou salvar. Fechar conserva a possibilidade
de personalizar pelo Estúdio; pular não reinicia o questionário no próximo login.
Falha de leitura não é tratada como ausência de perfil e não bloqueia a escrita.

A Home apresenta título, ação principal e atalhos dos interesses escolhidos.
Todos os projetos conserva sua listagem integral; filtros explícitos continuam
na URL. Na criação, os interesses priorizam os tipos sem excluir alternativas;
o parâmetro kind nos atalhos pode escolher um tipo, sem iniciar a criação.
Todas as ferramentas expande a navegação complementar. Preferências permite
mudar o perfil e retomar ou rever o guia.

O guia tem seis dicas no modo guiado e quatro no essencial. Explicações e links
não comprovam execução de tarefas e nunca criam projetos, enviam prompts ou
consomem créditos. Pausa, etapa e conclusão são persistidas. Elementos visíveis
recebem destaque; quando o alvo não existe na tela atual, o texto e o link
continuam disponíveis. O guia é não modal; modais reais têm prioridade.

## Persistência e fronteiras

A feature onboarding depende de auth/shared. app compõe o provider por UID;
Estúdio, navegação, criação e Preferências consomem somente sua API pública.
O documento privado users/{uid}/preferences/onboarding tem formato fechado v1:
revision, interests, startingPoint, guidance, questionnaire, tour e step.
Leitura vem do servidor e a transação compara a revisão anterior. Rules limitam
acesso ao dono, campos, enums, interesses únicos e revisão monotônica. Nenhum
campo do documento users/{uid}, saldo ou permissão é modificado pelo perfil.
Conflito ou resultado incerto mantém a tela e exige consultar o perfil salvo;
não há retry automático de gravação. Outro dispositivo só é adotado ao carregar
ou atualizar explicitamente o perfil.

## Assistente persistente

PageAssistant permanece montado por conta na área privada, inclusive criação e
consulta. No leitor público oferece somente orientação geral, com target null;
visitantes recebem um acesso ao login. Não consulta manuscritos privados a partir
da página pública. O conteúdo específico de capítulos/cenas continua nos chats
nativos e em seus contratos de captura e aplicação.

A barra nasce minimizada no centro inferior e volta a minimizar ao trocar de
projeto ou área; dentro do mesmo projeto mantém o modo escolhido. A posição
normalizada é uma preferência local por UID, com fallback em memória. Alça aceita
mouse/toque e setas; Shift amplia o passo. Escape cancela um arrasto ou recolhe a
conversa. Restaurar posição retorna ao centro inferior. Resize e teclado virtual
alteram os limites visuais sem substituir a posição salva. Sobreposição com um
campo ou caret de escrita recolhe o painel temporariamente sem persistir o modo.
Não há foco automático ao navegar ou receber resposta.

Em modais, o assistente conserva suas coordenadas flutuantes fora da caixa do
formulário, sem aumentar o diálogo. Continua acessível no mesmo escopo de foco;
é possível escrever nas duas superfícies e mover a barra. Escape no assistente
recolhe a conversa sem fechar o formulário.

A concepção do projeto permanece inline e pode continuar no escopo de foco
de um modal. Durante esse uso, a barra global fica suspensa para manter uma
única conversa flutuante; ao sair do modal, ela reaparece com seu rascunho. O questionário
tem prioridade e suspende temporariamente a barra. O guia não vira host do chat.

Perguntas e respostas ficam somente em RAM, limitadas às últimas 100 mensagens
por sessão. Navegação conserva rascunho, pedido em andamento e mensagens no
escopo original. Uma resposta tardia não cria proposta na nova página. Retornar
ou focar a janela consulta pageAssistant com action inspect, pela generationApi
existente. Essa consulta reautoriza a origem nativa e retorna apenas contextProof,
sem geração, cota ou débito. Respostas só aparecem com prova atual idêntica;
perguntas próprias sobrevivem à revogação. Propostas de ação são descartadas ao
navegar ou revalidar; sua execução mantém a captura original e os handlers nativos.
O histórico de outro projeto não entra automaticamente no prompt atual.
Reload e logout encerram este cache em memória; ele não substitui
os journals e históricos duráveis dos chats existentes.

## Cobertura de integração por composição

| Superfície                | Presença e limite                                                |
| ------------------------- | ---------------------------------------------------------------- |
| Estúdio e listas          | Orientação e capacidades da tela                                 |
| Criação manual/assistida  | Barra global e concepção inline; criação continua explícita      |
| Livros, capítulos e cenas | Orientação do projeto; prosa e aplicação nos contratos nativos   |
| Aventuras e blocos        | Contexto autorizado da aventura; audiência permanece nativa      |
| Campanhas e sessões       | Contexto autorizado da campanha; sem copiar derivados para notas |
| Lore e universos          | Controles visíveis e origem autorizada                           |
| Bibliotecas               | Ações registradas da tela; sem acesso implícito a corpos         |
| Importação/restauração    | Orientação; não repete operações incertas                        |
| Prévia autenticada        | Composição privada mantém a barra                                |
| Leitura pública           | Ajuda geral; sem target privado; visitante acessa login          |

Esta tabela descreve a integração no código. As 66 jornadas dirigidas de
2026-11-03 verificaram perfil, Home, criação e assistência em desktop/mobile e
nos três temas. Isso não equivale a um piloto humano de todas as capacidades.

## Preparação da publicação

É necessário publicar o servidor com inspect e as Rules de onboarding antes do
cliente. Uma versão anterior do servidor não fornece a prova de reautorização;
uma regra anterior não libera o novo documento. Esses recursos e o frontend foram
publicados em 2026-11-03, conforme a [evidência do deploy](entregas/2026-11-03-deploy-primeira-experiencia.md).
Reversão do cliente pode preservar o documento de
preferências sem afetar conteúdo; não apagar preferências como rollback.

Em 2026-11-03 o operador autorizou os testes dos arquivos afetados e a integração
local e, em seguida, o deploy. Os resultados estão nas evidências; a publicação
foi conferida por estado remoto, hashes e navegador anônimo. O fluxo autenticado
real e o piloto humano continuam pendentes. Atualizar snapshots visuais afetados somente após
revisão da interface. Recrutamento, métricas de uso e rollout exigem trabalho
próprio; não foram simulados ou declarados concluídos.
