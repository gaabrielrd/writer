# PRD — Writer: base vigente e evolução V2

**Status:** Base vigente e direção V2 aprovada; implementação incremental em andamento.
**Última atualização:** 2026-10-13

Os RF-01 a RF-08 preservam os requisitos da base histórica, com correções de
privacidade e referências aos incrementos existentes. A seção 17 define o escopo
aprovado do Writer V2, com implementação incremental do Estúdio. “Primeira versão pública do ecossistema”
abrange as fases 1–5 do V2; não equivale à primeira versão histórica deste documento.
Estado real e evidências: [registro de execução](tasks/writer-v2/execucao/README.md).

## 1. Visão do produto

### Problema

Escritores de livros de ficção frequentemente perdem a consistência de seus universos narrativos (_worldbuilding_ e _lore_) — como detalhes de personagens, nomes de locais, regras de magia e conceitos — ao longo de dezenas de capítulos. Hoje, os autores precisam alternar manualmente entre editores de texto e blocos de notas separados, o que quebra o ritmo de escrita, gera inconsistências na trama e dificulta a revisão. Além disso, faltam assistentes de escrita que compreendam o contexto desse universo para sugerir continuações coerentes e ferramentas que permitam compartilhar a história com leitores em um formato interativo que valorize esse universo.

### Proposta de valor

O **Writer Assistant** é uma plataforma de escrita que conecta um editor de texto rico a um compêndio de _lore_ inteligente: qualquer personagem, local ou conceito cadastrado é reconhecido no texto em tempo real, exibindo resumos em balões ao passar o mouse e abrindo fichas detalhadas em uma barra lateral. A plataforma conta com auxílio de inteligência artificial contextualizada no universo da obra (com autocomplete e ações de melhoria de texto baseados em créditos) e permite tanto exportar o manuscrito em múltiplos formatos (PDF, DOCX, Markdown) quanto publicá-lo em uma página de leitura interativa para os leitores.

### Objetivo da base histórica

Entregar uma aplicação web onde o autor consiga se cadastrar, criar livros com múltiplos capítulos, cadastrar entidades de lore com detecção automática no editor WYSIWYG, utilizar sugestões de IA alimentadas por créditos e publicar a obra em formato de leitor público com fichas informativas ativas.

### Evolução aprovada

Oferecer um estúdio completo para criar, revisar, publicar e distribuir livros e
aventuras, preparar/conduzir campanhas e vender ambos os produtos. Autores e mestres
têm igual prioridade. Universos conectam projetos sem obrigar vínculo nem converter
aventuras/campanhas em livros. Os cinco espaços aprovados são Universos, Estúdio,
Publicações, Catálogo e Biblioteca, com os três tipos de projeto dentro do Estúdio.

## 2. Usuários

### Usuários principais, com igual prioridade no V2

**Escritor de ficção**: autor independente ou profissional que escreve contos, novelas ou romances e precisa de controle sobre personagens, cronologia, locais e auxílio criativo para manter a consistência e o fluxo de produção.

**Mestre/criador de aventuras**: prepara material narrativo, conduz sessões,
compartilha pistas sem segredos e registra consequências em campanhas particulares.

### Usuários secundários

- **Leitor beta ou público**: pessoa que acessa o link público da obra compartilhada pelo autor e lê os capítulos com navegação facilitada e balões de informação do universo da história.
- **Revisor e jogador convidados:** recebem somente os materiais/operações autorizados.
- **Comprador:** adquire uma edição, baixa arquivos e pode usar aventura em mesas próprias.
- **Criador convidado e operador:** submetem/acompanham catálogo, direitos, vendas e atendimento.

### Usuários não atendidos nesta versão

- Co-autores trabalhando no mesmo parágrafo em tempo real simultaneamente (edição multiusuário estilo Google Docs).
- Ilustradores ou diagramadores profissionais que exigem controle tipográfico de pré-impressão gráfica (InDesign).

## 3. Jornada principal

