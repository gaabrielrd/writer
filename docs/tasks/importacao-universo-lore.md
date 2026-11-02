# Importação de universos e atualização de lore

Plano aprovado na conversa em 2026-11-02. Base: `codex/writer-v2`.
Worktree e branch dedicadas; testes/validação somente no final, antes de integrar.

## Objetivo e aceite

- Selecionar múltiplos PDFs/textos até 10 MB somados.
- Extrair textos e propor fichas com evidências, revisão e seleção explícitas.
- Criar novo universo ou adicionar entradas em universo existente.
- Atualizar fichas existentes com escolha de destino e diff do que entrou,
  saiu e foi ajustado; preservar campos protegidos e fichas não selecionadas.
- Confirmar gravações e crédito atomicamente, com retry idempotente.
- Validar localmente e integrar novamente em `codex/writer-v2`, sem push/deploy.

## Implementação

1. Extrator público completo e contratos de seleção/diff.
2. Sessões, upload privado limitado, análise por partes e consolidação.
3. Revisão editável, atualização explícita e confirmação recuperável.
4. Testes unitários/servidor/regras/visuais; revisão, documentação e entrega.
5. Gates finais e integração local após resultados aprovados.

Os detalhes executáveis e limites estão no
[contrato da funcionalidade](../universe-lore-import.md). O armazenamento temporário
usa partes privadas de Firestore para reutilizar o transporte e evitar uma nova
superfície de Storage. Não é restauração de backup, OCR, importação de imagens,
atualização automática nem implantação.
