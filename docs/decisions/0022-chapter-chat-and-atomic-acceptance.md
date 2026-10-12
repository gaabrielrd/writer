# ADR 0022 — Chat por capítulo e aceite atômico

- **Status:** Aceito
- **Data:** 2026-10-12

## Contexto

O assistente de escrita usava modal, pedido isolado e o final do texto quando
não havia seleção. A experiência aprovada exige conversa persistente, contexto
pela seleção/cursor/viewport e o mesmo espaço lateral do compêndio. Conversar
não debita; aceitar uma sugestão da plataforma continua custando um crédito.

## Decisão

`EditorPage` compõe um único painel ativo. `editor` fornece captura geométrica e
transação de texto através de um contrato público de `ai-assistant`. A conversa
não recebe uma instância Tiptap nem conhece detalhes internos do editor.

Cada pedido conserva passagem, metadados, persona, lore relevante e hash do
alvo. Mensagens/conversas privadas ficam em subcoleções por autor e capítulo,
exclusivas do servidor. A callable valida autoria e existência mesmo para leitura.
Publicação e exportação permanecem baseadas apenas no manuscrito.

Geração da plataforma e seu histórico ficam em `functions`, reutilizando o
segredo e modelo existentes, com streaming da callable. BYOK mantém a chave
local e envia ao servidor somente contexto e saída. O servidor registra a origem
antes da geração: o cliente não pode converter uma sugestão da plataforma em BYOK.

Aceite salva capítulo, contagem, saldo e recibo numa transação Firestore.
Autosave e aceite passam pela mesma fila por capítulo. Hash do texto persistido
recusa conflito; a transação do editor preserva formatação externa e histórico.
O recibo tem identidade e conteúdo estáveis para recuperar respostas incertas.
Reaplicar uma sugestão já paga, inclusive após desfazer, não cobra novamente.

## Consequências

- Conversa gratuita tem cota de pedidos e limites de contexto/saída.
- Escrita continua durante a geração; mudanças no alvo exigem outro aceite
  com destino explícito ou nova geração.
- Histórico, rascunho e recibo de recuperação contêm texto privado; chaves não
  entram no armazenamento de conversa.
- Exclusão de livro/capítulo/perfil exige limpeza dos históricos privados.
- Liberação depende da callable, regras e triggers implantadas junto do frontend.
- Não há dependências novas nem migração de cobrança do autocomplete legado.

Veja [contrato do chat](../chapter-chat.md) e [plano aprovado](../tasks/assistente-ia-conversacional-no-editor.md).
