# Criação assistida por IA

## Entrada atual do Estúdio

Novo projeto abre `/studio/new`: escolha IA ou manual, depois Livro, Aventura ou
Campanha. Universo e persona podem ser selecionados antes da conversa; os seus
gerenciadores abrem sem sair do fluxo. A proposta inicial é curta e revisável.
Salvar rascunho preserva a revisão. Ao confirmar, raiz, vínculo e débito são
atômicos. O pacote textual custa 2 créditos nos três tipos; criação manual não
debita esse pacote. Livros também podem usar imagem da biblioteca ou gerar capa
por mais 5 créditos. A confirmação mostra o total.

A própria conversa de criação pode propor ações da tela, como gerar a proposta,
abrir detalhes ou ajustar campos, sempre com prévia e confirmação. Os ajustes
autorais não salvos permanecem intactos ao conversar. A sessão nova comporta
até 64 mensagens; a confirmação permite continuar dentro do projeto.

O assistente da página abre no projeto confirmado e relê a concepção por ID,
quando ainda disponível e autorizada. Pode sugerir ações dos controles atuais,
com confirmação individual. A escrita de texto rico usa o assistente nativo do
editor. Veja o [plano e limites](tasks/criacao-de-projetos-e-assistente-contextual.md)
e a [ADR 0272](decisions/0272-project-creation-and-contextual-assistant.md).

## Fluxo legado de livro

A rota `/books/new/assisted` preserva a entrevista e revisão detalhada de lore
abaixo; não é a entrada padrão de Novo projeto. Se a sessão atual pertence ao
fluxo novo, essa rota encaminha para `/studio/new` sem reinterpretar uma aventura
ou campanha como livro.

Na biblioteca, **Criar com IA** abre `/books/new/assisted`. A criação manual
continua disponível. O fluxo exige login e backend implantado.

## Fluxo

O fluxo começa com uma mensagem de boas-vindas do agente e segue em uma coluna
de conversa. Na ideia e na entrevista, o campo fica no rodapé da área útil;
mensagens curtas ficam centralizadas no espaço acima e conversas longas rolam
nessa área, mantendo a resposta disponível. O progresso em cinco etapas complementa a entrevista. O campo de
mensagem tem nome acessível, sem label visual; Enter envia e Shift+Enter quebra
a linha, preservando composição por IME. O foco retorna ao campo depois da
resposta. “Ideias que reunimos” permite consultar decisões e reiniciar mediante
confirmação, sem ocupar uma coluna permanente. “Créditos e privacidade” expõe os
valores do servidor e a retenção; o total continua visível na confirmação final.
Boas-vindas e transições são apresentação local. As perguntas adaptativas e os
contratos de sessão, recuperação e criação continuam no servidor.

1. Descreva uma ideia de até 4000 caracteres. A primeira pergunta vem da IA.
2. Responda à entrevista: uma pergunta por vez, até oito perguntas, aproveitando
   as respostas anteriores. **Sugira para mim** delega uma decisão ao assistente.
   **Revisar ideia** encerra a entrevista e abre a revisão do briefing.
3. Confira o briefing de até 6000 caracteres, inclusive as sugestões e limites
   criativos. **Salvar briefing** preserva a revisão; **Gerar proposta do livro**
   produz título, gênero, sinopse e 12–20 fichas com atributos e relações.
4. Edite os metadados e as fichas. As fichas usam identificação direta e seções opcionais: altere um campo e salve sem percorrer etapas. Regenerar uma ficha preserva seus campos
   modificados manualmente, inclusive após salvar a revisão. Excluir exige
   confirmação e remove também as relações que apontam para a ficha.
   **Salvar revisão** e **Continuar para capa** persistem as alterações.
5. Revise a direção visual, gere uma capa, selecione pela biblioteca ou continue
   sem capa. Arte vertical 2:3, PNG 1200 × 1800, sem texto incorporado. Alterar
   título, gênero, sinopse ou direção visual invalida a seleção da capa anterior.
6. Confira o total e confirme **Criar livro**. O livro é um rascunho, sem
   capítulos; todas as fichas são lore local privado. Abra o Compêndio ou crie
   seu primeiro capítulo nos detalhes do livro.

O pacote textual custa **2 créditos**. A capa gerada acrescenta **5 créditos**;
reutilizar imagens não acrescenta custo. Conversar, gerar, revisar ou descartar
não debita saldo. A cobrança ocorre na confirmação final, junto das gravações.
Preços são fornecidos pelo servidor; uma alteração do preço exige nova revisão.

## Sessões e falhas

A última sessão do autor é retomada ao abrir a página. Conversa e briefing
ficam disponíveis por sete dias. Propostas e capas temporárias duram uma hora;
a expiração mantém os textos para revisão, mas exige gerar outra proposta para
criar o livro. Uma capa aceita entra permanentemente na biblioteca existente.
Começar outra ideia substitui a sessão oferecida para retomada. Alterações
locais da revisão precisam de **Salvar revisão** antes de sair.

Solicitações usam IDs e revisões estáveis. Uma resposta incerta bloqueia edição
até **Tentar novamente** recuperar a mesma operação. Rejeições definitivas
permitem corrigir os campos. A criação e o débito são transacionais; repetir a
confirmação não cria outra obra nem cobra novamente. Após recarregar, a página
oferece o link do último livro criado. Livros removidos não são recriados.

## Servidor e limites

`functions/src/assistedBook.mjs` concentra contratos, autorização, sessões,
entrevista, propostas, capas e criação. A callable `assistedBook` exige Auth e
App Check em `us-central1`, com timeout de 120 segundos. O provedor usa o
segredo e os modelos existentes; saída textual é JSON validado, separado da
extração de lore de capítulos. Nenhuma chave BYOK é enviada ou armazenada.

Entrevista e proposta enviam conversa/briefing ao provedor. Regenerar uma ficha
envia a proposta e a ficha completas, inclusive suas notas privadas, para manter
coerência. A capa recebe somente metadados e direção visual, sem as fichas.

Limites por autor: dez novas sessões e 60 operações por hora, incluindo falhas
e revisões salvas. Até 20 fichas e 220 mil caracteres por proposta, resumos de
140 caracteres, detalhes de 8000 e atributos de 4000 cada. A entrevista tem até
oito perguntas. Resultados incompletos ou relações inválidas são rejeitados.

As coleções privadas `users/{uid}/assistedSessions`, `assistedCurrent`,
`assistedLimits` e `assistedReceipts` são exclusivas do servidor. Cada sessão
mantém registros de operações. Recibos preservam a recuperação idempotente
de criações após a limpeza da conversa. A rotina `cleanupAssistedSessions`
remove até 100 sessões expiradas por hora; o índice de `expiresAt` está em
`firestore.indexes.json`. Capas temporárias reutilizam `bookGenerations` e sua
limpeza; capas aceitas reutilizam as referências de `imageLibrary`.

## Validação e liberação

Execute `npm ci --prefix functions`, `npm run validate`, `npm run test:rules`
e os testes visuais de criação assistida. Fixtures não acessam produção.
Implante, com autorização para o destino verificado, frontend, callable,
limpeza, regras e índice. Configure `BOOK_ASSISTED_CREDITS=2` junto dos
parâmetros de geração existentes e verifique cotas dos modelos. Faça uma
entrevista/geração/aceite controlados no destino antes de liberar o produto.
Esta implementação não implanta serviços nem gera chamadas reais de IA.

Sem geração de capítulos, publicação automática, BYOK, imagens de entidades
ou criação em universos compartilhados nesta versão.
