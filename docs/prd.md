# PRD — Writer Assistant

**Status:** Aprovado
**Última atualização:** 2026-08-19

## 1. Visão do produto

### Problema

Escritores de livros de ficção frequentemente perdem a consistência de seus universos narrativos (_worldbuilding_ e _lore_) — como detalhes de personagens, nomes de locais, regras de magia e conceitos — ao longo de dezenas de capítulos. Hoje, os autores precisam alternar manualmente entre editores de texto e blocos de notas separados, o que quebra o ritmo de escrita, gera inconsistências na trama e dificulta a revisão. Além disso, faltam assistentes de escrita que compreendam o contexto desse universo para sugerir continuações coerentes e ferramentas que permitam compartilhar a história com leitores em um formato interativo que valorize esse universo.

### Proposta de valor

O **Writer Assistant** é uma plataforma de escrita que conecta um editor de texto rico a um compêndio de _lore_ inteligente: qualquer personagem, local ou conceito cadastrado é reconhecido no texto em tempo real, exibindo resumos em balões ao passar o mouse e abrindo fichas detalhadas em uma barra lateral. A plataforma conta com auxílio de inteligência artificial contextualizada no universo da obra (com autocomplete e ações de melhoria de texto baseados em créditos) e permite tanto exportar o manuscrito em múltiplos formatos (PDF, DOCX, Markdown) quanto publicá-lo em uma página de leitura interativa para os leitores.

### Objetivo da primeira versão

Entregar uma aplicação web onde o autor consiga se cadastrar, criar livros com múltiplos capítulos, cadastrar entidades de lore com detecção automática no editor WYSIWYG, utilizar sugestões de IA alimentadas por créditos e publicar a obra em formato de leitor público com fichas informativas ativas.

## 2. Usuários

### Usuário principal

**Escritor de ficção**: autor independente ou profissional que escreve contos, novelas ou romances e precisa de controle sobre personagens, cronologia, locais e auxílio criativo para manter a consistência e o fluxo de produção.

### Usuários secundários

- **Leitor beta ou público**: pessoa que acessa o link público da obra compartilhada pelo autor e lê os capítulos com navegação facilitada e balões de informação do universo da história.

### Usuários não atendidos nesta versão

- Co-autores trabalhando no mesmo parágrafo em tempo real simultaneamente (edição multiusuário estilo Google Docs).
- Ilustradores ou diagramadores profissionais que exigem controle tipográfico de pré-impressão gráfica (InDesign).

## 3. Jornada principal

1. **Acesso e Início**: O autor acessa a aplicação, faz login com sua conta (Google ou e-mail) e visualiza seu painel de livros com o saldo de créditos de IA disponível.
2. **Criação da Obra**: O autor clica em "Novo Livro", define título, sinopse e cria os primeiros capítulos.
3. **Construção do Lore**: Na aba de compêndio, o autor cadastra as principais entidades da história (ex.: Personagem "Elena", com apelido "Leni", ocupação "Alquimista", resumo curto e relações).
4. **Escrita Enriquecida**: No editor de texto, ao escrever "Elena caminhou até o laboratório", a palavra "Elena" é automaticamente sublinhada; ao passar o mouse, um balão exibe seu resumo; ao clicar, a barra lateral abre sua ficha completa para consulta ou ajuste rápido.
5. **Auxílio Criativo por IA**: Ao pausar a digitação, a IA sugere a continuação da cena em texto translúcido respeitando o contexto dos personagens; o autor aceita a sugestão com `Tab`, consumindo 1 crédito do seu saldo.
6. **Exportação e Compartilhamento**: O autor gera um arquivo DOCX/PDF para revisão local e marca a obra como "Publicada", gerando um link público (`/read/:bookId`) para que seus leitores possam ler a história online com os balões de lore interativos.

## 4. Escopo da primeira versão

