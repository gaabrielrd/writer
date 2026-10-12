# Assistente IA conversacional no editor

Plano aprovado na conversa em 12/10/2026. Uma fase completa com 12 tarefas.

## Requisitos aprovados

- Assistente IA e Compêndio compartilham o mesmo espaço lateral, com um painel ativo.
- Chat com comandos `/`, respostas progressivas, parar, copiar, retry, regenerar e editar pedido.
- Contexto explícito: seleção, cursor visível ou viewport; escolha manual e contexto fixado.
- Incluir alterações não salvas, metadados, persona, lore relevante e histórico limitado.
- Conversas privadas por capítulo, salvas e retomáveis; rascunho preservado.
- Conversa sem débito, inclusive com saldo zero. Aplicar sugestão da plataforma custa
  um crédito; BYOK e reaplicação de uma sugestão já paga não debitam.
- Aplicação explícita, alvo validado, desfazer/refazer, autosave coordenado e recibo
  para recuperar respostas incertas sem duplicar texto ou cobrança.
- Três temas, desktop/celular e 320 px, com navegação por teclado.

## Sequência

1. Contratos e estados de conversas, mensagens, contextos, sugestões e operações.
2. Espaço lateral único, preservando seleção, minimapa e foco.
3. Captura real da seleção, cursor, entorno e viewport interna/documental.
4. Composição limitada, inspeção, escolha manual e contexto fixado.
5. Persistência privada, paginação, retomada, rascunho e exclusão.
6. Geração conversacional com streaming na plataforma e nos dois provedores BYOK.
7. Interface completa do chat, falhas, cancelamento e controle da rolagem.
8. Catálogo `/`, parâmetros e navegação acessível.
9. Integração das ações existentes de seleção com a mesma conversa.
10. Aceite transacional, cobrança idempotente, concorrência e recuperação.
11. Testes de comportamento, backend, regras reais e navegador.
12. Validação, revisão, documentação e evidência da entrega.

## Critérios de aceite

- Apenas um painel ocupa o espaço lateral; dimensões iguais ao compêndio.
- Mensagens e rascunhos retornam ao reabrir/recarregar e ficam isolados por autor/capítulo.
- Selecionar, focar, mover o cursor e rolar não geram respostas automaticamente.
- Cursor fora da região visível usa a passagem visível como contexto.
- Cada mensagem conserva seu contexto e as sugestões exigem destino explícito.
- Resposta interrompida/tardia não altera o manuscrito nem outra sessão.
- Texto, persona ou lore desatualizados impedem o aceite.
- Aceite não duplica texto/débito; falha transacional mantém o capítulo original.
- Desfazer mantém histórico; reaplicar uma sugestão paga não cobra novamente.
- Conversa, contexto e prompts não integram publicação nem exportação.
- `npm run validate`, regras reais e testes de navegador passam; documentação e
  entrega registram os resultados observados.

## Fora do escopo

Pesquisa na internet, anexos, voz, mutações autônomas de lore, edição de vários
capítulos, busca semântica no livro inteiro e migração da cobrança do autocomplete.
Implantação e verificação com provedores de produção exigem autorização separada.
