# Personas de escrita

O menu **Configurar inteligência artificial** abre a página `/settings/ai`, com
abas **Personas** e **Provedor**, no padrão visual dos detalhes de um livro.
A aba ativa fica na URL (`?tab=provider` ou `?tab=personas`); as setas, Home e End
permitem alternar por teclado. O link de retorno preserva a origem, inclusive
o editor. A aba Provedor mantém a conexão, a chave própria e o modelo.
A biblioteca inclui O Atmosférico,
O Incisivo, O Íntimo, O Irônico, O Épico e O Inquietante. Personalizar um padrão
cria uma cópia privada; os seis modelos originais não são alterados.

Cada persona padrão mostra seu avatar na biblioteca e na prévia de seleção de
livro/capítulo. As seis imagens fornecidas pelo autor ficam em `public/img/persona`.
Avatares são recursos visuais do catálogo e não são enviados ao modelo nem
persistidos nos prompts ou no backup privado.

## Criar e editar

As personas aparecem em lista, com avatar, nome, descrição, origem e quantidade
de atributos. Clique numa linha para abrir os detalhes. O modal apresenta a
direção de escrita e um mapa de personalidade com ícones Lucide, barras de
intensidade, valores e significados dos extremos. Os atributos ficam em duas
colunas no desktop e uma no celular. Personalização e edição acontecem nesse
mesmo modal, com sliders e definições; fechar devolve o foco à linha acionada.

Uma persona contém nome, descrição, instruções permanentes e oito atributos de
0 a 100: Sensorialidade, Concisão, Introspecção, Humor e ironia, Solenidade,
Tensão, Ambiguidade e Ritmo narrativo. Zero representa o extremo mínimo, não
ausência de configuração. O usuário pode adicionar até oito sliders próprios,
informando nome, significado e descrições dos extremos. Definições, valores e
instruções podem ser editados. O resumo mostra as orientações resultantes.

Nome: até 80 caracteres; descrição: 500; instruções: 6.000. Cada atributo tem
nome de até 80 caracteres, significado de até 300 e extremos de até 200.
Atributos duplicados ou valores fora da escala são recusados na aplicação.

Editar uma persona muda as próximas chamadas dos livros e capítulos que a
utilizam. Duplicar permite criar uma variação independente. Arquivar a retira
das novas seleções, preservando vínculos existentes; a biblioteca permite
consultar e reativar arquivadas. Não existe exclusão física pela interface.

## Livro e capítulo

Em **Opções do livro → Persona de IA**, selecione uma base ou **Sem persona**.
No editor, o botão **Persona** abre um único modal com as abas **Capítulo**,
**Livro** e **Biblioteca**. Ele concentra seleção da complementar, ajustes da
base, consulta das orientações efetivas e gerenciamento da biblioteca, incluindo
criação e edição. Não há uma faixa de personas na área de escrita e esse fluxo
mantém o usuário no capítulo. A página `/settings/ai` continua acessível pelo menu
geral de configuração de IA.

As instruções da complementar se somam às do livro e prevalecem em conflitos de
estilo. Os atributos do livro são herdados; cada atributo da complementar pode
ser configurado em **Definir no capítulo**. Sem uma base, os valores da
complementar são utilizados. Atributos próprios da complementar que não existem
na base começam no valor dela. Atributos próprios da base permanecem presentes.
Trocar a complementar limpa as substituições anteriores.

O pedido pontual pode solicitar uma exceção de estilo para aquela execução.
Fatos do lore e requisitos de formato da operação continuam prevalecendo. Uma
persona não implica reescrever texto existente.

## Chamadas e persistência

Autocomplete, Continuar Cena, Aprimorar Estilo, Coerência com Lore e Instrução
personalizada usam a mesma composição. Aprimorar Estilo respeita a persona em
vez de exigir sempre uma prosa mais sensorial. A análise estruturada do compêndio,
sinopse e capa continuam com seus contratos próprios.

Os sliders são orientações textuais, independentes de parâmetros do provedor.
Firebase AI Logic, Gemini BYOK e OpenAI BYOK recebem a composição pelo canal de
instruções existente. A qualidade da adesão literária depende do modelo; os
testes automatizados verificam o envio e o comportamento do aplicativo.

Personas ficam em `users/{uid}/aiPersonas/{personaId}`, com esquema 1 e revisão
monotônica. Gravações transacionais recusam uma revisão antiga. O livro guarda
`personaId`; o capítulo guarda `personaComplement`, com identificador e lista de
substituições. Assinaturas atualizam os vínculos e a biblioteca entre abas.
Livros antigos não exigem migração: campos ausentes significam sem persona.

Mudanças nas personas ou nos vínculos cancelam gerações e invalidam resultados
antigos. Isso não inicia outra geração automática: ela continua exigindo
digitação. Texto e créditos só mudam no aceite. Falhas de configuração bloqueiam
apenas a assistência de IA, com feedback e retentativa; a escrita continua.

## Privacidade, backup e implantação

Regras do Firestore isolam personas pelo autor, protegem revisões, impedem
exclusão e validam vínculos, tamanho das listas e valores. A aplicação valida
também textos, identificadores, atributos obrigatórios e duplicatas na leitura
e antes de salvar. As verificações de lista nas regras respeitam o limite de
expressões do Firestore, incluindo todos os 16 atributos.

Chaves BYOK continuam no adaptador local. Publicação, PDF, DOCX e Markdown não
incluem personas ou prompts. O backup JSON privado usa versão 3 quando há
personas e contém as definições utilizadas, incluindo padrões/arquivadas, os
vínculos e as substituições de cada capítulo. Isso preserva os dados necessários
para reconstruir a configuração. Sem personas, versões 1 e 2 são preservadas.
O aplicativo continua sem um restaurador completo de manuscritos JSON.

É necessário implantar `firestore.rules` junto da versão da aplicação antes de
utilizar a persistência em produção. Esta entrega não altera cobrança nem exige
novos segredos, dependências ou Cloud Functions.

## Verificação

```bash
npm run validate
npm run test:rules
npx playwright test --config playwright.visual.config.ts e2e/visual/personas.visual.ts
```

A suíte visual usa contas e serviços fictícios com rede externa bloqueada,
nos três temas, desktop e celular, incluindo 320 px. Testa teclado, corpo
rolável, ações visíveis, persistência, arquivamento, vínculos, composição e
manutenção do texto até o aceite. Veja [testes](testing.md).