| Capacidade                                   | Benefício para o usuário                                                                                            | Limites                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Autenticação e Perfil**                    | Protege os manuscritos do autor e gerencia seu saldo de créditos e plano (Free/Premium).                            | Suporta login via Firebase Auth (Google e E-mail); gerenciamento de plano com cotas de créditos na V1.                        |
| **Gestão de Livros e Capítulos**             | Organiza obras em capítulos ordenáveis com contagem de palavras e status (Rascunho / Publicado).                    | Foco em estrutura linear de capítulos por livro.                                                                              |
| **Compêndio de Lore (Worldbuilding)**        | Centraliza personagens, locais, conceitos e outros elementos com relações e controle de spoiler.                    | Entidades possuem atributos estruturados e marcação de visibilidade pública.                                                  |
| **Editor WYSIWYG Contextual**                | Escrita rica com reconhecimento automático de entidades de lore, menção `@` e sidebar de edição rápida.             | Destaque discreto e não intrusivo no texto; sidebar retrátil.                                                                 |
| **Assistente de IA Preditivo e sob Demanda** | Acelera a produção com autocomplete em tempo real e ações de aprimoramento de estilo.                               | Opera por consumo de créditos por sugestão aceita (Free: 100 créditos iniciais; Premium: 2.000/mês; fallback com chave BYOK). |
| **Leitor Web Público Interativo**            | Permite que qualquer leitor acesse a obra online sem login, navegando pelos capítulos e consultando o lore público. | Leitura limpa com tipografia otimizada e tooltips interativos nas palavras autorizadas.                                       |
| **Exportação Multiformato**                  | Flexibilidade para baixar o manuscrito para backup, revisão ou envio editorial.                                     | Suporte a download em Markdown, DOCX e PDF (estilizado para impressão).                                                       |

## 5. Requisitos funcionais

### RF-01 — Autenticação e Gestão de Sessão

- **Quem:** Escritor.
- **Interface/gatilho:** Botão "Entrar" na barra superior ou na tela de boas-vindas.
- **Entrada:** Provedor Google ou E-mail e Senha.
- **Comportamento:** O sistema autentica o usuário via Firebase Auth, inicializa ou recupera sua conta no Firestore com seu saldo de créditos e carrega sua biblioteca.
- **Saída:** Redirecionamento para o painel principal exibindo nome, foto e saldo de créditos.
- **Exceções:** Credenciais inválidas exibem mensagem de erro clara do Firebase sem travar a interface.

### RF-02 — Gerenciamento de Livros e Capítulos

- **Quem:** Escritor autenticado.
- **Interface/gatilho:** Painel de livros; botões "Novo Livro", "Novo Capítulo", "Reordenar" e "Configurações do Livro".
- **Entrada:** Título do livro, gênero, sinopse, capa (opcional) e títulos/conteúdo dos capítulos.
- **Comportamento:** Cria e persiste os registros no Firestore associados ao UID do autor; atualiza contadores de palavras por capítulo e totais.
- **Saída:** Livro e capítulos listados na interface com status de salvamento sincronizado.
- **Exceções:** Em caso de perda de conexão, as alterações são salvas no cache local do Firestore e sincronizadas ao restabelecer a rede.

### RF-03 — Cadastro e Gestão do Compêndio de Lore

- **Quem:** Escritor autenticado.
- **Interface/gatilho:** Aba "Compêndio de Lore" no menu do livro ou atalho dentro do editor.
- **Entrada:** Nome principal, apelidos/sinônimos (separados por vírgula), categoria (_Personagem_, _Local_, _Conceito_, _Outro_), resumo curto (até 140 caracteres), ficha detalhada (aparência, personalidade, histórico, notas), relações (vínculo com outra entidade) e interruptor de visibilidade pública.
- **Comportamento:** Salva a entidade vinculada ao livro no Firestore e compila a lista de termos monitorados para o editor de texto.
- **Saída:** Card da entidade no compêndio e atualização imediata do catálogo de termos monitorados.
- **Exceções:** Tentativa de criar entidade com nome vazio exibe aviso de validação no formulário.

