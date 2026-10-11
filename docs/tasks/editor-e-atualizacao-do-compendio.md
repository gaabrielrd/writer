# Editor e atualização do compêndio

Plano aprovado na conversa em 11/10/2026.

## Requisitos e critérios de aceite

- Voltar do editor abre o livro atual, inclusive por acesso direto à URL.
- Configurar IA fica no dropdown do usuário, com um diálogo compartilhado e atualização reativa do provedor.
- Editor com superfícies discretas, controles compactos, três temas e mobile sem transbordamento.
- Atualizar compêndio analisa somente o capítulo atual, incluindo alterações não salvas.
- Modal lista entidades conhecidas e novas, evidências, conflitos, campos atuais/propostos editáveis e seleção de alterações.
- Destino local/global escolhido explicitamente; global somente no universo vinculado.
- Análise não grava lore. Criações são privadas; atualizações preservam visibilidade, notas e relações.
- Aplicação atômica e idempotente: 1 crédito por lote da plataforma, zero com BYOK.
- Mudanças no texto, lore ou universo exigem nova análise. Falhas não geram aplicação parcial.

## Sequência

1. Corrigir retorno ao livro e centralizar configurações de IA.
2. Refinar editor e painel contextual.
3. Adicionar análise estruturada e revisão.
4. Aplicar lote no servidor com autorização, validação, concorrência e débito.
5. Testes unitários/backend, regras e navegador; validação, revisão e documentação.

## Fora do escopo

Análise do livro inteiro, publicação automática, alterações automáticas de notas privadas/relações e migração da cobrança das ferramentas antigas de escrita.

## Riscos

IA pode interpretar mal fatos: evidência e revisão humana são obrigatórias. Limites de entrada, saída e frequência são explícitos. Implantação das novas functions depende de autorização e configuração do ambiente.