1. **Acesso e Início**: A pessoa faz login com Google ou e-mail e entra no Estúdio, que reúne livros, aventuras e campanhas particulares, com saldo de créditos de IA no header.
2. **Criação da Obra**: Em "Novo projeto", escolhe Livro, Aventura ou Campanha. Livro reutiliza a criação existente; aventura/campanha começa por título, sinopse/descrição opcional e universo opcional.
3. **Construção do Lore**: Na aba de compêndio, o autor cadastra as principais entidades da história (ex.: Personagem "Elena", com apelido "Leni", ocupação "Alquimista", resumo curto e relações).
4. **Escrita Enriquecida**: No editor de texto, ao escrever "Elena caminhou até o laboratório", a palavra "Elena" é automaticamente sublinhada; ao passar o mouse, um balão exibe seu resumo; ao clicar, a barra lateral abre sua ficha completa para consulta ou ajuste rápido.
5. **Auxílio Criativo por IA**: Ao pausar a digitação, a IA sugere a continuação da cena em texto translúcido respeitando o contexto dos personagens; o autor aceita a sugestão com `Tab`, consumindo 1 crédito do seu saldo.
6. **Exportação e Compartilhamento**: O autor exporta DOCX/PDF para revisão local e confirma uma publicação explícita, separada do rascunho, com nome público do autor. O link `/read/:bookId` lê somente a projeção pública autorizada; editar o original não atualiza a publicação automaticamente.

## 4. Escopo da base histórica

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
- **Exceções:** Falha de gravação mantém o rascunho próprio recuperável e informa o estado real. Rascunhos divergentes exigem escolha de recuperação; o protocolo V2 não sobrescreve silenciosamente uma revisão mais nova. Veja [histórico planejado](tasks/writer-v2/fase-02-criar-e-preparar/05-historico-e-restauracao.md).

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
- **Exceções:** Termos privados não integram a resposta pública, a busca, o cache nem os tooltips; não basta esconder campos na interface.

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
- **Comportamento:** Publicação confirmada prepara e ativa uma projeção versionada separada do original. O leitor gratuito lê capítulos e lore autorizados nos três temas; revogação de lore invalida a versão anterior. Veja [segurança da publicação](publication-security.md).
- **Saída:** Interface de leitura agradável, rápida e interativa.
- **Exceções:** Sem publicação ativa autorizada, o acesso informa obra indisponível. Status legado publicado sozinho não concede leitura nem dispara migração automática. Corpo de edição paga V2 não entra em `publicBooks`.

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
- **RN-04 (Autonomia da Escrita Local):** Saldo zero não impede escrita manual, lore, exportação própria e salvamento autorizado; limites técnicos de tamanho/revisão continuam aplicáveis.
- **RN-05 (Propriedade dos Dados):** O autor controla/exporta seus originais privados. No V2, exclusão narrativa, retirada de oferta e revogação de acesso são operações distintas: notas de outras mesas, edição adquirida e registros comerciais seguem seus próprios contratos. Não prometer apagar arquivos já baixados nem apagar razão financeira junto do manuscrito.

RN-01/RF-06/CA-04 descrevem o autocomplete histórico, não uma tarifa universal.
No [chat atual de capítulo](chapter-chat.md), conversar é gratuito; aplicar uma
sugestão da plataforma custa 1 crédito em transação com manuscrito/recibo.
[Criação de livros](book-creation.md) e [criação assistida](assisted-book-creation.md)
têm aceites e custos próprios. O V2 não altera esses preços por inferência.

## 7. Dados e arquivos

