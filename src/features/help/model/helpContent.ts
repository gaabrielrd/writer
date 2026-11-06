export interface HelpSection {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
}

export interface HelpArticle {
  id: string;
  topic: string;
  title: string;
  summary: string;
  keywords?: string;
  sections: HelpSection[];
  note?: string;
  related: string[];
  destination?: { label: string; path: string };
}

export const helpTopics = [
  {
    id: 'start',
    title: 'Primeiros passos',
    description: 'Entenda o Writer e escolha por onde começar.',
  },
  {
    id: 'projects',
    title: 'Estúdio e projetos',
    description: 'Crie, encontre e organize seu trabalho.',
  },
  {
    id: 'books',
    title: 'Livros e escrita',
    description: 'Do planejamento ao manuscrito e suas versões.',
  },
  {
    id: 'adventures',
    title: 'Aventuras',
    description: 'Prepare cenas, blocos e material para jogadores.',
  },
  {
    id: 'campaigns',
    title: 'Campanhas e sessões',
    description: 'Adapte uma aventura à continuidade da sua mesa.',
  },
  {
    id: 'lore',
    title: 'Universos e Compêndio',
    description: 'Organize o mundo e as referências da história.',
  },
  {
    id: 'ai',
    title: 'IA e personas',
    description: 'Use assistência com contexto e controle de aceite.',
  },
  {
    id: 'images',
    title: 'Imagens e capas',
    description: 'Escolha, reutilize e gerencie suas imagens.',
  },
  {
    id: 'files',
    title: 'Importação e segurança do trabalho',
    description: 'Importe, faça backup e entenda a recuperação.',
  },
  {
    id: 'sharing',
    title: 'Exportação e publicação',
    description: 'Distinga cópia de leitura, publicação e backup.',
  },
  {
    id: 'preferences',
    title: 'Preferências e solução de dúvidas',
    description: 'Ajuste a experiência e resolva situações comuns.',
  },
] as const;

