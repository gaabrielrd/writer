# ADR 0015 — Editor rico transacional e conteúdo compatível

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

A tarefa 04 exige edição WYSIWYG, marcações de lore durante a escrita, seleção
estável, atalhos, histórico e composição IME. A implementação anterior era uma
textarea de Markdown com uma prévia parcial. Reescrever o HTML de um
contenteditable a cada tecla perderia seleção, histórico e composição. Criar
esse motor manualmente ampliaria o risco de perda de manuscritos.

Capítulos existentes usam uma string: Markdown escrito no editor anterior ou
HTML importado de documentos. Abrir um capítulo não pode executar uma migração
persistida nem sobrescrever o original antes de uma edição explícita.

## Decisão

Usar os pacotes MIT `@tiptap/react`, `@tiptap/starter-kit` e `@tiptap/pm`, sobre
ProseMirror, para o documento, transações, seleção, histórico, entrada IME,
colagem e atalhos. O StarterKit oferece títulos, parágrafos, negrito, itálico,
citação, listas, links e blocos de código. A interface continua em CSS Modules,
com tokens semânticos e os três temas existentes; nenhum kit visual externo é
adicionado.

### Formato e compatibilidade

- A coluna `Chapter.content` continua sendo uma string. Na abertura,
  `renderRichText` interpreta Markdown legado ou HTML importado e produz o
  subconjunto seguro de prosa compartilhado com leitura e exportação.
- A carga inicial, alternância entre escrita/leitura, movimento de cursor e
  atualização das entidades não disparam `onChange` nem salvamento.
- Somente uma transação que altera o documento emite HTML semântico pelo
  `editor.getHTML()`. Essa é a conversão incremental de capítulos antigos; não
  há migração destrutiva em lote nem mudança compulsória ao abrir a página.
- HTML ativo, eventos, estilos arbitrários, imagens remotas e metadados de lore
  não integram o formato persistido. O sanitizador mantém texto e estruturas de
  prosa suportadas. Importação não promete reproduzir diagramação de documentos
  de escritório, tabelas ou mídia: o foco é conteúdo narrativo seguro.
- A mesma função sanitiza HTML colado antes de entrar no esquema. Texto vindo da
  IA entra como nós de texto, nunca como HTML executável.
- O eco do conteúdo emitido pelo autosave não chama `setContent`. Cada sessão de
  capítulo tem identidade própria para que desfazer nunca restaure outro
  capítulo.

### Lore, menções e sugestões

Marcações de lore usam decorações de ProseMirror, sem alterar o documento e sem
entrar em HTML salvo, clipboard ou histórico. A busca considera o texto de cada
bloco, inclusive nomes divididos por negrito/itálico, e ignora blocos de código.
O resolvedor de sobreposição mantém a preferência ponderada por termos longos;
a busca do intervalo anterior compatível usa busca binária, evitando a etapa
quadrática em conjuntos grandes de candidatos.

O menu `@` preserva o intervalo do documento, busca nomes, aliases e categorias e permite
setas, Enter, Tab e Escape. Endereços de e-mail não abrem menções. Termos sem
resultado podem abrir o formulário existente com o nome preenchido; cancelar
preserva o texto. A ficha completa pode ser consultada no painel lateral sem
recriar o editor. Fechar o painel devolve o foco à seleção do manuscrito.

Sugestões preditivas também são decorações temporárias, em texto translúcido
junto ao cursor. Os controles acessíveis de aceitar/descartar continuam fora do
documento. Aplicações assíncronas de IA capturam documento/seleção e validam o
alvo antes de debitar; a edição fica bloqueada durante a aplicação, e a página
recebe o estado ocupado para proteger a navegação. Conteúdo e cursor alterados
invalidam sugestões e respostas antigas.

## Consequências

- Três dependências novas e maior bundle em troca de um motor de edição e
  histórico mantido, em vez de uma implementação artesanal de contenteditable.
- O conteúdo salvo após edição é HTML semântico, sem os marcadores Markdown
  originais. Markdown continua sendo um formato de entrada e de exportação.
- A suíte testa resultados observáveis: formatação, seleção, desfazer/refazer,
  segurança de colagem, HTML/Markdown legados sem gravação ao abrir, menções,
  fichas, composição, eco do autosave e aceitação assíncrona de IA.
- Testes reais de navegador são necessários além de jsdom para seleção,
  composição, navegação interrompida, dispositivos estreitos e temas.

## Referências

- [Tarefa 04](../tasks/04-editor-wysiwyg-e-lore-integrado.md)
- [Integração React do Tiptap](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Extensões e plugins](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension)
- [Comando setContent](https://tiptap.dev/docs/editor/api/commands/content/set-content)
