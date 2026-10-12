# Chat do Assistente IA no capítulo

**Assistente IA** abre um painel no mesmo espaço do **Compêndio**. Alternar ou
fechar conserva a conversa e o rascunho. No desktop ambos usam a largura
redimensionável do workspace: inicialmente 40%, faixa de 20–70%, painel mínimo
de 280 px e manuscrito mínimo de 400 px. Arraste o divisor ou use setas,
Shift+setas, Home/End; duplo clique restaura 40%. A proporção é salva por
usuário/navegador e conservada ao alternar. Até 760 px ou quando os mínimos
não couberem, ambos ficam empilhados, com largura disponível e 480 px de altura.
Falhas ao salvar a preferência conservam a largura da sessão e oferecem retry.
O manuscrito continua editável durante a geração.

**Tela cheia** ocupa a viewport do aplicativo e remove os limites de largura
do shell (1440 px) e do manuscrito (860 px). Créditos, tema, conta, ferramentas,
minimapa e painéis continuam disponíveis. Alternar conserva a instância de
edição, seleção, undo, trecho visível e rascunho do chat. Escape fecha primeiro
menus, diálogos, barra de seleção ou sugestão; sem sobreposição, sai do modo,
inclusive com foco no texto. Navegar entre capítulos conserva o modo; voltar
ao livro restaura o shell. Em telas estreitas, o conteúdo empilhado rola no main.

## Conversa e comandos

Enter envia; Shift+Enter insere uma linha. Composição IME não envia. Digitar `/`
abre busca por comandos, navegável com setas, Enter/Tab e Escape. Escolher um
comando somente prepara o pedido; o envio permanece explícito.

| Comando       | Resultado                                           |
| ------------- | --------------------------------------------------- |
| `/continuar`  | Continuação da cena                                 |
| `/reescrever` | Outra versão com instruções do autor                |
| `/estilo`     | Clareza, ritmo e expressão conforme a persona       |
| `/coerencia`  | Análise de compatibilidade com lore                 |
| `/revisar`    | Revisão e possível prosa corrigida                  |
| `/resumir`    | Resumo da passagem                                  |
| `/ideias`     | Possibilidades narrativas                           |
| `/contexto`   | Escolha seleção, cursor, viewport, capítulo ou auto |
| `/ajuda`      | Contexto e catálogo de comandos                     |

`/contexto` e `/ajuda` são controles locais e não chamam o provedor. Pedidos
livres também funcionam. As ações da seleção preenchem o campo do mesmo chat.
Respostas podem ser interrompidas, copiadas ou regeneradas. Editar o último
pedido exige confirmar a remoção das respostas posteriores; texto já aplicado
ao capítulo permanece. Excluir conversa também exige confirmação.

O histórico tem rolagem independente. Novas respostas acompanham a posição
somente quando o usuário está próximo do final; ao consultar mensagens
anteriores, **Novas mensagens** permite retornar ao fim.

## Contexto e privacidade

Automático prioriza seleção, cursor na região visível e viewport quando o cursor
está fora dela. É possível escolher a origem, inspecionar o trecho e fixá-lo.
O foco no chat não muda a seleção do manuscrito. Contextos incluem texto ainda
não salvo, metadados do livro/capítulo, persona efetiva e até 12 fichas
relevantes por nome/alias, identificadas como locais/globais. Detalhes de cada
ficha são limitados a 2000 caracteres; notas privadas não são incluídas.

Cada envio conserva seu contexto. Limites: pedido de 4000 caracteres, passagem
de 18000, entorno de 22000, persona de 36000, histórico recente de até 20 mensagens
e 32000 caracteres, resposta de 24000 e sugestão de 16000. Contextos extensos
são sinalizados e reduzidos. O chat não pesquisa automaticamente outros capítulos.

Conversas ficam em
`users/{uid}/chapterChats/{bookId}/chapters/{chapterId}/conversations` e mensagens
em sua subcoleção `messages`. O acesso é exclusivo da callable autenticada;
as regras impedem leitura e gravação direta, inclusive pelo próprio autor.
Conversas são paginadas em grupos de 20 e mensagens em grupos de 30.
Não há expiração automática: a exclusão do capítulo/livro/perfil aciona limpeza.
Publicação, exportação e backup do manuscrito não incluem o chat.

Rascunhos e pedidos de recuperação também têm cópia local privada por
conta/livro/capítulo/conversa, através de adaptadores. Dispositivos compartilhados
conservam esses dados no perfil do navegador. Chaves BYOK não entram em registros
de conversa nem em requisições da callable.

## Provedores, falhas e créditos

`functions/src/chapterChat.mjs` controla autoria, estados, origem do provedor,
limites, persistência e aceite. A callable `chapterChat` usa Auth/App Check,
`us-central1`, timeout de 120 segundos e o segredo existente
`BOOK_GENERATION_GEMINI_KEY` com `BOOK_SYNOPSIS_MODEL`. Geração da plataforma
ocorre no servidor; OpenAI/Gemini BYOK usam serviços locais. Os três caminhos
oferecem streaming real e conservam papéis do histórico.

Conversa, regeneração, cópia, descarte e falha não debitam créditos. Saldo zero
permite conversar. A primeira aplicação de uma sugestão da plataforma custa
**1 crédito**, informado na sugestão. BYOK e reaplicação de uma sugestão já paga
não debitam. Limite de 60 pedidos por autor/hora, incluindo falhas; uma geração
por conversa de cada vez. Cancelar mantém texto parcial sem tornar a saída aplicável.
Respostas parciais, mensagens interrompidas e suas cópias ocultam os marcadores
internos do protocolo de sugestão.

A prosa sugerida fica separada da explicação e entra no editor como texto seguro.
Seleção/cursor conservam hash SHA-256 e intervalo; viewport/capítulo exigem
**Escolher destino**. Texto, persona ou lore utilizado alterados bloqueiam aceite;
**Novo destino** apresenta outra prévia para confirmação explícita.

Aceite coordena autosave e transação do servidor: capítulo, contagem de palavras,
saldo e recibo são gravados juntos. O servidor compara o hash do conteúdo salvo
e registra a sugestão paga. A mesma operação retorna o mesmo recibo sem cobrar
novamente. O editor mantém desfazer/refazer. **Recuperar aceite** consulta o recibo
após resposta incerta, preservando alterações posteriores. Até recuperar, outra
aplicação permanece bloqueada. Capítulos aceitos têm limite de 800000 bytes UTF-8.

## Validação e implantação

```bash
npm ci --prefix functions
npm run validate
npm run test:rules
npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-chat.visual.ts
```

Fixtures isoladas não usam produção. Implantar, com autorização separada,
frontend, callable, regras e triggers `cleanupDeletedChapterChat`,
`cleanupDeletedUserChat` e `cleanupDeletedAccountChat`, junto da atualização de
`cleanupDeletedBookCover`. A limpeza de conta usa o evento de exclusão do Firebase
Auth; a limpeza de perfil também cobre exclusão administrativa no Firestore.
Não há nova dependência, segredo ou índice composto. Verificação da qualidade
literária e conectividade dos provedores no destino continua sendo uma etapa
de liberação controlada. As ferramentas antigas de autocomplete mantêm seus
contratos de geração e cobrança.