### RF-04 — Reconhecimento de Termos e Tooltips no Editor

- **Quem:** Escritor (no editor) e Leitor (na página pública).
- **Interface/gatilho:** Digitação ou carregamento do texto contendo termos cadastrados no lore, ou passagem do cursor (hover) sobre o termo.
- **Entrada:** Conteúdo textual e lista de entidades ativas do livro.
- **Comportamento:** O editor identifica ocorrências exatas e variações cadastradas em apelidos; renderiza um destaque visual sutil sob a palavra; ao passar o mouse, exibe um balão (tooltip) com categoria, nome e resumo curto; ao clicar no editor, abre a sidebar lateral com a ficha completa.
- **Saída:** Balão informativo sobre a palavra e abertura opcional da sidebar lateral.
- **Exceções:** Termos marcados como privados não exibem tooltip no leitor público.

### RF-05 — Menção Rápida de Lore via `@`

- **Quem:** Escritor.
- **Interface/gatilho:** Digitação do caractere `@` seguido de letras no editor.
- **Entrada:** Termo de busca digitado após `@`.
- **Comportamento:** Abre um menu suspenso filtrando as entidades do livro por nome e categoria; ao selecionar uma opção (via clique ou `Enter`), insere o nome da entidade e fecha o menu.
- **Saída:** Nome da entidade inserido no texto já devidamente vinculado ao lore.
- **Exceções:** Se nenhuma entidade corresponder à busca, exibe a opção "Criar nova entidade com este nome".

### RF-06 — Assistência por IA com Consumo de Créditos

- **Quem:** Escritor autenticado.
- **Interface/gatilho:** Pausa na digitação (autocomplete) ou acionamento de ações no menu de IA (_Sugerir continuação_, _Melhorar sensorialidade_, _Revisar consistência com lore_).
- **Entrada:** Contexto dos últimos parágrafos do capítulo + resumo das principais entidades de lore do livro.
- **Comportamento:** Consulta a API de IA; exibe a sugestão em texto translúcido no editor (ou em caixa de diálogo nas ações de menu); se o autor pressionar `Tab` (ou clicar em "Aceitar"), o texto é inserido e 1 crédito é debitado do Firestore.
- **Saída:** Texto incorporado ao manuscrito e saldo de créditos atualizado no topo da tela.
- **Exceções:** Se o saldo de créditos for zero e o usuário não tiver configurado chave BYOK, a sugestão de IA não é solicitada e um alerta convida para recarga de créditos ou inclusão de chave própria.

### RF-07 — Publicação Online e Leitor Público Interativo

- **Quem:** Escritor (para publicar) e Leitor (para ler).
- **Interface/gatilho:** Interruptor "Publicar Livro" no painel do autor e acesso à URL pública `/read/:bookId`.
- **Entrada:** Identificador público do livro (`bookId`).
- **Comportamento:** Disponibiliza a leitura do livro para qualquer visitante sem login; renderiza os capítulos com navegação lateral, modo claro/escuro e balões de tooltip ativos para todas as entidades com visibilidade pública ativada.
- **Saída:** Interface de leitura agradável, rápida e interativa.
- **Exceções:** Se o livro estiver em status "Rascunho", acessos não autenticados ou de usuários que não são o autor recebem aviso de "Obra privada ou inexistente".

### RF-08 — Exportação em Markdown, DOCX e PDF

- **Quem:** Escritor autenticado.
- **Interface/gatilho:** Botão "Exportar" no editor ou painel do livro, escolhendo o formato desejado.
- **Entrada:** Formato selecionado (Markdown, DOCX ou PDF) e escopo (capítulo atual ou livro completo).
- **Comportamento:** O sistema compila o conteúdo no cliente, converte as marcações e dispara o download do arquivo formatado (ou abre a visualização de impressão otimizada para PDF).
- **Saída:** Arquivo baixado no computador do autor.
- **Exceções:** Capítulos vazios são identificados e exportados como seções em branco sem interromper o processo.