| Dado/arquivo               | Formato                    | Origem            | Obrigatório | Armazenamento e prazo                                   | Alteração/exclusão                                                        | Sensível                                                 |
| -------------------------- | -------------------------- | ----------------- | ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Perfil do Usuário**      | JSON / Firestore Doc       | Firebase Auth     | Sim         | Cloud Firestore (`users/{uid}`)                         | Alterado pelo usuário; excluído mediante solicitação de exclusão de conta | Sim (E-mail e UID protegidos por regras de segurança)    |
| **Livro**                  | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}`)                      | Criado, editado e excluído pelo autor                                     | Original privado; status não concede acesso público      |
| **Capítulo**               | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}/chapters/{chapterId}`) | Editado pelo autor; revisões/conflitos conforme contrato                  | Manuscrito privado                                       |
| **Entidade de Lore**       | JSON / Firestore Doc       | Entrada do Autor  | Sim         | Cloud Firestore (`books/{bookId}/lore/{entityId}`)      | Editado e excluído pelo autor                                             | Original privado; projeção pública com campos permitidos |
| **Chave de API BYOK**      | String                     | Entrada do Autor  | Não         | `localStorage` do navegador do autor                    | Atualizado ou removido nas configurações locais                           | Sim (nunca enviada ao Firestore nem ao servidor do app)  |
| **Exportação DOCX/PDF/MD** | Binário / Arquivo de texto | Gerado no cliente | Não         | Efêmero (baixado no dispositivo do autor)               | Não armazenado no servidor                                                | Herda a privacidade do conteúdo exportado                |

Recursos V2 futuros — aventuras, campanhas/notas, revisão, edições, direitos e
registros comerciais — estão no [contrato de domínio](tasks/writer-v2/execucao/02-modelo-de-dominio.md)
e na [matriz de acesso](tasks/writer-v2/execucao/03-permissoes-e-privacidade.md).
Corpo editorial imutável não torna o acesso irrevogável. Retenção comercial,
fundamentos de tratamento e capacidades do provedor precisam ser fechados antes
da operação pertinente; não há prazo fiscal presumido neste PRD.

## 8. Integrações e dependências

| Integração/dependência                 | Finalidade                                                   | Comportamento em falha                                                                    |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Firebase Auth**                      | Gerenciamento de contas e autenticação de escritores         | Exibe alerta amigável de falha de login; permite navegação em modo visitante/leitor       |
| **Cloud Firestore**                    | Banco de dados em nuvem para livros, capítulos, lore e cotas | Usa cache offline do SDK em instabilidades de rede; avisa se a gravação não for concluída |
| **Provedores de IA (Gemini / OpenAI)** | Autocomplete inteligente e sugestões de estilo               | Em caso de falha de rede ou cota excedida, oculta a sugestão sem atrapalhar a digitação   |
| **Componentes `@/shared/ui`**          | Interface local, tokens semânticos e três temas              | Renderização local; sem serviço externo de design system                                  |

## 9. Interface e estados

| Tela ou componente                        | Carregando                                | Vazio                                            | Sucesso                                                        | Erro                                      | Sem permissão                           | Navegação por teclado                                             |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| **Estúdio** (`/studio`)                   | Preparação legada e carregamento por tipo | `EmptyState` por tipo com ação de criação        | Livros, aventuras e campanhas, filtros e páginas independentes | Retry por seção preserva as demais        | Redireciona para `/login`               | `Tab` entre filtros, cards e ações; menus por teclado             |
| **Editor e Lore** (`/books/:id/editor`)   | Esqueleto de documento e barra lateral    | Capítulo em branco com placeholder motivador     | Texto rico formatado com termos de lore destacados             | Alerta persistente na barra inferior      | Redireciona para `/` se não for o autor | `Tab` para aceitar IA, `Esc` para rejeitar, `@` para menu de lore |
| **Compêndio de Lore** (`/books/:id/lore`) | Lista de carregamento                     | Mensagem com botão "Adicionar primeira entidade" | Lista de entidades categorizada com busca                      | `ErrorState` com opção de recarregar      | Redireciona para `/`                    | Atalhos de foco na busca e formulários                            |
| **Leitor Público** (`/read/:id`)          | Esqueleto de página de leitura            | Mensagem "Nenhum capítulo publicado"             | Texto do livro formatado com sumário lateral e tooltips        | Mensagem amigável de livro não encontrado | Mensagem "Esta obra é privada"          | Setas `←` e `→` para navegar capítulos                            |

## 10. Plataformas e distribuição

