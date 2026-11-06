# Temas personalizados

O seletor do cabeçalho oferece Claro, Escuro, Sépia e Temas personalizados.
Usuários autenticados podem manter até cinco temas privados na conta. A biblioteca
acompanha a conta em outros dispositivos; a seleção ativa pertence ao dispositivo
e é isolada pelo UID. A preferência nativa legada `writer_theme` continua válida.

## Criar e comparar

Temas personalizados abre uma lista ancorada, preferencialmente acima do seletor.
Criar novo abre um painel flutuante não modal. Nome, base Claro/Escuro e destaque
hexadecimal produzem três sugestões determinísticas: Neutra, Tonal e Expressiva.
A base inicial acompanha a aparência atual (escura → Escuro; clara/sépia → Claro).
Nome aparece como placeholder; nome e base conservam os nomes acessíveis.
Todo campo de cor oferece picker nativo e edição hexadecimal.
Selecionar uma sugestão aplica a prévia sem gravar no servidor. Comparar com o tema
anterior suspende a prévia; voltar retoma o mesmo rascunho.

O painel permanece montado durante a navegação interna. O cabeçalho oferece
arraste, movimento pelas setas no controle Mover, reposicionamento, recolhimento
e fechamento. Em celular, o painel fica na borda inferior, com corpo rolável e
ações acessíveis. Modais da aplicação suspendem a interação do painel.

## Fundo

Abaixo da base, Intensidade e o botão de matiz ficam na mesma linha. A escala
0–100 vai de branco absoluto a cinza-claro (#e0e0e0) em Claro e de preto absoluto
a cinza-escuro (#303030) em Escuro, quando a matiz é neutra. O picker do fundo
seleciona uma matiz com saturação suave e preserva a luminosidade da escala;
escolher cinza devolve o fundo neutro. Superfícies acompanham o fundo e a sugestão.

Intensidade e matiz independem do destaque. Alterá-las substitui somente um
override avançado de background, preservando os demais ajustes. Trocar destaque,
base ou sugestão continua preservando todos os overrides.

## Ajustes e confirmação

Modo avançado reutiliza FormSection e agrupa as 24 cores semânticas. Ajustes manuais
substituem a geração e sobrevivem à troca de base, destaque e sugestão. Cada cor
pode voltar ao valor automático; restaurar todas exige confirmação contextual.

Valores aceitos têm formato `#RRGGBB`. Os pares essenciais de leitura são
verificados com razão mínima 4,5 e campos/foco com razão 3. O formulário bloqueia
cores inválidas e o salvamento bloqueia contraste insuficiente. Corrigir
automaticamente é explícito; combinações conflitantes ainda mostram seus avisos.
O painel herda os tokens da aparência aplicada à plataforma, acompanhando a prévia
em tempo real. Comparar com o tema anterior também atualiza as cores do painel.

Salvar confirma a persistência antes de fechar. Cancelar descarta a prévia.
Fechar ou trocar a seleção com alterações oferece salvar, descartar ou continuar.
Navegar e recolher preservam o rascunho. Recarregar a aba usa a proteção nativa de
saída; rascunhos de temas não são recuperados depois de recarregar.

Editar atualiza a mesma vaga. Remover pede confirmação e, se o tema estiver ativo,
aplica sua base após a exclusão. Falhas preservam os dados para nova tentativa.
Logout e troca de conta removem prévia e catálogo da sessão anterior.

## Modelo e persistência

A feature `src/features/custom-themes` mantém gerador, validação, editor e serviços.
O motor neutro em `src/shared/theme` aplica a aparência na raiz do documento,
incluindo portais, e limpa os overrides ao retornar aos temas nativos.
A composição em app fornece o UID; shared não depende da feature.

Cada tema guarda ID, nome, base, destaque, sugestão, overrides, paleta efetiva,
versão do gerador, revisão e datas. O gerador v2 acrescenta backgroundIntensity
(inteiro 0–100) e backgroundHue (hexadecimal). Registros v1 continuam válidos,
conservam sua paleta e recebem controles derivados do fundo ao abrir a edição.
Uma mudança de cores promove o rascunho para v2; renomear sozinho conserva v1. A paleta efetiva preserva o resultado salvo
quando o algoritmo evoluir.

O documento privado `users/{uid}/preferences/themes` contém schemaVersion,
revision, changedId e um mapa de temas indexado por ID. As transações alteram uma
entrada por vez. As regras impõem até cinco entradas, validam a entrada alterada
e congelam as demais por diff. Isso evita ultrapassar o orçamento de expressões
ao revalidar cinco paletas completas. Gravações fora da revisão e retentativas
conflitantes são rejeitadas; a repetição do mesmo conteúdo já confirmado é idempotente.

Somente valores hexadecimais dos tokens permitidos são convertidos para CSS.
Não há CSS livre, chamadas de IA, débitos de créditos ou novas dependências.
Salvar requer confirmação online da transação. Cache ausente não é interpretado
como exclusão confirmada pelo servidor.

## Verificação

- Testes de modelo, serviço e interface: `src/features/custom-themes/tests`.
- Aplicação e limpeza da aparência: `src/shared/theme/tests/ThemeAppearance.test.tsx`.
- Regras reais: `tests/firestore/custom-themes.rules.test.mjs`.
- Chromium com serviços fictícios: `e2e/visual/custom-themes.visual.ts`.

Execute `npm run validate`, `npm run test:rules` e os cenários com
`npx playwright test --config playwright.visual.config.ts e2e/visual/custom-themes.visual.ts`.
Use WRITER_VISUAL_PORT exclusivo por checkout.

As fontes têm cinco presets e uma combinação personalizada em Preferências,
independentes das paletas de cores; veja [tipografia literária](typography.md).
Compartilhar, importar/exportar temas e personalizar layout ficam fora
desta versão. Não há publicação automática: as novas regras precisam ser
publicadas antes de disponibilizar a interface em produção.

O controle de intensidade omite textos e valor visíveis. Dois círculos, antes e
depois do slider, mostram as cores dos extremos conforme a base e a matiz.
O nome, o valor e a descrição dos extremos permanecem acessíveis ao leitor de tela.

Sem temas salvos, o seletor apresenta o cabeçalho e o botão Criar novo, sem
cartão de estado vazio. O botão ocupa toda a largura; os textos são compactos
e o cabeçalho e a ação de criar usam cor discreta.