export const helpArticles: HelpArticle[] = [
  {
    id: 'mapa-do-writer',
    topic: 'start',
    title: 'Como o Writer se organiza',
    summary: 'Universo, Livro, Aventura e Campanha: o papel de cada um e como se relacionam.',
    keywords: 'conceitos glossário diferenças mundo projeto mestre autor RPG',
    sections: [
      {
        title: 'Quatro conceitos para se orientar',
        bullets: [
          'Universo é o mundo compartilhado: personagens, lugares, organizações e outros conceitos que podem servir a vários projetos.',
          'Livro é o projeto de um manuscrito. Organiza capítulos e, quando você escolhe trabalhar assim, cenas que compõem o texto.',
          'Aventura é o material que você prepara para jogar: cenas, planejamento, textos e blocos com informações para o mestre ou os jogadores.',
          'Campanha é a continuidade de uma mesa. Reúne preparação, sessões, notas, pistas, missões e adaptações do material usado naquela mesa.',
        ],
      },
      {
        title: 'Um exemplo',
        paragraphs: [
          'Você cria o universo Costa de Vidro e registra suas cidades. Um livro conta a história de uma navegadora nesse mundo. Uma aventura apresenta uma expedição ao farol. Duas campanhas podem usar essa aventura, cada uma com suas notas e mudanças, sem editar o original.',
        ],
      },
      {
        title: 'O que é opcional',
        paragraphs: [
          'Você pode começar por um livro, aventura ou campanha independente. Não precisa criar um universo, configurar uma persona ou usar IA antes de escrever. Vincular um universo organiza referências; não publica o projeto.',
        ],
      },
    ],
    related: ['primeiro-livro', 'primeira-aventura', 'primeira-campanha'],
  },
  {
    id: 'primeiro-livro',
    topic: 'start',
    title: 'Quero escrever meu primeiro livro',
    summary: 'Um caminho curto entre criar o projeto e começar o primeiro capítulo.',
    sections: [
      {
        title: 'Comece com o que você já tem',
        steps: [
          'No Estúdio, abra Novo projeto. Escolha a criação manual ou com IA.',
          'Escolha Livro e informe sua ideia ou título inicial. Universo e persona são opcionais.',
          'Revise os dados do projeto. Na criação manual, título e dados essenciais bastam; detalhes e capa podem ficar para depois.',
          'Confirme a criação e abra o livro. Crie um capítulo e comece a escrever no editor.',
          'Acrescente fichas ao Compêndio quando precisar de referências. Use cenas se quiser planejar unidades menores antes de compor o capítulo.',
        ],
      },
      {
        title: 'Se o texto já existe',
        paragraphs: [
          'Use Importar e restaurar no Estúdio para trazer um documento. Revise a divisão dos capítulos antes de confirmar. Para recuperar um arquivo nativo do Writer, escolha a restauração correspondente.',
        ],
      },
    ],
    related: ['criar-projeto', 'editor', 'importar-documento'],
    destination: { label: 'Criar um livro', path: '/studio/new?kind=book' },
  },
  {
    id: 'primeira-aventura',
    topic: 'start',
    title: 'Quero preparar uma aventura',
    summary: 'Organize o material que será usado durante o jogo, com informações por audiência.',
    sections: [
      {
        title: 'Da ideia às cenas',
        steps: [
          'Abra Novo projeto no Estúdio e escolha Aventura, com criação manual ou assistida.',
          'Informe e revise os dados. Se o cenário for compartilhado, selecione um universo; isso é opcional.',
          'Abra a aventura e planeje suas cenas. Use o Texto principal para o conteúdo central de cada cena.',
          'Acrescente blocos para separar descrições, informações e outros textos. Confira a audiência de cada bloco.',
          'Consulte as prévias para entender o que fica visível em cada recorte. Para usar o material em uma mesa com continuidade, prepare uma campanha.',
        ],
      },
    ],
    note: 'As prévias de Mestre e Jogadores são ferramentas privadas de conferência do criador. Escolher uma audiência não compartilha a aventura automaticamente.',
    related: ['blocos-audiencias', 'previas-aventura', 'primeira-campanha'],
    destination: { label: 'Criar uma aventura', path: '/studio/new?kind=adventure' },
  },
  {
    id: 'primeira-campanha',
    topic: 'start',
    title: 'Quero organizar minha campanha',
    summary: 'Prepare sessões e acompanhe a sua mesa, com ou sem uma aventura como base.',
    sections: [
      {
        title: 'Monte seu espaço de preparação',
        steps: [
          'No Estúdio, crie um projeto do tipo Campanha. Uma campanha pode começar independente.',
          'Se quiser usar uma aventura própria, prepare sua captura como base e confira o material antes de ativar.',
          'Registre notas próprias da mesa e crie a primeira sessão, com título, preparação e data opcional.',
          'Vincule as cenas e fichas relevantes à sessão. Crie pistas e missões para acompanhar o que atravessa os encontros.',
          'Quando precisar adaptar uma ficha para essa mesa, use uma variante. A alteração não precisa mudar a aventura original.',
        ],
      },
    ],
    related: ['base-congelada', 'sessoes', 'variantes'],
    destination: { label: 'Criar uma campanha', path: '/studio/new?kind=campaign' },
  },
  {
    id: 'perfil-e-guia',
    topic: 'start',
    title: 'Perfil de criação e guia de primeiros passos',
    summary: 'Personalize os atalhos e retome o onboarding sem perder acesso às ferramentas.',
    sections: [
      {
        title: 'O perfil organiza a entrada',
        paragraphs: [
          'O questionário pergunta seus interesses em livros, aventuras e campanhas, como deseja começar e quanto acompanhamento prefere. Você pode combinar interesses. As respostas priorizam atalhos; não limitam tipos de projeto nem dão permissões extras.',
        ],
      },
      {
        title: 'Retomar ou mudar',
        steps: [
          'Abra Preferências na navegação.',
          'No perfil de criação, ajuste suas escolhas ou retome o guia.',
          'Siga os links das dicas. Você pode pausar e continuar depois.',
        ],
      },
      {
        title: 'Guia e ajuda têm papéis diferentes',
        paragraphs: [
          'O guia apresenta os primeiros caminhos. Esta Central de ajuda serve como consulta contínua. Ler uma dica não cria projetos, não executa ações de IA e não consome créditos.',
        ],
      },
    ],
    related: ['navegacao', 'assistente-pagina'],
    destination: { label: 'Abrir Preferências', path: '/settings/preferences' },
  },
  {
    id: 'navegacao',
    topic: 'projects',
    title: 'Onde encontro cada ferramenta?',
    summary: 'Home, Projetos, Importar e restaurar, Em andamento e os demais espaços.',
    sections: [
      {
        title: 'Dentro do Estúdio',
        bullets: [
          'Home reúne retomadas recentes e atalhos para criar.',
          'Projetos lista livros, aventuras e campanhas, com filtros por tipo.',
          'Importar e restaurar reúne as entradas para documentos e arquivos de backup.',
          'Em andamento permite consultar e retomar importações, restaurações, preparações de campanha e exclusões.',
        ],
      },
      {
        title: 'Fora do Estúdio',
        paragraphs: [
          'Universos organiza mundos compartilhados. Biblioteca de Imagens guarda imagens pessoais. Preferências ajusta perfil, leitura e área de trabalho; Inteligência artificial concentra a configuração de IA. Todas as ferramentas revela a navegação complementar. A Biblioteca de Imagens é diferente do espaço Biblioteca anunciado para o ecossistema.',
        ],
      },
      {
        title: 'Mais espaço para trabalhar',
        paragraphs: [
          'Recolha a lateral para manter apenas os ícones. Passe o ponteiro ou dê foco a um ícone para identificar seu destino. No editor, use o modo expandido quando quiser dedicar mais espaço ao texto.',
        ],
      },
    ],
    related: ['projetos', 'operacoes', 'disponibilidade'],
    destination: { label: 'Abrir o Estúdio', path: '/studio' },
  },
  {
    id: 'criar-projeto',
    topic: 'projects',
    title: 'Criar manualmente ou com IA',
    summary: 'Escolha o tipo de projeto e revise a proposta antes de confirmar a criação.',
    sections: [
      {
        title: 'Criação manual',
        paragraphs: [
          'Use quando já souber o que deseja ou quiser preencher os dados por conta própria. Escolha Livro, Aventura ou Campanha, informe os campos necessários e confirme. A criação manual do texto não exige o pacote de geração por IA.',
        ],
      },
      {
        title: 'Criação assistida',
        steps: [
          'Escolha a entrada com IA e o tipo de projeto.',
          'Descreva a ideia e, se desejar, escolha universo e persona antes da conversa.',
          'Converse para definir a proposta. Revise e ajuste os dados; salve o rascunho quando essa opção estiver disponível.',
          'Confira a confirmação, inclusive custos e capa selecionada, e aceite somente quando estiver satisfeito.',
        ],
      },
      {
        title: 'Você continua no controle',
        paragraphs: [
          'Uma proposta ainda não é um projeto criado. Conversar ou ver uma prévia não equivale à confirmação final. Na criação de livro, você pode continuar sem capa ou escolher uma imagem existente.',
        ],
      },
    ],
    related: ['creditos', 'personas', 'imagens'],
    destination: { label: 'Abrir Novo projeto', path: '/studio/new' },
  },
  {
    id: 'projetos',
    topic: 'projects',
    title: 'Encontrar e retomar projetos',
    summary: 'Use os filtros do Estúdio e a retomada para voltar ao trabalho certo.',
    sections: [
      {
        title: 'Localizar',
        steps: [
          'Abra Projetos no Estúdio.',
          'Use os filtros de tipo e os controles de listagem para localizar o trabalho. Um filtro ativo pode ocultar outros tipos.',
          'Abra o projeto para acessar seus detalhes, planejamento e texto.',
        ],
      },
      {
        title: 'Continuar de onde parou',
        paragraphs: [
          'A Home pode mostrar acessos recentes ao trabalho. O Writer confere seu acesso ao abrir o destino. Uma retomada é um atalho; não é uma cópia do texto e pode deixar de abrir se o recurso foi removido ou o acesso mudou.',
        ],
      },
      {
        title: 'Projetos com o mesmo universo',
        paragraphs: [
          'Compartilhar um universo não junta manuscritos, sessões ou notas. Cada projeto mantém sua identidade e seus próprios conteúdos.',
        ],
      },
    ],
    related: ['navegacao', 'mapa-do-writer'],
    destination: { label: 'Ver Projetos', path: '/studio/projects' },
  },
  {
    id: 'operacoes',
    topic: 'projects',
    title: 'O que aparece em Em andamento?',
    summary: 'Consulte operações longas ou sem resposta antes de iniciar outra tentativa.',
    sections: [
      {
        title: 'Três grupos de operações',
        bullets: [
          'Importações e restaurações: acompanhe preparações de documentos e backups.',
          'Campanhas: consulte preparações, comparações e adoções de base.',
          'Exclusões: acompanhe a remoção de projetos e as etapas de limpeza.',
        ],
      },
      {
        title: 'Como retomar',
        steps: [
          'Abra Em andamento e escolha a aba correspondente.',
          'Identifique o projeto e leia o estado da operação.',
          'Use o controle oferecido para consultar, continuar ou encerrar. Aguarde a confirmação antes de começar outra operação equivalente.',
        ],
      },
    ],
    note: 'Um pedido sem resposta pode ter sido concluído no servidor. A ausência de confirmação na tela não prova que nada aconteceu. Consultar o resultado é diferente de reenviar a ação.',
    related: ['pedido-sem-resposta', 'restaurar-backup', 'excluir-projeto'],
    destination: { label: 'Consultar Em andamento', path: '/studio/operations' },
  },
  {
    id: 'estrutura-livro',
    topic: 'books',
    title: 'Atos, capítulos, cenas e manuscrito',
    summary: 'Entenda as unidades do livro e a diferença entre planejar e escrever.',
    sections: [
      {
        title: 'A estrutura',
        bullets: [
          'Atos agrupam capítulos e ajudam a organizar partes maiores da obra.',
          'Capítulos organizam a leitura do manuscrito. Podem ter prosa própria no editor ou ser compostos por cenas, conforme o modo escolhido.',
          'Cenas são unidades menores de planejamento e texto, com ordem e referências próprias.',
          'Manuscrito é o texto resultante da composição ativa do livro. Planos privados não devem ser confundidos com a prosa publicada.',
        ],
      },
      {
        title: 'Trabalhar por cenas',
        paragraphs: [
          'Planeje e ordene as cenas, escreva sua prosa e confira como elas compõem o capítulo. A ordem do manuscrito é distinta da ordem de arcos ou eventos da cronologia. Ao converter uma estrutura existente, leia a confirmação e confira a composição; não presuma que mover um agrupador apaga ou reescreve o texto.',
        ],
      },
    ],
    related: ['editor', 'planejar-cenas', 'arcos-cronologia'],
  },
  {
    id: 'editor',
    topic: 'books',
    title: 'Escrever e salvar no editor',
    summary: 'Texto rico, referências de lore, salvamento e espaço de escrita.',
    sections: [
      {
        title: 'Escreva no corpo do capítulo ou da cena',
        paragraphs: [
          'Abra a unidade de texto pelo projeto. A barra do editor oferece formatação de prosa, como títulos, negrito, itálico, listas e citações. O Compêndio ao lado ajuda a consultar informações sem abandonar a escrita.',
        ],
      },
      {
        title: 'Confira o estado do salvamento',
        paragraphs: [
          'O editor acompanha alterações e informa seu estado. Antes de fechar a página, trocar de conta, restaurar uma versão ou executar outra operação sobre o texto, confirme que não há edição ou pedido pendente. Uma mensagem de falha exige atenção; ela não significa que seu rascunho foi salvo.',
        ],
      },
      {
        title: 'Ajuste o ambiente',
        paragraphs: [
          'Use o modo expandido e os divisores disponíveis para ganhar espaço. Preferências permite ajustar a largura do conteúdo e a tipografia literária. Isso muda a apresentação, sem reescrever seu manuscrito.',
        ],
      },
    ],
    related: ['historico', 'chat-texto', 'preferencias'],
  },
  {
    id: 'planejar-cenas',
    topic: 'books',
    title: 'Planejar, ordenar e arquivar cenas',
    summary: 'Separe intenção narrativa de texto e mantenha a composição sob controle.',
    sections: [
      {
        title: 'Planejamento e prosa',
        paragraphs: [
          'Use o planejamento para registrar o objetivo da cena e suas referências. Escreva o que o leitor verá no campo de texto. Ter uma cena planejada não significa que ela já contribui com prosa para o manuscrito.',
        ],
      },
      {
        title: 'Organização',
        steps: [
          'Abra a área de Cenas do livro ou da aventura.',
          'Crie ou abra uma cena e preencha o que for necessário.',
          'Ajuste a ordem e os vínculos à estrutura do projeto.',
          'Ao arquivar ou restaurar, confira a participação da cena na composição ativa. Consulte o arquivo para localizar cenas retiradas do fluxo atual.',
        ],
      },
      {
        title: 'Referências explícitas',
        paragraphs: [
          'Vincule cenas e entidades pelos controles de referência. Mencionar um nome no texto não equivale a criar todos os vínculos de planejamento.',
        ],
      },
    ],
    related: ['estrutura-livro', 'arcos-cronologia', 'mencoes'],
  },
  {
    id: 'arcos-cronologia',
    topic: 'books',
    title: 'Arcos, marcos e cronologia',
    summary:
      'Acompanhe desenvolvimento narrativo e acontecimentos sem mudar a ordem do manuscrito.',
    sections: [
      {
        title: 'Qual usar?',
        bullets: [
          'Arco acompanha uma linha de desenvolvimento, como a confiança entre duas personagens.',
          'Marco registra um ponto significativo desse desenvolvimento.',
          'Evento da cronologia registra um acontecimento e pode usar uma data textual, como “terceira noite do inverno”.',
        ],
      },
      {
        title: 'Organize as relações',
        paragraphs: [
          'Nas abas do projeto, crie os itens, ordene-os e vincule cenas ou entidades quando fizer sentido. Essas ordens são independentes: reorganizar eventos da cronologia não reorganiza automaticamente capítulos. Uma referência pode ficar indisponível se sua origem deixar de estar acessível.',
        ],
      },
    ],
    related: ['planejar-cenas', 'compendio'],
  },
  {
    id: 'progresso',
    topic: 'books',
    title: 'Estado editorial, metas e contagem de palavras',
    summary: 'Acompanhe o trabalho atual e a preparação sem confundir progresso com publicação.',
    sections: [
      {
        title: 'Progresso de escrita',
        paragraphs: [
          'Defina uma meta total de palavras e acompanhe o manuscrito atual. O estado editorial indica a etapa do seu trabalho; o checklist ajuda a acompanhar a preparação. Esses controles são privados e não publicam o projeto.',
        ],
      },
      {
        title: 'Como interpretar a contagem',
        paragraphs: [
          'A contagem acompanha a prosa ativa, não toda anotação ou plano. Em projetos anteriores, uma verificação pode precisar terminar antes de o total ficar pronto. Aguarde essa conferência em vez de interpretar um agregado ainda indisponível como zero.',
        ],
      },
      {
        title: 'Datas e retomada',
        paragraphs: [
          'A preferência de fuso organiza a apresentação de datas. Retomadas ajudam a voltar a um destino autorizado; não substituem salvamento nem histórico de versões.',
        ],
      },
    ],
    related: ['historico', 'preferencias', 'publicar'],
  },
  {
    id: 'historico',
    topic: 'books',
    title: 'Salvar, comparar e restaurar versões do texto',
    summary: 'Guarde pontos de referência e recupere uma versão com conferência explícita.',
    sections: [
      {
        title: 'O histórico é uma escolha de preservação',
        paragraphs: [
          'Capture uma versão manual quando chegar a um ponto que deseja guardar. O histórico é privado. Não o trate como uma gravação de cada tecla ou de todas as edições automáticas.',
        ],
      },
      {
        title: 'Antes de restaurar',
        steps: [
          'Termine ou resolva alterações e operações pendentes do texto atual.',
          'Abra o histórico da unidade de texto e escolha a versão.',
          'Compare o conteúdo e confirme que é a fonte desejada.',
          'Confirme a restauração. O fluxo preserva uma cópia anterior e atualiza o texto e sua contagem em conjunto.',
        ],
      },
      {
        title: 'Versão não é backup completo',
        paragraphs: [
          'O histórico guarda versões de texto dentro do projeto. Um arquivo de backup preserva um conjunto maior de recursos e permite outra jornada de recuperação. Apagar explicitamente uma versão ou excluir o projeto afeta sua disponibilidade.',
        ],
      },
    ],
    related: ['backup', 'pedido-sem-resposta', 'editor'],
  },
  {
    id: 'estrutura-aventura',
    topic: 'adventures',
    title: 'Como organizar o conteúdo de uma aventura',
    summary: 'Cenas, partes, planejamento e lore próprio do material de jogo.',
    sections: [
      {
        title: 'Prepare unidades consultáveis',
        paragraphs: [
          'A aventura reúne cenas e sua organização em partes, planejamento narrativo e referências. Cada cena mantém um Texto principal e pode incluir blocos adicionais. Isso permite separar descrição, instruções e informações sem concentrar tudo em um único texto.',
        ],
      },
      {
        title: 'Mundo e material local',
        paragraphs: [
          'Use o lore da aventura para informações próprias desse material. Se houver universo vinculado, mantenha clara a diferença entre sua ficha local e a origem global. Em uma campanha, a base preparada da aventura terá seu próprio contexto de leitura.',
        ],
      },
      {
        title: 'Antes de levar à mesa',
        bullets: [
          'Confira a ordem das cenas e a função de cada uma.',
          'Revise a audiência de cada bloco e as ilustrações.',
          'Use as prévias para conferir os recortes e prepare uma campanha se precisar de sessões e continuidade.',
        ],
      },
    ],
    related: ['blocos-audiencias', 'lore-aventura', 'base-congelada'],
  },
  {
    id: 'blocos-audiencias',
    topic: 'adventures',
    title: 'Texto principal, blocos e audiências',
    summary: 'Separe conteúdos da cena e escolha quem deve vê-los em cada recorte.',
    sections: [
      {
        title: 'Cada texto tem seu lugar',
        paragraphs: [
          'O Texto principal é o corpo central da cena. Blocos adicionais têm identidade própria e podem ter tipo, texto, audiência e ilustração. Você pode editar e organizar os adicionais sem substituir o principal.',
        ],
      },
      {
        title: 'Audiência é uma decisão explícita',
        paragraphs: [
          'A audiência determina a participação do bloco nas prévias correspondentes. Conteúdos novos ou antigos sem classificação devem ser tratados como privados até você revisar. Confira o que pertence ao mestre e o que pode aparecer para jogadores.',
        ],
      },
      {
        title: 'Exemplo',
        paragraphs: [
          'O principal descreve a chegada ao farol. Um bloco traz a descrição para ler à mesa; outro guarda o segredo do guardião. Classifique e confira cada um na prévia antes de usar o material. Principal e adicionais ativos contribuem para a contagem da cena.',
        ],
      },
    ],
    related: ['previas-aventura', 'ilustracoes', 'chat-texto'],
  },
  {
    id: 'previas-aventura',
    topic: 'adventures',
    title: 'Conferir as prévias de Mestre e Jogadores',
    summary: 'Veja recortes do conteúdo e entenda por que uma prévia ainda é privada.',
    sections: [
      {
        title: 'O que cada recorte ajuda a conferir',
        bullets: [
          'Original completo permite conferir o conjunto do material.',
          'Mestre permite verificar o recorte destinado à condução.',
          'Jogadores permite conferir o conteúdo classificado para esse público.',
        ],
      },
      {
        title: 'Como usar',
        steps: [
          'Abra a prévia na aventura.',
          'Alterne entre os recortes disponíveis.',
          'Confira textos e ilustrações; volte aos blocos para corrigir classificações quando necessário.',
        ],
      },
      {
        title: 'Prévia não é convite',
        paragraphs: [
          'Essas telas continuam restritas ao criador. A classificação de audiência não concede acesso a outras contas nem cria uma página pública. Não envie o endereço da prévia como se fosse um link de compartilhamento.',
        ],
      },
    ],
    related: ['blocos-audiencias', 'publicar', 'privacidade'],
  },
  {
    id: 'base-congelada',
    topic: 'campaigns',
    title: 'O que é a base congelada de uma campanha?',
    summary: 'Uma captura preparada da aventura para aquela mesa, com procedência preservada.',
    keywords: 'snapshot captura origem fonte cópia',
    sections: [
      {
        title: 'Por que congelar a base?',
        paragraphs: [
          'A campanha precisa de uma referência estável para preparar sessões e adaptar material. A captura prepara uma base da aventura própria, com cenas e os recursos explicitamente vinculados. Ela preserva a procedência do material; não é uma assinatura que troca todo o conteúdo a cada edição do original.',
        ],
      },
      {
        title: 'Preparar e ativar',
        steps: [
          'Na campanha, escolha a aventura própria como origem quando o fluxo oferecer essa preparação.',
          'Acompanhe a captura. Se for interrompida, consulte a operação em andamento.',
          'Confira e ative a base preparada somente após sua conclusão.',
        ],
      },
      {
        title: 'Autorização continua necessária',
        paragraphs: [
          'A existência de uma captura não concede acesso permanente a qualquer origem. Se uma referência deixar de estar autorizada, seu conteúdo derivado pode ficar indisponível. As notas próprias da mesa têm um papel separado.',
        ],
      },
    ],
    related: ['notas-campanha', 'variantes', 'atualizar-base'],
  },
  {
    id: 'notas-campanha',
    topic: 'campaigns',
    title: 'Notas próprias da campanha',
    summary: 'Registre decisões e acontecimentos da mesa sem alterar a aventura original.',
    sections: [
      {
        title: 'Para que servem',
        paragraphs: [
          'Notas são textos autorais da campanha, com título e conteúdo próprio. Use-as para decisões da mesa, lembretes e preparação. Não precisam ser uma variante de ficha e não copiam automaticamente o lore derivado.',
        ],
      },
      {
        title: 'Preserve a diferença',
        paragraphs: [
          'A base mostra o material de referência. A variante adapta uma ficha. A nota registra o que você escreveu para sua mesa. Notas próprias continuam acessíveis quando a origem da base fica indisponível, respeitado seu acesso à campanha.',
        ],
      },
      {
        title: 'Se houver conflito',
        paragraphs: [
          'Se outra edição alterou a nota, leia o estado indicado e preserve seu rascunho antes de escolher um descarte explícito. Consultar um pedido anterior confirma aquele pedido; não significa adotar silenciosamente um texto mais recente.',
        ],
      },
    ],
    related: ['variantes', 'sessoes', 'pedido-sem-resposta'],
  },
  {
    id: 'variantes',
    topic: 'campaigns',
    title: 'Adaptar lore com variantes da mesa',
    summary: 'Mude uma ficha na campanha sem reescrever a origem para os outros projetos.',
    sections: [
      {
        title: 'Uma adaptação localizada',
        paragraphs: [
          'Uma variante é a versão de uma ficha usada naquela campanha. Por exemplo, uma cidade da aventura pode estar destruída na sua mesa. A variante permite registrar a adaptação sem mudar o original nem outra campanha.',
        ],
      },
      {
        title: 'Editar e recuperar',
        paragraphs: [
          'Abra a ficha efetiva da campanha e use os controles de variante. Revise antes de salvar. Retirar, restaurar ou descartar alterações são decisões distintas; leia qual conteúdo cada ação afeta. A recuperação de um rascunho depende da autorização atual da ficha e de seus alvos.',
        ],
      },
      {
        title: 'O que não vira variante',
        paragraphs: [
          'Anotações livres pertencem às notas. Uma referência indisponível não pode ser recuperada apenas porque houve acesso no passado. Ao atualizar a base, revise como as variantes se relacionam com a candidata.',
        ],
      },
    ],
    related: ['base-congelada', 'atualizar-base', 'notas-campanha'],
  },
  {
    id: 'atualizar-base',
    topic: 'campaigns',
    title: 'Comparar e adotar uma nova base',
    summary: 'Prepare uma candidata, confira as diferenças e confirme a troca conscientemente.',
    sections: [
      {
        title: 'A candidata é uma preparação',
        paragraphs: [
          'Uma aventura pode ter evoluído desde a captura. Preparar uma candidata permite comparar o material novo sem trocar imediatamente a base ativa, as variantes ou as notas. Uma preparação concluída não equivale à adoção.',
        ],
      },
      {
        title: 'Fluxo de atualização',
        steps: [
          'Prepare a candidata a partir da origem autorizada.',
          'Confira as diferenças e as decisões sobre fichas e variantes.',
          'Revise o que será conservado, inclusive referências antigas que ainda estejam autorizadas.',
          'Confirme a adoção explícita. Só então a campanha passa a usar a nova base.',
        ],
      },
      {
        title: 'Se pausar',
        paragraphs: [
          'Use Em andamento para localizar a operação. Não inicie outra troca apenas porque uma confirmação demorou; consulte o resultado da tentativa original. Notas próprias não devem ser substituídas por conteúdo da candidata.',
        ],
      },
    ],
    related: ['operacoes', 'variantes', 'pedido-sem-resposta'],
  },
  {
    id: 'sessoes',
    topic: 'campaigns',
    title: 'Preparar e organizar sessões',
    summary: 'Separe cada encontro, sua preparação e as referências úteis.',
    sections: [
      {
        title: 'Crie uma sessão',
        steps: [
          'Abra a área de sessões da campanha.',
          'Defina título, preparação própria, estado e data opcional.',
          'Ajuste a ordem dos encontros e acrescente referências de fichas ou cenas pelos controles disponíveis.',
          'Ao preparar ou conduzir, consulte o material vinculado no contexto da sessão.',
        ],
      },
      {
        title: 'Referenciar não é copiar',
        paragraphs: [
          'Uma referência abre o material autorizado da base ou da ficha efetiva. Ela não transforma automaticamente todo o conteúdo em texto próprio da preparação. Se uma cena desaparecer após adotar outra base, o vínculo pode ficar indisponível; revise ou remova a referência.',
        ],
      },
      {
        title: 'Privacidade',
        paragraphs: [
          'Sessões e preparação são privadas nesta experiência. Registrar data ou escolher um estado não agenda convites nem abre uma mesa compartilhada.',
        ],
      },
    ],
    related: ['pistas-missoes', 'notas-campanha', 'base-congelada'],
  },
  {
    id: 'pistas-missoes',
    topic: 'campaigns',
    title: 'Acompanhar pistas, missões e pendências',
    summary: 'Mantenha continuidade entre sessões sem recriar os mesmos itens a cada encontro.',
    sections: [
      {
        title: 'Itens da campanha',
        paragraphs: [
          'Pistas e missões pertencem à campanha e podem ser vinculadas a várias sessões. Use estados, ordem e pendências para acompanhar o que foi apresentado, resolvido ou ainda precisa de atenção.',
        ],
      },
      {
        title: 'Exemplo de continuidade',
        paragraphs: [
          'A pista “selo partido” aparece na primeira sessão e ganha significado na terceira. Vincule o mesmo item às duas sessões. Uma missão pode continuar aberta entre encontros sem ser duplicada.',
        ],
      },
      {
        title: 'Ao remover uma sessão',
        paragraphs: [
          'Excluir uma sessão não deve ser interpretado como excluir automaticamente os itens reutilizáveis da campanha. Confira os vínculos e o estado dos próprios itens ao reorganizar sua preparação.',
        ],
      },
    ],
    related: ['sessoes', 'notas-campanha'],
  },
  {
    id: 'universos',
    topic: 'lore',
    title: 'Criar um universo e vinculá-lo a projetos',
    summary: 'Mantenha um mundo comum sem misturar o conteúdo próprio de cada projeto.',
    sections: [
      {
        title: 'Quando vale criar um universo',
        paragraphs: [
          'Crie um universo quando diferentes histórias ou mesas compartilham um mundo. Reúna nele as fichas globais que fazem sentido em vários contextos. Um projeto independente pode ganhar um vínculo depois, pelos controles disponíveis.',
        ],
      },
      {
        title: 'Como começar',
        steps: [
          'Abra Universos e crie o mundo.',
          'Registre as fichas e relações do cenário ou use a importação revisada de lore.',
          'Ao criar ou editar um projeto, escolha o universo quando houver o campo de vínculo.',
          'Confira, no projeto, a distinção entre lore global e próprio.',
        ],
      },
      {
        title: 'Organização não é autorização irrestrita',
        paragraphs: [
          'Vincular o universo não copia todas as fichas para notas nem concede compartilhamento público. A origem e a disponibilidade dos recursos continuam sendo conferidas.',
        ],
      },
    ],
    related: ['compendio', 'lore-global-local', 'importar-lore'],
    destination: { label: 'Abrir Universos', path: '/universes' },
  },
  {
    id: 'compendio',
    topic: 'lore',
    title: 'O que é lore e para que serve o Compêndio?',
    summary: 'Fichas consultáveis para manter a consistência de personagens, lugares e conceitos.',
    keywords: 'glossário entidades atributos relações personagens locais organização',
    sections: [
      {
        title: 'Lore é o conhecimento do seu mundo',
        paragraphs: [
          'Uma ficha reúne informações sobre uma entidade: personagem, local, organização ou outro conceito. Nome, descrição, campos e relações ajudam a consultar os fatos durante o planejamento e a escrita. O Compêndio organiza essas fichas.',
        ],
      },
      {
        title: 'Como usar bem',
        bullets: [
          'Registre fatos que você precisará consultar ou manter consistentes.',
          'Use os tipos e campos adequados à ficha; atributos numéricos possuem controles próprios.',
          'Relacione fichas pelos controles explícitos quando houver uma relação relevante.',
          'Busque e filtre para encontrar uma ficha. Leia a origem antes de decidir onde editar.',
        ],
      },
      {
        title: 'Ficha e prosa são diferentes',
        paragraphs: [
          'A ficha pode dizer “Lia evita o mar”. O capítulo mostra essa característica na história. Alterar a ficha não reescreve automaticamente o texto já produzido. Uma sugestão da IA também precisa de revisão e aceite próprios.',
        ],
      },
    ],
    related: ['lore-global-local', 'mencoes', 'editar-lore'],
  },
  {
    id: 'lore-global-local',
    topic: 'lore',
    title: 'Lore global, lore próprio e variantes',
    summary: 'Saiba qual origem está consultando e qual trabalho será afetado por uma edição.',
    sections: [
      {
        title: 'Três escopos',
        bullets: [
          'Global: pertence ao universo e pode servir a projetos vinculados.',
          'Próprio: pertence ao livro ou à aventura e descreve seu contexto particular.',
          'Variante: adapta uma ficha para uma campanha específica.',
        ],
      },
      {
        title: 'Antes de editar',
        paragraphs: [
          'Confira a identificação da origem. Se a alteração vale para todo o mundo, procure a ficha no universo. Se é particular de uma história ou material, use o lore próprio. Se é consequência do que aconteceu em uma mesa, avalie uma variante ou nota de campanha.',
        ],
      },
      {
        title: 'Se o acesso mudar',
        paragraphs: [
          'Uma origem removida ou sem autorização pode deixar referências e respostas derivadas indisponíveis. Recriar uma ficha com o mesmo nome não restabelece automaticamente o histórico antigo. A prosa que você já aplicou é distinta do acesso à fonte.',
        ],
      },
    ],
    related: ['universos', 'lore-aventura', 'variantes'],
  },
  {
    id: 'editar-lore',
    topic: 'lore',
    title: 'Criar, editar e remover fichas de lore',
    summary: 'Revise os campos alterados e resolva pendências antes de repetir uma gravação.',
    sections: [
      {
        title: 'Uma edição de cada vez',
        steps: [
          'Abra o Compêndio no contexto correto e crie ou selecione uma ficha.',
          'Altere apenas os campos desejados e revise as relações.',
          'Salve e aguarde a confirmação. Se houver conflito, confira a versão observada antes de decidir o que descartar ou refazer.',
        ],
      },
      {
        title: 'Rascunhos e recuperação',
        paragraphs: [
          'Alguns fluxos preservam uma preparação protegida no mesmo dispositivo. Reabrir pode oferecer revisão, consulta ou descarte. Isso não autoriza reenviar automaticamente um pedido. Leia os controles e preserve o rascunho até entender o resultado.',
        ],
      },
      {
        title: 'Remoção e visibilidade',
        paragraphs: [
          'Remover uma ficha e alterar sua visibilidade são ações diferentes. Em uma seleção de várias fichas, confira os membros e a confirmação. A remoção pode afetar referências; ela não deve ser usada como forma de corrigir um erro de salvamento.',
        ],
      },
    ],
    related: ['compendio', 'pedido-sem-resposta', 'privacidade'],
  },
  {
    id: 'lore-aventura',
    topic: 'lore',
    title: 'Lore próprio de aventuras',
    summary: 'Mantenha fichas do material e entenda sua utilização nas campanhas.',
    sections: [
      {
        title: 'Informações locais do material',
        paragraphs: [
          'A aventura tem lore próprio para personagens, locais e conceitos específicos. Esse conteúdo não precisa virar ficha global do universo. Menções e referências usam a origem da ficha, não apenas seu nome.',
        ],
      },
      {
        title: 'Na mesa',
        paragraphs: [
          'Ao preparar uma base para a campanha, o material referenciado é capturado com procedência. Adaptações posteriores da mesa devem ser tratadas na campanha, por variantes ou notas, conforme o tipo de alteração.',
        ],
      },
    ],
    related: ['lore-global-local', 'base-congelada', 'mencoes'],
  },
  {
    id: 'mencoes',
    topic: 'lore',
    title: 'Menções no texto e referências explícitas',
    summary:
      'Consulte termos da história e diferencie detecção textual de vínculo de planejamento.',
    sections: [
      {
        title: 'Consultar enquanto escreve',
        paragraphs: [
          'O editor pode identificar termos e oferecer consulta às fichas autorizadas. Use a lateral ou os controles de menção para conferir a origem. Nomes iguais em fontes diferentes não significam que as fichas sejam intercambiáveis.',
        ],
      },
      {
        title: 'Vínculos de planejamento',
        paragraphs: [
          'Para associar uma entidade a uma cena ou uma cena a uma sessão, use o controle explícito de referência. Escrever o nome no corpo não cria automaticamente todas essas relações. O vínculo por identidade ajuda a preservar a referência quando o título muda.',
        ],
      },
      {
        title: 'Na leitura pública',
        paragraphs: [
          'Uma publicação pode apresentar explicações de lore autorizadas para o leitor. O Compêndio privado completo não deve ser presumido público só porque o termo aparece no manuscrito.',
        ],
      },
    ],
    related: ['compendio', 'planejar-cenas', 'publicar'],
  },
  {
    id: 'importar-lore',
    topic: 'lore',
    title: 'Importar documentos para o lore de um universo',
    summary: 'Prepare fontes, analise e revise fichas antes de incorporá-las ao mundo.',
    sections: [
      {
        title: 'Não é a importação de capítulos',
        paragraphs: [
          'Este caminho transforma fontes em propostas de fichas do universo. Importar um manuscrito tem outra finalidade: organizar texto em capítulos. Escolha a entrada de importação dentro do universo para trabalhar seu lore.',
        ],
      },
      {
        title: 'Revisão necessária',
        steps: [
          'Selecione as fontes aceitas pela interface.',
          'Confira a preparação do texto e os avisos de extração; um PDF pode precisar de ajustes.',
          'Solicite a análise disponível e revise fichas, nomes, campos e relações propostas.',
          'Confirme somente o conteúdo que deseja incorporar. Consulte a operação original se o pedido ficar sem resposta.',
        ],
      },
      {
        title: 'Limites da análise',
        paragraphs: [
          'A preparação organiza conteúdo localmente antes de enviá-lo à análise. Isso não garante que a interpretação da IA esteja correta. Verifique fatos e relações no documento de origem.',
        ],
      },
    ],
    related: ['universos', 'importar-documento', 'creditos'],
  },
  {
    id: 'assistente-pagina',
    topic: 'ai',
    title: 'Usar o assistente flutuante da página',
    summary: 'Peça orientação e revise propostas de ações sem perder seu lugar no Writer.',
    sections: [
      {
        title: 'Uma conversa que acompanha a navegação',
        paragraphs: [
          'Abra a barra Assistente na parte inferior. Ela pode ser minimizada, expandida e reposicionada. Ao navegar, o contexto acompanha a página; o assistente oferece as capacidades autorizadas daquele lugar. Perguntar não executa automaticamente uma proposta de ação.',
        ],
      },
      {
        title: 'Controle de ações',
        paragraphs: [
          'Leia a proposta e sua confirmação antes de aceitar. O assistente usa os controles existentes da página. Uma conversa sobre o projeto não substitui o chat específico do capítulo ou da cena para editar prosa.',
        ],
      },
      {
        title: 'Movimento e duração',
        paragraphs: [
          'Use a alça para reposicionar; pelo teclado, setas movem e Shift amplia o passo. Escape cancela o movimento ou recolhe a conversa. A conversa e o rascunho acompanham a navegação da sessão, mas recarregar ou sair da conta encerra esse conteúdo em memória. Não use o chat flutuante como arquivo permanente de texto.',
        ],
      },
    ],
    related: ['chat-texto', 'contexto-ia', 'pedido-sem-resposta'],
  },
  {
    id: 'chat-texto',
    topic: 'ai',
    title: 'Conversar sobre um capítulo, cena ou bloco',
    summary: 'Peça sugestões no contexto do texto e aplique apenas o que você revisar.',
    sections: [
      {
        title: 'Chat do texto e assistente da página',
        paragraphs: [
          'O chat específico da unidade trabalha com o capítulo, cena ou bloco capturado. Use-o para discutir e sugerir alterações de escrita. O assistente flutuante serve à orientação e às ações da página; os dois têm contextos e formas de preservação diferentes.',
        ],
      },
      {
        title: 'Da conversa à alteração',
        steps: [
          'Abra o chat da unidade desejada e confira seu contexto.',
          'Faça o pedido com clareza e leia a sugestão.',
          'Confira o texto atual e a seleção ou alvo antes de aplicar.',
          'Revise o custo e confirme o aceite quando oferecido. Aguarde a confirmação da aplicação antes de repetir.',
        ],
      },
      {
        title: 'Histórico e acesso',
        paragraphs: [
          'As conversas são privadas. Se uma fonte de lore perder autorização, respostas dependentes podem ser ocultadas; suas perguntas próprias permanecem. Um texto já aplicado não deve ser confundido com a disponibilidade posterior da fonte.',
        ],
      },
    ],
    related: ['contexto-ia', 'creditos', 'personas'],
  },
  {
    id: 'contexto-ia',
    topic: 'ai',
    title: 'Que informações a IA usa?',
    summary: 'Entenda contexto autorizado, fontes, alvo e limites das respostas.',
    sections: [
      {
        title: 'Contexto depende da ação',
        paragraphs: [
          'A IA não lê indiscriminadamente tudo que existe na conta. Cada fluxo monta seu contexto autorizado: a página, o alvo de texto, referências de lore e persona, conforme a capacidade. Quando a interface oferece inspeção de contexto, confira as fontes antes de enviar.',
        ],
      },
      {
        title: 'Pedido bem definido',
        bullets: [
          'Diga o resultado desejado: revisar ritmo, sugerir alternativas, resumir ou planejar.',
          'Confira o alvo e as fontes selecionadas; outra conversa ou projeto não entra automaticamente no pedido atual.',
          'Diferencie fatos do seu mundo e sugestões criativas. Revise a resposta antes de aceitar.',
          'Se a origem mudar ou ficar indisponível, consulte a situação antes de reutilizar uma resposta antiga.',
        ],
      },
      {
        title: 'Provedor e modelo',
        paragraphs: [
          'A configuração efetiva acompanha o pedido. Trocar preferências depois não transforma um pedido já enviado em uma geração feita por outro modelo. Uma resposta pode conter erros mesmo com contexto correto.',
        ],
      },
    ],
    related: ['configurar-ia', 'personas', 'lore-global-local'],
  },
  {
    id: 'personas',
    topic: 'ai',
    title: 'O que é uma persona de IA?',
    summary: 'Um perfil de orientação para o assistente, diferente de uma personagem do lore.',
    sections: [
      {
        title: 'Voz e orientação',
        paragraphs: [
          'Uma persona reúne orientações para a assistência, como estilo, abordagem e critérios de resposta. Ela não é automaticamente uma personagem da história. A ficha de uma personagem pertence ao lore; a persona orienta como a IA ajuda você.',
        ],
      },
      {
        title: 'Escolher e ajustar',
        paragraphs: [
          'Use o gerenciador ou seletor de personas oferecido pelo projeto ou pela criação. Você pode reutilizar um perfil da biblioteca e, nos contextos que oferecem esse recurso, definir ajustes locais. Confira qual perfil está ativo antes da geração.',
        ],
      },
      {
        title: 'Criar, personalizar e arquivar',
        steps: [
          'Em Inteligência artificial, abra Personas. Selecione um perfil para consultar suas orientações ou criar uma cópia de um padrão.',
          'Defina nome, descrição e instruções. Ajuste os atributos de 0 a 100, como concisão, tensão e ritmo narrativo; os extremos indicam direções diferentes, não qualidade maior ou menor.',
          'Se necessário, acrescente atributos próprios com nome e significado dos extremos. Confira o resumo das orientações antes de salvar.',
          'Duplique para criar uma variação independente. Arquive um perfil para retirá-lo das novas seleções sem apagar vínculos existentes; perfis arquivados podem ser consultados e reativados.',
        ],
      },
      {
        title: 'Gerar com contexto',
        paragraphs: [
          'Quando disponível, a geração contextual de persona usa fontes autorizadas e apresenta uma proposta. Revise a definição e a confirmação de aceite. Uma persona não concede acesso a fontes, não garante precisão e não substitui a revisão autoral.',
        ],
      },
    ],
    related: ['contexto-ia', 'criar-projeto', 'creditos'],
    destination: { label: 'Abrir Personas', path: '/settings/ai?tab=personas' },
  },
  {
    id: 'configurar-ia',
    topic: 'ai',
    title: 'Configurar provedor, modelo e raciocínio',
    summary: 'Escolha a configuração disponível e confira a que será usada em cada pedido.',
    keywords: 'BYOK chave API Firebase OpenAI Google Gemini',
    sections: [
      {
        title: 'Onde configurar',
        steps: [
          'Abra Inteligência artificial na navegação.',
          'Confira o provedor e os modelos disponíveis no seu modo de uso.',
          'Escolha o modelo e o nível de raciocínio quando esse ajuste for oferecido.',
          'Use Salvar Preferências para confirmar. Alterar o formulário sem salvar não aplica a escolha.',
          'Volte ao fluxo de criação ou chat e confira a identificação efetiva antes de enviar.',
        ],
      },
      {
        title: 'Chave própria',
        paragraphs: [
          'O modo de chave própria oferece Google Gemini e OpenAI e guarda suas preferências neste navegador, sem sincronização entre dispositivos. Trate a chave como credencial: não a coloque em mensagens, textos do projeto ou arquivos de backup. Restaurar Padrão remove a configuração local, incluindo as chaves dos dois provedores, e retorna ao modo da plataforma.',
        ],
      },
      {
        title: 'Se a geração falhar',
        paragraphs: [
          'Confira configuração, conexão, autorização e avisos de limite. Não assuma que uma falha mudou automaticamente o provedor ou reenviou seu pedido com outro modelo.',
        ],
      },
    ],
    related: ['contexto-ia', 'creditos', 'pedido-sem-resposta'],
    destination: { label: 'Configurar inteligência artificial', path: '/settings/ai' },
  },
  {
    id: 'creditos',
    topic: 'ai',
    title: 'Créditos, geração, prévia e aceite',
    summary: 'Entenda por que pedir uma sugestão e aceitar uma alteração são etapas diferentes.',
    sections: [
      {
        title: 'Leia a confirmação da ação',
        paragraphs: [
          'Alguns fluxos separam geração, revisão e aceite. Na criação assistida e em sugestões de texto, a confirmação informa a operação e seu custo quando houver. Use o valor apresentado para aquela ação; os custos podem variar entre recursos.',
        ],
      },
      {
        title: 'O que conferir',
        bullets: [
          'Qual projeto, texto, ficha ou imagem receberá o resultado.',
          'Se você está apenas vendo uma proposta ou confirmando sua aplicação.',
          'O custo e o saldo indicados antes de confirmar.',
          'Se há um pedido anterior pendente que precisa ser consultado.',
        ],
      },
      {
        title: 'Saldo e limites',
        paragraphs: [
          'O saldo fica na área da conta. Cota de geração e débito de créditos são controles distintos: uma ação sem débito pode estar sujeita a limite de uso. No modo de chave própria, confira também as condições do provedor; não presuma que toda chamada externa seja gratuita.',
        ],
      },
    ],
    related: ['criar-projeto', 'chat-texto', 'imagens'],
  },
  {
    id: 'imagens',
    topic: 'images',
    title: 'Gerenciar a Biblioteca de Imagens',
    summary: 'Reutilize imagens aceitas e entenda os vínculos que impedem uma exclusão.',
    sections: [
      {
        title: 'Uma biblioteca pessoal',
        paragraphs: [
          'Imagens aceitas dos fluxos de geração entram na sua biblioteca. Você pode consultar, renomear, selecionar e, quando permitido, excluir. Reutilizar uma imagem existente não equivale a aceitar uma nova geração.',
        ],
      },
      {
        title: 'Imagem e uso são diferentes',
        paragraphs: [
          'Remover uma capa do projeto ou excluir o projeto não significa apagar a imagem da biblioteca. Enquanto uma imagem estiver vinculada, a exclusão pode ser bloqueada. Retire os usos pelos controles apropriados e aguarde a atualização antes de tentar excluir.',
        ],
      },
      {
        title: 'Se a exclusão ficar pendente',
        paragraphs: [
          'Leia o estado da biblioteca e use a retomada oferecida. Não substitua o arquivo nem suponha que a imagem foi apagada porque a primeira tentativa demorou. A biblioteca não é um editor de imagem nem oferece upload manual nessa experiência.',
        ],
      },
    ],
    related: ['capas', 'ilustracoes', 'privacidade'],
    destination: { label: 'Abrir Biblioteca de Imagens', path: '/library' },
  },
  {
    id: 'capas',
    topic: 'images',
    title: 'Escolher ou gerar a capa de um livro',
    summary: 'Continue sem capa, use uma imagem da biblioteca ou revise uma geração.',
    sections: [
      {
        title: 'A capa é opcional',
        paragraphs: [
          'Na criação e na edição do livro, use o seletor da biblioteca quando quiser uma imagem existente. Nos fluxos que oferecem geração, revise a prévia e a confirmação. A criação manual do texto pode continuar sem gerar capa.',
        ],
      },
      {
        title: 'Confira a seleção',
        bullets: [
          'Capas usam apresentação vertical em proporção 2:3; confira o recorte.',
          'Uma prévia gerada ainda precisa ser selecionada e aceita no fluxo correspondente.',
          'Mudar dados que orientam a geração pode exigir nova revisão da capa.',
          'Escolher Sem capa ou uma imagem existente altera o que será confirmado e o custo aplicável.',
        ],
      },
    ],
    related: ['imagens', 'criar-projeto', 'creditos'],
  },
  {
    id: 'ilustracoes',
    topic: 'images',
    title: 'Usar ilustrações nos blocos de aventura',
    summary: 'Vincule uma imagem ao bloco e confira sua presença na prévia certa.',
    sections: [
      {
        title: 'Uma imagem no contexto do texto',
        paragraphs: [
          'No bloco da aventura, use o seletor da Biblioteca de Imagens. Confira a imagem, o texto alternativo e a legenda quando esses campos estiverem disponíveis. A ilustração acompanha o uso naquele bloco; não vira uma cópia pública da biblioteca inteira.',
        ],
      },
      {
        title: 'Ao duplicar ou remover',
        paragraphs: [
          'Duplicar e excluir blocos precisa preservar os vínculos das imagens. Remover o bloco não significa excluir a imagem pessoal. Confira as prévias por audiência para verificar onde a ilustração aparece.',
        ],
      },
    ],
    related: ['imagens', 'blocos-audiencias', 'previas-aventura'],
  },
  {
    id: 'importar-documento',
    topic: 'files',
    title: 'Importar um manuscrito existente',
    summary: 'Traga DOCX, PDF com texto, Markdown, TXT ou HTML e revise os capítulos.',
    sections: [
      {
        title: 'Escolha a entrada certa',
        paragraphs: [
          'Use Importar e restaurar no Estúdio para começar um projeto por documento. Nos detalhes de um livro, a ação de importar documento permite acrescentar capítulos. A importação de manuscrito é diferente da restauração de backup nativo e da análise de lore.',
        ],
      },
      {
        title: 'Revise antes de confirmar',
        steps: [
          'Selecione um formato aceito: DOCX, PDF com texto, Markdown, texto simples ou HTML.',
          'Confira a extração e a divisão proposta de capítulos ou seções.',
          'Ajuste títulos, conteúdo e inclusões. Verifique avisos e compare com o original, especialmente em PDFs com colunas ou sumários.',
          'Confirme apenas depois de conferir o destino e a estrutura.',
        ],
      },
      {
        title: 'A aparência pode mudar',
        paragraphs: [
          'O Writer preserva prosa e formatação compatível com o editor; não reproduz a diagramação exata de um PDF. Um PDF sem camada de texto pode não produzir uma extração útil. Não presuma reconhecimento de texto de imagens ou recuperação de todo o layout.',
        ],
      },
    ],
    related: ['importar-aventura', 'restaurar-backup', 'importar-lore'],
    destination: { label: 'Importar e restaurar', path: '/studio/import' },
  },
  {
    id: 'importar-aventura',
    topic: 'files',
    title: 'Importar um documento como nova aventura',
    summary: 'Revise seções e preserve a preparação até a criação integral do projeto.',
    sections: [
      {
        title: 'Um projeto de aventura, não um livro disfarçado',
        steps: [
          'No Estúdio, abra Importar e restaurar e escolha a entrada para Nova aventura.',
          'Selecione o documento e revise a extração, as seções e os títulos.',
          'Confirme a revisão quando estiver correta e acompanhe a preparação.',
          'A aventura só fica disponível após a ativação integral. Consulte Em andamento se precisar retomar.',
        ],
      },
      {
        title: 'Retomada no dispositivo',
        paragraphs: [
          'A revisão confirmada pode ter uma cópia protegida para retomar no mesmo dispositivo. O PDF original não é guardado por esse mecanismo. Não limpe os dados do navegador enquanto depender dessa preparação; mantenha também o arquivo de origem.',
        ],
      },
    ],
    related: ['estrutura-aventura', 'operacoes', 'dados-locais'],
    destination: { label: 'Abrir importações', path: '/studio/import' },
  },
  {
    id: 'backup',
    topic: 'files',
    title: 'Backup nativo, histórico e exportação: qual a diferença?',
    summary: 'Escolha o arquivo certo para preservar o projeto ou entregar uma cópia de leitura.',
    sections: [
      {
        title: 'Três finalidades diferentes',
        bullets: [
          'Histórico guarda versões de texto dentro do projeto, capturadas por ações próprias.',
          'Backup nativo .writer preserva os recursos previstos pelo formato e pelo tipo de projeto, para uma restauração revisada. Consulte a cobertura mostrada no fluxo.',
          'Exportação gera uma cópia de leitura do manuscrito, como PDF, DOCX ou Markdown. Não substitui o backup de recursos privados.',
        ],
      },
      {
        title: 'Preservar uma cópia',
        steps: [
          'No projeto compatível, abra o menu de opções e escolha o backup nativo disponível.',
          'Confira avisos e o escopo do arquivo. Resolva operações pendentes quando solicitado.',
          'Aguarde a conclusão e guarde o arquivo em um local seguro.',
          'Mantenha mais de uma cópia importante; não trate uma transferência incompleta como backup concluído.',
        ],
      },
      {
        title: 'Formatos anteriores',
        paragraphs: [
          'Backups JSON antigos têm coberturas diferentes. A restauração mostra ausências e procedência quando necessário; um formato anterior não ganha automaticamente histórico, datas ou recursos que não guardava. As opções podem variar por tipo de projeto.',
        ],
      },
    ],
    related: ['restaurar-backup', 'exportar', 'historico'],
  },
  {
    id: 'restaurar-backup',
    topic: 'files',
    title: 'Restaurar um backup em nova cópia',
    summary: 'Escolha o formato e o tipo compatíveis, revise e acompanhe a preparação.',
    sections: [
      {
        title: 'Restauração é um processo',
        steps: [
          'Abra Importar e restaurar e escolha a restauração correspondente ao tipo de projeto.',
          'Selecione o arquivo aceito e aguarde as verificações.',
          'Leia a revisão, inclusive recursos ausentes, fontes indisponíveis e limites do formato.',
          'Confirme a preparação e a finalização quando oferecidas. A nova cópia só fica pronta após a conclusão do processo.',
        ],
      },
      {
        title: 'Integridade não basta',
        paragraphs: [
          'Um arquivo íntegro ainda precisa de validação do conteúdo e da autorização das origens. Um vínculo que existia no backup não concede acesso atual a um universo, ficha ou imagem. Não presuma que todo conteúdo externo será restabelecido.',
        ],
      },
      {
        title: 'Pausa e retomada',
        paragraphs: [
          'Use Em andamento e preserve os dados locais necessários à operação. Confira se a tentativa já terminou antes de criar outra cópia. Restaurar um backup não é o mesmo que restaurar uma versão de texto no projeto existente.',
        ],
      },
    ],
    related: ['backup', 'operacoes', 'dados-locais'],
    destination: { label: 'Abrir restaurações', path: '/studio/import' },
  },
  {
    id: 'pedido-sem-resposta',
    topic: 'files',
    title: 'Um pedido ficou sem resposta. Devo tentar de novo?',
    summary: 'Consulte a tentativa original e preserve rascunhos antes de reenviar ou descartar.',
    keywords: 'erro falha rede conexão offline pendente incerto conflito recuperação salvar',
    sections: [
      {
        title: 'Primeiro, descubra o resultado',
        paragraphs: [
          'Uma interrupção pode acontecer depois de o servidor receber a ação. Por isso, “não recebi confirmação” e “não aconteceu” são situações diferentes. Repetir a operação pode não ser a forma correta de recuperar.',
        ],
      },
      {
        title: 'O que fazer',
        steps: [
          'Mantenha a tela e o rascunho sempre que possível. Leia a mensagem de pendência.',
          'Use Consultar, Verificar ou o controle de recuperação oferecido para a tentativa original.',
          'Para operações longas, procure o item em Em andamento.',
          'Somente use um reenvio quando a interface o oferecer explicitamente e você tiver conferido o pedido.',
          'Ao descartar ou cancelar, aguarde a confirmação do encerramento. Uma consulta histórica não garante que o estado atual seja idêntico.',
        ],
      },
      {
        title: 'Conflito não é perda automática',
        paragraphs: [
          'Um conflito indica que a origem ou a revisão mudou. Preserve seu texto antes de escolher entre revisar, descartar ou refazer. Não atualize a página por reflexo quando houver rascunho apenas em memória.',
        ],
      },
    ],
    related: ['operacoes', 'dados-locais', 'editor'],
  },
  {
    id: 'dados-locais',
    topic: 'files',
    title: 'O que fica no navegador e o que fica na conta?',
    summary: 'Saiba por que uma retomada no dispositivo não substitui um backup.',
    sections: [
      {
        title: 'Dados com papéis diferentes',
        bullets: [
          'Projetos e conteúdos confirmados são mantidos pelos serviços da plataforma, conforme o fluxo.',
          'Algumas preferências de apresentação, como posição do assistente e largura, podem ser locais e isoladas por conta.',
          'Algumas preparações e rascunhos usam recuperação protegida no dispositivo; isso não garante recuperação em outro navegador.',
          'A conversa do assistente flutuante permanece em memória durante a sessão e termina ao recarregar ou sair.',
        ],
      },
      {
        title: 'Antes de limpar dados ou trocar de computador',
        paragraphs: [
          'Confirme os salvamentos, resolva ou encerre preparações pendentes e faça os backups disponíveis dos projetos importantes. Limpar armazenamento, usar outro perfil do navegador ou perder o dispositivo pode retirar os controles locais de recuperação. O Writer não deve ser tratado como editor totalmente offline.',
        ],
      },
    ],
    related: ['backup', 'pedido-sem-resposta', 'assistente-pagina'],
  },
  {
    id: 'excluir-projeto',
    topic: 'files',
    title: 'Excluir um projeto com cuidado',
    summary: 'Diferencie exclusão de arquivamento e acompanhe o encerramento da operação.',
    sections: [
      {
        title: 'Antes de confirmar',
        steps: [
          'Confira se deseja excluir o projeto inteiro ou apenas arquivar uma cena, retirar uma referência ou remover um item.',
          'Faça um backup compatível se quiser preservar uma cópia.',
          'No menu de opções, leia o projeto e os efeitos informados pelo diálogo.',
          'Confirme somente o alvo correto e acompanhe a exclusão até o encerramento.',
        ],
      },
      {
        title: 'Uma exclusão pode ter etapas',
        paragraphs: [
          'O acesso pode ser fechado antes de terminar toda a limpeza. Use Em andamento para consultar ou continuar a operação oferecida. A ausência do projeto na listagem não é, por si só, prova de que todas as etapas terminaram.',
        ],
      },
      {
        title: 'Recursos independentes',
        paragraphs: [
          'Outros projetos e cópias independentes da biblioteca não devem ser confundidos com os recursos próprios do projeto excluído. Se houver uma falha, consulte a operação em vez de executar uma limpeza manual por conta própria.',
        ],
      },
    ],
    related: ['backup', 'operacoes', 'imagens'],
  },
  {
    id: 'exportar',
    topic: 'sharing',
    title: 'Exportar o manuscrito para leitura',
    summary: 'Gere PDF, DOCX ou Markdown e confira a composição do texto entregue.',
    sections: [
      {
        title: 'Escolha o formato pela finalidade',
        bullets: [
          'PDF: cópia de leitura com apresentação fixa.',
          'DOCX: documento para abrir em um processador de texto e continuar uma revisão.',
          'Markdown: texto com marcações simples, útil para portabilidade e outros fluxos de escrita.',
        ],
      },
      {
        title: 'Antes de gerar o arquivo',
        steps: [
          'Abra o livro e localize a ação de exportação no menu de opções.',
          'Confira a composição ativa dos capítulos, principalmente quando trabalhar em modo cenas.',
          'Escolha o formato e aguarde o arquivo.',
          'Abra o resultado e confira títulos, ordem, caracteres e formatação antes de enviar a outra pessoa.',
        ],
      },
      {
        title: 'Escopo',
        paragraphs: [
          'Exportar o manuscrito não preserva automaticamente sessões, planos privados, todo o lore ou o histórico. Para preservar o projeto, use o backup compatível. O Writer não substitui uma ferramenta de diagramação profissional de impressão.',
        ],
      },
    ],
    related: ['backup', 'estrutura-livro', 'publicar'],
  },
  {
    id: 'publicar',
    topic: 'sharing',
    title: 'Publicação de livro, leitura pública e prévia privada',
    summary: 'Entenda quando um conteúdo pode chegar a leitores e o que continua privado.',
    sections: [
      {
        title: 'Cada ação tem um alcance',
        bullets: [
          'Escrever e salvar mantém o trabalho no contexto privado do projeto.',
          'O estado editorial acompanha sua preparação e não equivale a publicar.',
          'A publicação de livro, quando oferecida no projeto, prepara uma versão para leitura pública.',
          'Uma prévia autenticada de aventura continua privada, mesmo no recorte Jogadores.',
        ],
      },
      {
        title: 'Confira antes de compartilhar',
        paragraphs: [
          'Revise a composição publicada e o lore autorizado para leitores. O leitor interativo pode exibir explicações dos termos previstos para publicação; isso não torna o Compêndio privado inteiro acessível. Use o link de leitura pública do livro, quando disponível, e confira o conteúdo como leitor.',
        ],
      },
      {
        title: 'O espaço Publicações',
        paragraphs: [
          'O espaço geral Publicações da navegação ainda está marcado como Em breve. Isso é diferente dos controles de publicação já existentes no livro. Catálogo e Biblioteca do ecossistema também não devem ser tratados como distribuição ou compra disponíveis.',
        ],
      },
    ],
    related: ['privacidade', 'disponibilidade', 'exportar'],
  },
  {
    id: 'privacidade',
    topic: 'sharing',
    title: 'Privacidade, audiência e origem indisponível',
    summary: 'Separe o acesso ao projeto, os recortes de conteúdo e a autorização de suas fontes.',
    sections: [
      {
        title: 'Privado é o ponto de partida',
        paragraphs: [
          'Projetos, notas, sessões, histórico e conversas de trabalho têm controles próprios de acesso. Vincular um universo, selecionar uma audiência ou preparar uma base não cria um convite público. Compartilhe somente por um fluxo que ofereça isso explicitamente.',
        ],
      },
      {
        title: 'Conteúdo derivado continua ligado à origem',
        paragraphs: [
          'Bases, variantes, referências e respostas de IA podem depender de fontes autorizadas. Se a origem for removida ou perder acesso, esses conteúdos podem ficar indisponíveis. Uma cópia histórica ou um nome igual não substitui autorização atual. Suas notas e perguntas próprias têm tratamento separado.',
        ],
      },
      {
        title: 'Imagens e arquivos',
        paragraphs: [
          'A biblioteca pessoal e uma prévia de mídia têm proteções diferentes de um link permanente já obtido. Não trate uma URL de imagem como segredo garantido nem compartilhe credenciais. Guarde backups em um local de confiança.',
        ],
      },
    ],
    related: ['publicar', 'previas-aventura', 'contexto-ia'],
  },
  {
    id: 'disponibilidade',
    topic: 'sharing',
    title: 'O que significa Em breve?',
    summary: 'Identifique os espaços futuros e os limites atuais da plataforma.',
    sections: [
      {
        title: 'Espaços ainda anunciados',
        paragraphs: [
          'Publicações, Catálogo e Biblioteca na navegação geral mostram disponibilidade futura. Não representam um marketplace em operação, compra de aventuras ou distribuição aberta. A Biblioteca de Imagens é uma ferramenta pessoal já distinta desses espaços.',
        ],
      },
      {
        title: 'O que o Writer não promete nesta experiência',
        bullets: [
          'Edição colaborativa simultânea com cursores de várias pessoas.',
          'Mesa virtual com combate automatizado.',
          'Geração desassistida de um livro inteiro pronto.',
          'Diagramação profissional de pré-impressão.',
          'Suporte inicial completo para celular ou tablet; a experiência é priorizada para desktop e laptop.',
        ],
      },
      {
        title: 'Consulte o controle disponível',
        paragraphs: [
          'Recursos dependem do tipo de projeto e do estado da operação. Uma opção ausente não deve ser substituída por um caminho improvisado. Esta ajuda descreve os fluxos da aplicação; não anuncia implantação de recursos futuros.',
        ],
      },
    ],
    related: ['navegacao', 'publicar', 'imagens'],
  },
  {
    id: 'preferencias',
    topic: 'preferences',
    title: 'Ajustar tema, fonte e área de trabalho',
    summary: 'Prepare um ambiente de leitura e escrita confortável sem alterar seu conteúdo.',
    sections: [
      {
        title: 'Apresentação',
        bullets: [
          'Tema: alterne entre Claro, Escuro e Sépia pelos controles da conta; os temas personalizados têm seu próprio fluxo de prévia e salvamento.',
          'Tipografia literária: em Preferências, escolha a apresentação do texto de leitura e escrita.',
          'Área de trabalho: ajuste a largura do conteúdo; o editor mantém uma coluna de prosa voltada à leitura confortável.',
          'Data e horário: confira o fuso usado na apresentação das datas.',
        ],
      },
      {
        title: 'Criar e comparar um tema personalizado',
        steps: [
          'No seletor de tema, abra Temas personalizados e escolha Criar novo. É necessário entrar na conta para guardar temas privados.',
          'Defina o nome, a base clara ou escura e a cor de destaque. Experimente as sugestões e ajuste a intensidade e a matiz do fundo.',
          'Use Comparar com o tema anterior para conferir a leitura. O modo avançado permite ajustar cores individualmente; corrija avisos de contraste antes de salvar.',
          'Salve para confirmar ou cancele para descartar a prévia. Recolher ou navegar preserva o rascunho durante a sessão; recarregar não recupera um tema ainda não salvo.',
        ],
        paragraphs: [
          'A biblioteca de temas acompanha a conta, mas a seleção ativa pertence ao dispositivo. Remover um tema ativo retorna à sua base após a confirmação.',
        ],
      },
      {
        title: 'Prévia e persistência',
        paragraphs: [
          'Experimente as opções e use Salvar ou Cancelar quando o painel oferecer esses controles. Uma prévia de tema não equivale a uma preferência confirmada. Algumas escolhas ficam neste navegador, por conta, e podem não aparecer em outro dispositivo.',
        ],
      },
      {
        title: 'Acesso inicial',
        paragraphs: [
          'Prefira desktop ou laptop nesta fase. Recolha a lateral e use a expansão do editor para trabalhar com mais espaço. O conteúdo do manuscrito não deve mudar porque você alterou tema ou largura.',
        ],
      },
    ],
    related: ['perfil-e-guia', 'editor', 'dados-locais'],
    destination: { label: 'Abrir Preferências', path: '/settings/preferences' },
  },
  {
    id: 'duvidas-frequentes',
    topic: 'preferences',
    title: 'Não encontro um recurso ou meu conteúdo',
    summary: 'Um roteiro para filtros, conta, salvamento, acesso e operações pendentes.',
    sections: [
      {
        title: 'Confira o contexto',
        steps: [
          'Verifique a conta atual e o tipo de projeto aberto.',
          'Em Projetos, confira filtros de tipo. Na navegação, abra Todas as ferramentas se o destino estiver recolhido.',
          'Procure no arquivo quando a cena tiver sido arquivada.',
          'Se estava importando, restaurando ou excluindo, consulte Em andamento.',
          'Se a mensagem fala em origem indisponível ou revisão alterada, siga a consulta ou recuperação oferecida; não recrie a origem apenas pelo nome.',
        ],
      },
      {
        title: 'Se o problema for o salvamento',
        paragraphs: [
          'Preserve seu rascunho e leia o estado indicado. Verifique a conexão e consulte o resultado da tentativa original antes de repetir. Só recarregue depois de conferir o que está salvo e o que depende da memória da página.',
        ],
      },
      {
        title: 'Se o recurso ainda não existe',
        paragraphs: [
          'Os espaços marcados Em breve têm outro estágio de disponibilidade. Use a busca desta ajuda por uma tarefa, como “restaurar”, “persona” ou “jogadores”, para encontrar o caminho e os limites correspondentes.',
        ],
      },
    ],
    related: ['pedido-sem-resposta', 'operacoes', 'disponibilidade'],
  },
  {
    id: 'sugestoes-editor',
    topic: 'ai',
    title: 'Autocomplete e ações de escrita com IA',
    summary: 'Diferencie uma continuação sugerida de uma alteração já aplicada ao texto.',
    keywords: 'preditivo completar reescrever revisar estilo coerência comandos',
    sections: [
      {
        title: 'Sugestões durante a escrita',
        paragraphs: [
          'Nos editores que oferecem autocomplete, uma pausa depois de digitar pode iniciar uma sugestão. Apenas dar foco ou mover o cursor não deve gerar uma continuação. Confira o trecho proposto e os controles de aceitar ou dispensar; uma sugestão ainda não integra o manuscrito.',
        ],
      },
      {
        title: 'Pedidos explícitos',
        paragraphs: [
          'Use as ações de escrita ou o chat para pedir continuação, reescrita, revisão, estilo, coerência ou resumo. No chat do capítulo, digitar / abre a busca de comandos. Escolher um comando prepara o pedido; o envio continua sendo uma ação sua. Enter envia e Shift+Enter quebra a linha.',
        ],
      },
      {
        title: 'Antes de aplicar',
        paragraphs: [
          'Confira a seleção e o texto atual, leia a sugestão e revise a confirmação e o custo quando aplicável. Trocar de seleção ou contexto pode invalidar uma sugestão. Uma revisão de coerência é apoio à leitura crítica, não uma garantia de ausência de contradições.',
        ],
      },
    ],
    related: ['chat-texto', 'creditos', 'contexto-ia'],
  },
  {
    id: 'analisar-lore',
    topic: 'lore',
    title: 'Atualizar o Compêndio com base no texto',
    summary: 'Analise um capítulo e revise as propostas de fichas antes de aplicar o lote.',
    keywords: 'análise extrair entidades evidência personagens texto',
    sections: [
      {
        title: 'Encontrar fatos no manuscrito',
        paragraphs: [
          'No editor, abra Compêndio e a ação Atualizar compêndio com base no texto. O fluxo analisa o capítulo atual, inclusive a edição capturada ainda não salva. O resultado apresenta entidades novas e conhecidas, evidências do trecho e comparação dos campos.',
        ],
      },
      {
        title: 'Revise o lote',
        steps: [
          'Confira as evidências na prosa e os campos propostos.',
          'Resolva coincidências entre fichas escolhendo explicitamente a entidade correta.',
          'Edite ou retire propostas que não deseja aplicar.',
          'Confira o destino: livro ou universo vinculado, quando oferecido. Uma alteração global pode afetar outros projetos.',
          'Revise o custo informado e confirme a aplicação. Consulte a tentativa original se faltar a resposta.',
        ],
      },
      {
        title: 'Não é uma sincronização automática',
        paragraphs: [
          'Uma análise não aplica todas as sugestões sozinha. O lote não deve ser usado para alterar visibilidade ou substituir relações e notas privadas indiscriminadamente. Confirme os fatos antes de incorporá-los ao mundo.',
        ],
      },
    ],
    related: ['compendio', 'lore-global-local', 'pedido-sem-resposta'],
  },
  {
    id: 'minimapa',
    topic: 'books',
    title: 'Navegar pelo minimapa do capítulo',
    summary: 'Localize trechos e ocorrências de lore sem alterar a seleção de escrita.',
    sections: [
      {
        title: 'Uma visão do texto',
        paragraphs: [
          'O minimapa à esquerda do manuscrito representa parágrafos, títulos e ocorrências de entidades. O retângulo indica a região visível. As marcas ajudam a localizar personagens, lugares e conceitos reconhecidos no texto.',
        ],
      },
      {
        title: 'Como navegar',
        bullets: [
          'Clique no mapa para rolar até a região correspondente.',
          'Clique junto de uma marca para ir ao bloco ou à ocorrência; isso não abre a ficha do Compêndio.',
          'Pelo teclado, dê foco ao mapa com Tab. Use setas ou Home e End para escolher e Enter ou Espaço para confirmar.',
        ],
      },
      {
        title: 'O texto permanece intacto',
        paragraphs: [
          'Navegar pelo mapa muda a rolagem, sem mover o cursor de escrita, criar uma edição ou gerar IA. Um capítulo vazio não oferece destinos; sugestões ainda não aceitas também não fazem parte do mapa.',
        ],
      },
    ],
    related: ['editor', 'mencoes'],
  },
];

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function findHelpArticles(query: string, topic?: string): HelpArticle[] {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return helpArticles.filter((article) => {
    if (topic && article.topic !== topic) return false;
    const text = normalizeSearch(
      [
        article.title,
        article.summary,
        article.keywords,
        article.note,
        helpTopics.find((item) => item.id === article.topic)?.title,
        ...article.sections.flatMap((section) => [
          section.title,
          ...(section.paragraphs ?? []),
          ...(section.steps ?? []),
          ...(section.bullets ?? []),
        ]),
      ].join(' '),
    );
    return terms.every((term) => text.includes(term));
  });
}