- **Dispositivos e navegadores:** Suporte a navegadores modernos baseados em Chromium, Firefox e Safari (versões atuais em desktop e tablet/mobile). Foco de escrita primariamente em telas médias e grandes (desktop/laptop) e foco de leitura responsivo em todos os formatos de tela.
- **Forma de entrega:** Aplicação Web SPA servida via hospedagem estática moderna (Firebase Hosting).
- **Instalação e atualização:** Acesso direto via URL sem necessidade de instalação local; atualizações automáticas no reload do navegador.
- **Uso sem conexão:** Rascunho próprio pode ser recuperado; divergências exigem resolução explícita. O V2 não oferece persistência offline do corpo pago/compartilhado na primeira versão; cache não concede autorização. Veja [contrato de acesso](tasks/writer-v2/execucao/03-permissoes-e-privacidade.md).

## 11. Restrições e requisitos de qualidade

- **Acessibilidade da interface:** Componentes semânticos de `@/shared/ui`, tokens de tema, Claro/Escuro/Sépia, teclado/foco/ARIA, contraste WCAG AA e validação responsiva até 320 px. A meta exige inspeção pertinente; testes automatizados sozinhos não comprovam conformidade integral.
- **Idiomas:** Interface e mensagens em Português do Brasil na V1; suporte a textos de ficção em qualquer idioma.
- **Desempenho:** Detecção e marcação de entidades no editor em menos de 50ms para capítulos de até 15.000 palavras; tempo de resposta do autocomplete de IA otimizado com debounce de 600ms após pausa na digitação.
- **Privacidade e acesso:** Regras de segurança do Firestore (`firestore.rules`) garantindo que apenas o criador possa editar ou ler capítulos em rascunho e fichas privadas.
- **Portabilidade:** Exportações em padrões abertos e universais (Markdown padrão, DOCX compatível com Word/LibreOffice/Google Docs, PDF).

## 12. Critérios de sucesso

| Indicador                              | Meta                                                            | Como medir                                             | Quando avaliar      |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ------------------- |
| **Precisão de Reconhecimento de Lore** | 100% de correspondência exata para nomes e apelidos cadastrados | Testes automatizados de unidade e componente no editor | Em cada release     |
| **Aceitação de Sugestões de IA**       | Taxa de aceitação > 25% das sugestões geradas                   | Métrica de eventos locais de aceitação vs descarte     | Mensalmente         |
| **Estabilidade de Salvamento**         | Zero perda de texto reportada por falha de sincronização        | Testes de integração de storage e cache do Firestore   | Contínuo            |
| **Conformidade com Styleguide**        | Componentes locais e tokens semânticos nos três temas           | Gates locais e inspeção visual/acessível pertinente    | Em todos os commits |

## 13. Critérios de aceite

- **CA-01:** Dado que uma entidade "Aeron" está cadastrada no compêndio com apelido "Ron", quando o autor digita "Ron desembainhou a espada" no editor, então "Ron" recebe destaque visual e exibe seu resumo ao passar o mouse.
- **CA-02:** Dado que o autor clica sobre um termo de lore destacado no editor, quando a sidebar abre, então a ficha completa é carregada e permite edição imediata sem desposicionar o cursor do texto.
- **CA-03:** Dado que o autor digita `@` no editor de texto, quando digita as primeiras letras de uma entidade, então uma lista suspensa exibe as correspondências e permite a inserção imediata com `Enter`.
- **CA-04:** Dado que o autor tem créditos disponíveis e pausa a digitação por mais de 600ms, quando a IA retorna uma sugestão, então o texto é exibido em cinza translúcido e, ao pressionar `Tab`, é incorporado ao capítulo, debitando 1 crédito do saldo.
- **CA-05:** Com saldo zero e sem BYOK, autocomplete tarifado não solicita geração; escrita, salvamento autorizado e exportação própria continuam. Chat gratuito permanece disponível; aplicação tarifada valida saldo/ownership no servidor e não altera o manuscrito em falha.
- **CA-06:** Após confirmar publicação explícita, `/read/:bookId` sem login lê apenas a projeção ativa autorizada. Original, campos privados e lore revogado não integram a resposta; alterar status legado sozinho não concede acesso.
- **CA-07:** Dado que o autor clica em "Exportar", quando seleciona DOCX, Markdown ou PDF, então o arquivo correspondente é gerado e baixado no navegador.

## 14. Não escopo