## 6. Regras de negócio

- **RN-01 (Saldo e Créditos de IA):** Usuários novos no plano Free recebem 100 créditos no cadastro. Usuários Premium recebem 2.000 créditos mensais. Cada sugestão de IA aceita consome 1 crédito. Sugestões descartadas (pressionando `Esc` ou continuando a digitar) não consomem créditos.
- **RN-02 (Fallback por Chave Própria - BYOK):** Se o usuário cadastrar sua própria chave de API (OpenAI ou Gemini) em suas configurações locais, as chamadas de IA passam a usar sua chave direta, sem debitar créditos do sistema.
- **RN-03 (Privacidade e Segurança do Lore):** Entidades marcadas com visibilidade "Privada (Apenas Autor)" têm seus nomes reconhecidos no editor para o escritor, mas nunca são expostas no leitor público nem no código-fonte da página de leitura pública.
- **RN-04 (Autonomia da Escrita Local):** O editor, o compêndio de lore, as exportações e o salvamento em nuvem continuam 100% acessíveis e ilimitados mesmo se os créditos de IA estiverem zerados.
- **RN-05 (Propriedade dos Dados):** O autor é o único proprietário de suas histórias. A qualquer momento ele pode exportar todos os seus dados em formato aberto (Markdown/JSON) ou excluir permanentemente seus livros e fichas.

## 7. Dados e arquivos

