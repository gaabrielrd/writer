# Editor de lore com navegação lateral

## Resultado local

O editor nativo do lore de livros substitui o seletor de campos por uma sidebar
vertical dentro do modal. O campo ativo fica centralizado na área à direita,
com largura de leitura de até 560 px. O modal tem até 1024 px e conserva ações
de preparar, revisar e aplicar no rodapé. A criação nativa reutiliza a composição.

Os oito campos têm ícones Lucide, seleção visível e indicação de mudanças
pendentes. Setas, Home e End navegam pelas abas; trocar de campo mantém o
rascunho e não envia pedidos. Os protocolos de captura, campos literais,
recuperação, autorização e confirmação foram preservados. O assistente continua
flutuante fora da caixa do modal.

## Validação

- Vitest de edição e criação: 42 testes aprovados, incluindo navegação por teclado,
  rascunho preservado e ausência de envio ao navegar.
- Typecheck aprovado.
- ESLint dos arquivos alterados, styleguide, arquitetura, documentação e diff
  sem erros; formatação aplicada com Prettier.
- Chromium: jornada real de editar, preparar, aplicar e reabrir o lore, com
  protocolos nativos locais, aprovada nos três temas desktop (três cenários).
- Captura do tema escuro inspecionada: sidebar à esquerda, campo centralizado
  à direita e assistente abaixo, fora da caixa do modal.

## Limites

Entrega local, sem commit, push ou deploy. `npm run validate` não executado,
pois não houve commit/merge. Dados, autenticação e banco são fictícios na
validação visual; não representa smoke autenticado em produção. Alterações
concorrentes no checkout foram preservadas.