- Edição colaborativa simultânea multiusuário (estilo Google Docs com cursores múltiplos ao vivo).
- Marketplace aberto a vendedores não convidados; assinatura de obras, paywall por capítulo e carteira interna na primeira versão do ecossistema.
- Geração automática de livros inteiros de forma autônoma sem supervisão do escritor.
- Aplicativos móveis nativos para iOS ou Android na primeira versão.
- VTT, combate/dados automatizados, engine completa de regras D&D e integração automática com lojas externas na primeira versão do ecossistema. Exportação externa e venda avulsa convidada fazem parte do V2.

## 15. Decisões e motivos

| Decisão                        | Escolha                                                                  | Motivo                                                                                                                       | Alternativa descartada                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Detecção de Lore no Editor** | Automática por nomes/apelidos + manual com `@`                           | Garante que o autor nunca esqueça um detalhe já estabelecido sem exigir esforço extra de marcação a cada frase               | Apenas menção manual com `@` (descartada por exigir esforço manual contínuo do autor)                              |
| **Modelo de IA e Cobrança**    | Autocomplete contínuo + ações sob demanda tarifadas por créditos aceitos | Dá previsibilidade de custos e só consome saldo quando o autor realmente aproveita o conteúdo sugerido                       | Cobrança por token ou chamada gerada (descartada por penalizar o autor por sugestões ruins)                        |
| **Fallback de IA**             | Chave própria BYOK (OpenAI/Gemini)                                       | Permite que usuários avançados continuem usando a IA ilimitadamente com seus próprios planos                                 | Bloqueio total sem alternativa (descartada por frustrar usuários avançados)                                        |
| **Backend e Persistência**     | Firebase (Auth + Firestore)                                              | Proporciona autenticação robusta, sincronização em tempo real e cache offline seguro sem necessidade de gerenciar servidores | Armazenamento exclusivamente local em localStorage (descartada por inviabilizar publicação online e backup seguro) |
| **Visualizador de Leitura**    | Rota pública web com tooltips interativos                                | Permite divulgação imediata de histórias com valor diferenciado de imersão no universo narrativo                             | Exportação apenas estática (descartada por não oferecer a experiência interativa aos leitores)                     |

## 16. Decisões em aberto

As decisões D-01 a D-12 e suas condições estão em [decisões e riscos](tasks/writer-v2/decisoes-e-riscos.md)
e na [matriz por incremento](tasks/writer-v2/execucao/06-contratos-e-replanejamento.md).
Configuração/capacidades Connect, contratos comerciais concretos, histórico/retenção,
formatos novos e participantes/observações dos pilotos conservam seus portões.
Navegação aprovada não comprova piloto, pagamento real nem implementação do produto.

## Incremento: Universos e lore compartilhado

O autor gerencia universos próprios pela opção **Universos** no header.
Cada universo reutiliza entidades entre livros vinculados. Os dados essenciais da
criação oferecem o vínculo quando há universos; as configurações de livros
existentes permitem selecionar, trocar ou remover o universo. O lore local
permanece independente.

Compêndio e editor permitem gerenciar lore local e global separadamente. Ambos
participam de menções, reconhecimento e contexto da IA; somente entidades
públicas e campos permitidos entram na publicação. Revogar consentimento global
invalida publicações antigas do universo. Cadastro e edição de fichas mostram
identificação e visibilidade imediatamente, com salvamento direto e seções
opcionais que preservam os dados ao recolher.

Aceite: compartilhar uma ficha entre dois livros; preservar lore local ao trocar
vínculo; criar livros sem universo; manter autoria e privacidade; revogar leituras
antigas e URLs diretas; usar o mesmo formulário em todos os pontos de entrada; funcionar
nos três temas em desktop e celular. Veja [comportamento completo](shared-lore.md).

## 17. Writer V2 — primeira versão pública do ecossistema

### Requisitos e jornadas aprovados