| Dado/arquivo               | Formato                    | Origem            | Obrigatório | Armazenamento e prazo                                   | Alteração/exclusão                                                        | Sensível                                                |
| -------------------------- | -------------------------- | ----------------- | ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Perfil do Usuário**      | JSON / Firestore Doc       | Firebase Auth     | Sim         | Cloud Firestore (`users/{uid}`)                         | Alterado pelo usuário; excluído mediante solicitação de exclusão de conta | Sim (E-mail e UID protegidos por regras de segurança)   |
| **Livro**                  | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}`)                      | Criado, editado e excluído pelo autor                                     | Não (público quando status for "published")             |
| **Capítulo**               | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}/chapters/{chapterId}`) | Editado a qualquer momento; excluído pelo autor                           | Não                                                     |
| **Entidade de Lore**       | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}/lore/{entityId}`)      | Editado e excluído pelo autor                                             | Não (campos privados filtrados na leitura pública)      |
| **Chave de API BYOK**      | String                     | Entrada do Autor  | Não         | `localStorage` do navegador do autor                    | Atualizado ou removido nas configurações locais                           | Sim (nunca enviada ao Firestore nem ao servidor do app) |
| **Exportação DOCX/PDF/MD** | Binário / Arquivo de texto | Gerado no cliente | Não         | Efêmero (baixado no dispositivo do autor)               | Não armazenado no servidor                                                | Não                                                     |

## 8. Integrações e dependências

| Integração/dependência                 | Finalidade                                                   | Comportamento em falha                                                                    |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Firebase Auth**                      | Gerenciamento de contas e autenticação de escritores         | Exibe alerta amigável de falha de login; permite navegação em modo visitante/leitor       |
| **Cloud Firestore**                    | Banco de dados em nuvem para livros, capítulos, lore e cotas | Usa cache offline do SDK em instabilidades de rede; avisa se a gravação não for concluída |
| **Provedores de IA (Gemini / OpenAI)** | Autocomplete inteligente e sugestões de estilo               | Em caso de falha de rede ou cota excedida, oculta a sugestão sem atrapalhar a digitação   |
| **Kit `@vitru/styleguide`**            | Componentes de interface, tokens oficiais e design system    | Renderização estática local, sem dependência externa                                      |

## 9. Interface e estados

| Tela ou componente                        | Carregando                             | Vazio                                            | Sucesso                                                  | Erro                                       | Sem permissão                           | Navegação por teclado                                             |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| **Dashboard de Livros** (`/`)             | `LoadingState` com esqueleto de cards  | `EmptyState` com convite "Criar primeiro livro"  | Grade de livros com capas, contagem de palavras e status | `ErrorState` com botão de tentar novamente | Redireciona para `/login`               | `Tab` entre cards, `Enter` para abrir                             |
| **Editor e Lore** (`/books/:id/editor`)   | Esqueleto de documento e barra lateral | Capítulo em branco com placeholder motivador     | Texto rico formatado com termos de lore destacados       | Alerta persistente na barra inferior       | Redireciona para `/` se não for o autor | `Tab` para aceitar IA, `Esc` para rejeitar, `@` para menu de lore |
| **Compêndio de Lore** (`/books/:id/lore`) | Lista de carregamento                  | Mensagem com botão "Adicionar primeira entidade" | Lista de entidades categorizada com busca                | `ErrorState` com opção de recarregar       | Redireciona para `/`                    | Atalhos de foco na busca e formulários                            |
| **Leitor Público** (`/read/:id`)          | Esqueleto de página de leitura         | Mensagem "Nenhum capítulo publicado"             | Texto do livro formatado com sumário lateral e tooltips  | Mensagem amigável de livro não encontrado  | Mensagem "Esta obra é privada"          | Setas `←` e `→` para navegar capítulos                            |

## 10. Plataformas e distribuição

- **Dispositivos e navegadores:** Suporte a navegadores modernos baseados em Chromium, Firefox e Safari (versões atuais em desktop e tablet/mobile). Foco de escrita primariamente em telas médias e grandes (desktop/laptop) e foco de leitura responsivo em todos os formatos de tela.
- **Forma de entrega:** Aplicação Web SPA servida via hospedagem estática moderna (Firebase Hosting).
- **Instalação e atualização:** Acesso direto via URL sem necessidade de instalação local; atualizações automáticas no reload do navegador.
- **Uso sem conexão:** Persistência em cache do Firestore permite continuar editando capítulos em quedas temporárias de conexão com sincronização automática na reconexão.

## 11. Restrições e requisitos de qualidade

- **Acessibilidade da interface:** Uso estrito de componentes semânticos do kit `@vitru/styleguide`, contraste de cores em conformidade com WCAG AA via tokens CSS, suporte a navegação por teclado e atributos ARIA nos tooltips e menus.
- **Idiomas:** Interface e mensagens em Português do Brasil na V1; suporte a textos de ficção em qualquer idioma.
- **Desempenho:** Detecção e marcação de entidades no editor em menos de 50ms para capítulos de até 15.000 palavras; tempo de resposta do autocomplete de IA otimizado com debounce de 600ms após pausa na digitação.
- **Privacidade e acesso:** Regras de segurança do Firestore (`firestore.rules`) garantindo que apenas o criador possa editar ou ler capítulos em rascunho e fichas privadas.
- **Portabilidade:** Exportações em padrões abertos e universais (Markdown padrão, DOCX compatível com Word/LibreOffice/Google Docs, PDF).

## 12. Critérios de sucesso

| Indicador                              | Meta                                                                 | Como medir                                             | Quando avaliar      |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------- |
| **Precisão de Reconhecimento de Lore** | 100% de correspondência exata para nomes e apelidos cadastrados      | Testes automatizados de unidade e componente no editor | Em cada release     |
| **Aceitação de Sugestões de IA**       | Taxa de aceitação > 25% das sugestões geradas                        | Métrica de eventos locais de aceitação vs descarte     | Mensalmente         |
| **Estabilidade de Salvamento**         | Zero perda de texto reportada por falha de sincronização             | Testes de integração de storage e cache do Firestore   | Contínuo            |
| **Conformidade com Styleguide**        | 100% dos componentes usando tokens e kit oficial `@vitru/styleguide` | Validação automatizada via `npm run validate`          | Em todos os commits |

## 13. Critérios de aceite

- **CA-01:** Dado que uma entidade "Aeron" está cadastrada no compêndio com apelido "Ron", quando o autor digita "Ron desembainhou a espada" no editor, então "Ron" recebe destaque visual e exibe seu resumo ao passar o mouse.
- **CA-02:** Dado que o autor clica sobre um termo de lore destacado no editor, quando a sidebar abre, então a ficha completa é carregada e permite edição imediata sem desposicionar o cursor do texto.
- **CA-03:** Dado que o autor digita `@` no editor de texto, quando digita as primeiras letras de uma entidade, então uma lista suspensa exibe as correspondências e permite a inserção imediata com `Enter`.
- **CA-04:** Dado que o autor tem créditos disponíveis e pausa a digitação por mais de 600ms, quando a IA retorna uma sugestão, então o texto é exibido em cinza translúcido e, ao pressionar `Tab`, é incorporado ao capítulo, debitando 1 crédito do saldo.
- **CA-05:** Dado que os créditos do autor chegam a 0, quando ele digita no editor, então nenhuma chamada de IA é disparada, mas o autor continua escrevendo, salvando no Firestore e exportando normalmente.
- **CA-06:** Dado que o autor marca um livro como "Publicado", quando qualquer pessoa acessa `/read/:bookId` sem login, então o livro é exibido com leitor limpo e com tooltips interativos apenas para as entidades com visibilidade pública ativada.
- **CA-07:** Dado que o autor clica em "Exportar", quando seleciona DOCX, Markdown ou PDF, então o arquivo correspondente é gerado e baixado no navegador.

## 14. Não escopo

- Edição colaborativa simultânea multiusuário (estilo Google Docs com cursores múltiplos ao vivo).
- Marketplace de venda de livros ou cobrança por leitura de capítulos na plataforma.
- Geração automática de livros inteiros de forma autônoma sem supervisão do escritor.
- Aplicativos móveis nativos para iOS ou Android na primeira versão.
- Integração complexa com gateways de pagamento em produção na V1 (sistema de créditos gerenciado via perfil).

## 15. Decisões e motivos

| Decisão                        | Escolha                                                                  | Motivo                                                                                                                       | Alternativa descartada                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Detecção de Lore no Editor** | Automática por nomes/apelidos + manual com `@`                           | Garante que o autor nunca esqueça um detalhe já estabelecido sem exigir esforço extra de marcação a cada frase               | Apenas menção manual com `@` (descartada por exigir esforço manual contínuo do autor)                              |
| **Modelo de IA e Cobrança**    | Autocomplete contínuo + ações sob demanda tarifadas por créditos aceitos | Dá previsibilidade de custos e só consome saldo quando o autor realmente aproveita o conteúdo sugerido                       | Cobrança por token ou chamada gerada (descartada por penalizar o autor por sugestões ruins)                        |
| **Fallback de IA**             | Chave própria BYOK (OpenAI/Gemini)                                       | Permite que usuários avançados continuem usando a IA ilimitadamente com seus próprios planos                                 | Bloqueio total sem alternativa (descartada por frustrar usuários avançados)                                        |
| **Backend e Persistência**     | Firebase (Auth + Firestore)                                              | Proporciona autenticação robusta, sincronização em tempo real e cache offline seguro sem necessidade de gerenciar servidores | Armazenamento exclusivamente local em localStorage (descartada por inviabilizar publicação online e backup seguro) |
| **Visualizador de Leitura**    | Rota pública web com tooltips interativos                                | Permite divulgação imediata de histórias com valor diferenciado de imersão no universo narrativo                             | Exportação apenas estática (descartada por não oferecer a experiência interativa aos leitores)                     |

## 16. Decisões em aberto

Nenhuma.