| ID    | Resultado exigido                                                            | Fases responsáveis |
| ----- | ---------------------------------------------------------------------------- | ------------------ |
| EV-01 | Igual prioridade: jornadas completas de autor e mestre, com aceite de ambas  | 1, 3, 5            |
| EV-02 | Universo reutilizável: cânone e variantes independentes entre projetos/mesas | 1–3                |
| EV-03 | Ciclo de escrita: planejar, redigir, revisar e recuperar uma obra            | 2–3                |
| EV-04 | Campanhas narrativas: preparar/conduzir, revelar e registrar consequências   | 2–3                |
| EV-05 | Publicação/distribuição: edição no Writer, EPUB e pacote de aventura real    | 4                  |
| EV-06 | Venda completa: livro/aventura comprados, acessados, conciliados e atendidos | 4–5                |
| EV-07 | Criadores convidados: direito de vendedor controlado e catálogo acompanhado  | 1, 4               |
| EV-08 | Solo/20 h semanais: estimativa/capacidade registrada e revisada por fase     | 1, 5               |

Os IDs preservam a [matriz de cobertura](tasks/writer-v2/matriz-de-cobertura.md)
e os cenários detalhados de [validação e aceite](tasks/writer-v2/validacao-e-aceite.md).
Revisão é assíncrona. Campanha não depende de compra; edição comprada não transfere
autoria do original. Universo é opcional. Livros conservam IDs/coleções/URLs, atos,
capas, lore, personas e fluxos existentes; não há migração genérica de projetos.

### Comércio e acesso escolhidos

Brasil/BRL, venda avulsa por criadores convidados; criador vende e Writer cobra
comissão configurável por contrato e centraliza atendimento. Criador absorve taxas
e reversões; eventual reserva depende de contrato e capacidade real. Stripe é o
provedor escolhido; o modelo Connect proposto ainda precisa de verificação efetiva.
Não fixar percentual, calendário ou tarifa provisória.

Compra conserva a edição adquirida; updates opcionais; retirada interrompe novas
vendas. Download e uso em mesas próprias são permitidos; sem revenda do material
autoral exclusivo, preservando licenças dos componentes. Refund parcial mantém
acesso; disputa aberta suspende; refund integral efetivado/perda revoga novos
downloads/acesso à edição, preservando notas próprias. Vitória restaura somente
direito ainda válido. Comissão retorna proporcionalmente ao refund e integralmente
na disputa perdida. Cópias já baixadas não podem ser apagadas remotamente.
Contrato completo, remediação excepcional e fontes: [comércio/direitos](tasks/writer-v2/execucao/04-regras-comerciais-e-direitos.md).

### Execução e aceite

Fases 1–5 e 41 tarefas formam o escopo comprometido; fase 6 contém candidatos futuros.
Cada incremento exige plano executável, testes pertinentes, revisão, documentação,
evidência e a definição de concluído vigente. Projeções de revisão/jogador/gratuita/
paga são separadas e nunca recebem um segredo para depois escondê-lo na UI.
Os contratos normativos são formalizados no [ADR 0025](decisions/0025-writer-v2-contracts.md).

O Estúdio F2-01 implementa navegação, listagem e criação privada persistida, sem
converter aventura/campanha em livro. Seus metadados têm detalhes próprios;
cenas/partes de aventura são acrescentadas pelo incremento F2-02; revisão, sessões
e comércio permanecem nas tarefas seguintes. Cenas têm texto próprio e planejamento
privado; arquivar retira da composição e preserva restauração. Conversão de capítulo
é explícita e conserva fonte. Consulte o [contrato de cenas](tasks/writer-v2/execucao/08-planejamento-de-cenas.md)
para limites, compatibilidade e estado real dos gates.
Publicações, Catálogo e Biblioteca mostram disponibilidade futura. A autorização
explícita de implementação conserva condições humanas/comerciais nos próprios
aceites, sem concluir integralmente a fase 1.

Roteiros estão preparados; participantes serão indicados pelo operador. CI/PR,
emulador, fixtures visuais, pilotos humanos e liberação live são evidências distintas.
Resultados e pendências do head ficam no [registro de execução](tasks/writer-v2/execucao/README.md).
Estimativas de esforço/capacidade e suas limitações ficam na [timeline](tasks/writer-v2/timeline.md).
